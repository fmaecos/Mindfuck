import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { ApiClient, DEFAULT_BASE_URL, normalizeBaseUrl } from './api';
import { ApiError } from './errors';
import type { Me, Org } from './types';
import { randomId } from './format';

export type SessionKind = 'key' | 'session' | 'demo';

export type Session = {
  id: string;
  label: string;
  kind: SessionKind;
  baseUrl: string;
  orgId?: string;
  apiKey?: string;
  accessToken?: string;
  refreshToken?: string;
  accessExpiresAt?: string;
  refreshExpiresAt?: string;
  createdAt: number;
};

const INDEX_KEY = 'instabox.pilot.sessions.v1';
const ACTIVE_KEY = 'instabox.pilot.active.v1';
const SETTINGS_KEY = 'instabox.pilot.settings.v1';
const OPENAI_KEY = 'instabox.pilot.openaiKey';

const secretKey = (id: string) => `instabox.pilot.secret.${id}`;

async function writeSecret(key: string, value: string) {
  if (Platform.OS === 'web') {
    await AsyncStorage.setItem(key, value);
    return;
  }
  try {
    await SecureStore.setItemAsync(key, value, { keychainAccessible: SecureStore.WHEN_UNLOCKED });
  } catch (e) {
    await AsyncStorage.setItem(key, value);
  }
}

async function readSecret(key: string): Promise<string | null> {
  if (Platform.OS === 'web') return AsyncStorage.getItem(key);
  try {
    const value = await SecureStore.getItemAsync(key);
    if (value !== null) return value;
  } catch (e) {
    /* fall through */
  }
  return AsyncStorage.getItem(key);
}

async function deleteSecret(key: string) {
  if (Platform.OS !== 'web') {
    try {
      await SecureStore.deleteItemAsync(key);
    } catch (e) {
      /* ignore */
    }
  }
  await AsyncStorage.removeItem(key);
}

export type AppSettings = {
  themeMode: 'system' | 'dark' | 'light';
  openaiKey: string;
  openaiModel: string;
};

const defaultSettings: AppSettings = {
  themeMode: 'system',
  openaiKey: '',
  openaiModel: 'gpt-6-luna',
};

type SessionContextValue = {
  ready: boolean;
  sessions: Session[];
  session: Session | null;
  client: ApiClient | null;
  me: Me | null;
  orgs: Org[];
  settings: AppSettings;
  identityError: string | null;
  refreshIdentity: () => Promise<void>;
  signInWithKey: (label: string, apiKey: string, baseUrl?: string) => Promise<Session>;
  startDeviceLogin: (baseUrl?: string, invite?: string) => Promise<any>;
  pollDeviceLogin: (deviceCode: string, baseUrl?: string) => Promise<Session>;
  startDemo: () => Promise<Session>;
  signOut: () => Promise<void>;
  switchSession: (id: string) => Promise<void>;
  removeSession: (id: string) => Promise<void>;
  saveSettings: (patch: Partial<AppSettings>) => Promise<void>;
};

const SessionContext = createContext<SessionContextValue | null>(null);

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used inside <SessionProvider>');
  return ctx;
}

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [identityError, setIdentityError] = useState<string | null>(null);
  const [settings, setSettings] = useState<AppSettings>(defaultSettings);
  const refreshPromise = useRef<Promise<string | null> | null>(null);
  const sessionRef = useRef<Session | null>(null);

  const session = useMemo(() => sessions.find((s) => s.id === activeId) || null, [sessions, activeId]);
  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  const persist = useCallback(async (list: Session[], active: string | null) => {
    const meta = list.map((s) => ({ ...s, apiKey: undefined, accessToken: undefined, refreshToken: undefined }));
    await AsyncStorage.setItem(INDEX_KEY, JSON.stringify(meta));
    for (const s of list) {
      const payload = JSON.stringify({
        apiKey: s.apiKey,
        accessToken: s.accessToken,
        refreshToken: s.refreshToken,
        accessExpiresAt: s.accessExpiresAt,
        refreshExpiresAt: s.refreshExpiresAt,
      });
      if (payload.replace(/[{}"]/g, '').length > 4) await writeSecret(secretKey(s.id), payload);
    }
    if (active) await AsyncStorage.setItem(ACTIVE_KEY, active);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const [indexRaw, activeRaw, settingsRaw] = await Promise.all([
          AsyncStorage.getItem(INDEX_KEY),
          AsyncStorage.getItem(ACTIVE_KEY),
          AsyncStorage.getItem(SETTINGS_KEY),
        ]);
        if (settingsRaw) {
          try {
            setSettings({ ...defaultSettings, ...JSON.parse(settingsRaw) });
          } catch (e) {
            /* ignore */
          }
        }
        const openaiKey = await readSecret(OPENAI_KEY);
        if (openaiKey) {
          setSettings((prev) => ({ ...prev, openaiKey }));
        }
        if (indexRaw) {
          const meta = JSON.parse(indexRaw) as Session[];
          const restored: Session[] = [];
          for (const s of meta) {
            const raw = await readSecret(secretKey(s.id));
            let secrets: any = {};
            if (raw) {
              try {
                secrets = JSON.parse(raw);
              } catch (e) {
                secrets = {};
              }
            }
            restored.push({ ...s, ...secrets });
          }
          setSessions(restored);
          if (activeRaw && restored.some((s) => s.id === activeRaw)) setActiveId(activeRaw);
        }
      } catch (e) {
        /* ignore */
      } finally {
        setReady(true);
      }
    })();
  }, []);

  const saveSessions = useCallback(
    async (list: Session[], active: string | null) => {
      setSessions(list);
      setActiveId(active);
      await persist(list, active);
    },
    [persist]
  );

  const upsertSession = useCallback(
    async (sessionToSave: Session, makeActive = true) => {
      const exists = sessions.some((s) => s.id === sessionToSave.id);
      const list = exists
        ? sessions.map((s) => (s.id === sessionToSave.id ? sessionToSave : s))
        : [...sessions, sessionToSave];
      const active = makeActive ? sessionToSave.id : activeId;
      await saveSessions(list, active);
      return sessionToSave;
    },
    [sessions, activeId, saveSessions]
  );

  const getAuth = useCallback(async (): Promise<string | null> => {
    const current = sessionRef.current;
    if (!current) return null;
    if (current.kind === 'demo') return null;
    if (current.kind === 'key') return `Bearer ${current.apiKey}`;
    const expiresAt = current.accessExpiresAt ? new Date(current.accessExpiresAt).getTime() : 0;
    if (current.accessToken && expiresAt > Date.now() + 60_000) {
      return `Bearer ${current.accessToken}`;
    }
    if (!current.refreshToken) {
      throw new ApiError(401, { code: 'session_expired', message: 'Die Anmeldung ist abgelaufen. Bitte erneut anmelden.' });
    }
    if (refreshPromise.current) return refreshPromise.current;
    const promise = (async () => {
      const response = await fetch(`${current.baseUrl}/v1/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: current.refreshToken }),
      });
      const text = await response.text();
      let data: any = null;
      try {
        data = JSON.parse(text);
      } catch (e) {
        data = null;
      }
      if (!response.ok) {
        throw new ApiError(response.status, data?.error || { code: 'session_expired', message: 'Neuanmeldung nötig.' });
      }
      const updated: Session = {
        ...current,
        accessToken: data.accessToken,
        refreshToken: data.refreshToken,
        accessExpiresAt: data.accessExpiresAt,
        refreshExpiresAt: data.refreshExpiresAt,
      };
      const list = sessionsRef.current.map((s) => (s.id === updated.id ? updated : s));
      await saveSessions(list, activeIdRef.current);
      return `Bearer ${data.accessToken}`;
    })();
    refreshPromise.current = promise;
    try {
      return await promise;
    } finally {
      refreshPromise.current = null;
    }
  }, [saveSessions]);

  const sessionsRef = useRef<Session[]>([]);
  const activeIdRef = useRef<string | null>(null);
  useEffect(() => {
    sessionsRef.current = sessions;
  }, [sessions]);
  useEffect(() => {
    activeIdRef.current = activeId;
  }, [activeId]);

  const client = useMemo(() => {
    if (!session) return null;
    return new ApiClient({
      baseUrl: session.baseUrl,
      demo: session.kind === 'demo',
      getAuth,
    });
  }, [session, getAuth]);

  const refreshIdentity = useCallback(async () => {
    if (!client) {
      setMe(null);
      setOrgs([]);
      return;
    }
    if (client.demo) {
      setIdentityError(null);
      return;
    }
    try {
      const [meRes, orgRes] = await Promise.all([
        client.get<Me>('/v1/me'),
        client.get<{ orgs: Org[] }>('/v1/orgs').catch(() => ({ orgs: [] })),
      ]);
      setMe(meRes);
      setOrgs(orgRes.orgs || []);
      setIdentityError(null);
    } catch (e: any) {
      setIdentityError(e?.message || 'Konto konnte nicht geladen werden.');
    }
  }, [client]);

  useEffect(() => {
    if (!client) return;
    setMe(null);
    setOrgs([]);
    refreshIdentity();
  }, [client, refreshIdentity]);

  const signInWithKey = useCallback(
    async (label: string, apiKey: string, baseUrl?: string) => {
      const url = normalizeBaseUrl(baseUrl || DEFAULT_BASE_URL);
      const testClient = new ApiClient({ baseUrl: url, getAuth: async () => `Bearer ${apiKey.trim()}` });
      await testClient.get('/v1/me');
      const newSession: Session = {
        id: randomId(),
        label: label || 'API-Schlüssel',
        kind: 'key',
        baseUrl: url,
        apiKey: apiKey.trim(),
        createdAt: Date.now(),
      };
      await upsertSession(newSession);
      return newSession;
    },
    [upsertSession]
  );

  const startDeviceLogin = useCallback(async (baseUrl?: string, invite?: string) => {
    const url = normalizeBaseUrl(baseUrl || DEFAULT_BASE_URL);
    const response = await fetch(`${url}/v1/auth/device`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(invite ? { invite } : {}),
    });
    const text = await response.text();
    let data: any = null;
    try {
      data = JSON.parse(text);
    } catch (e) {
      data = null;
    }
    if (!response.ok) {
      throw new ApiError(response.status, data?.error || { code: 'bad_request', message: 'Geräte-Anmeldung nicht möglich.' });
    }
    return { ...data, baseUrl: url };
  }, []);

  const pollDeviceLogin = useCallback(async (deviceCode: string, baseUrl?: string) => {
    const url = normalizeBaseUrl(baseUrl || DEFAULT_BASE_URL);
    const response = await fetch(`${url}/v1/auth/device/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceCode }),
    });
    const text = await response.text();
    let data: any = null;
    try {
      data = JSON.parse(text);
    } catch (e) {
      data = null;
    }
    if (!response.ok) {
      throw new ApiError(response.status, data?.error || { code: 'authorization_pending', message: 'Noch nicht bestätigt.' });
    }
    const newSession: Session = {
      id: randomId(),
      label: data?.login ? `InstaBox (${data.login})` : 'InstaBox-Konto',
      kind: 'session',
      baseUrl: url,
      accessToken: data.accessToken,
      refreshToken: data.refreshToken,
      accessExpiresAt: data.accessExpiresAt,
      refreshExpiresAt: data.refreshExpiresAt,
      createdAt: Date.now(),
    };
    await upsertSession(newSession);
    return newSession;
  }, [upsertSession]);

  const startDemo = useCallback(async () => {
    const newSession: Session = {
      id: randomId(),
      label: 'Demo (offline)',
      kind: 'demo',
      baseUrl: 'demo://instabox',
      createdAt: Date.now(),
    };
    await upsertSession(newSession);
    return newSession;
  }, [upsertSession]);

  const signOut = useCallback(async () => {
    const current = sessionRef.current;
    if (current && current.kind === 'session' && current.accessToken) {
      try {
        await fetch(`${current.baseUrl}/v1/auth/logout`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${current.accessToken}` },
        });
      } catch (e) {
        /* ignore */
      }
    }
    const list = sessionsRef.current.filter((s) => s.id !== current?.id);
    await saveSessions(list, list[0]?.id ?? null);
  }, [saveSessions]);

  const switchSession = useCallback(
    async (id: string) => {
      const list = sessionsRef.current;
      await saveSessions(list, id);
    },
    [saveSessions]
  );

  const removeSession = useCallback(
    async (id: string) => {
      await deleteSecret(secretKey(id));
      const list = sessionsRef.current.filter((s) => s.id !== id);
      const nextActive = activeIdRef.current === id ? list[0]?.id ?? null : activeIdRef.current;
      await saveSessions(list, nextActive);
    },
    [saveSessions]
  );

  const saveSettings = useCallback(async (patch: Partial<AppSettings>) => {
    const next = { ...settingsRef.current, ...patch };
    setSettings(next);
    const { openaiKey, ...rest } = next;
    await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(rest));
    if (openaiKey) await writeSecret(OPENAI_KEY, openaiKey);
    else await deleteSecret(OPENAI_KEY);
  }, []);

  const settingsRef = useRef<AppSettings>(defaultSettings);
  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  const value: SessionContextValue = {
    ready,
    sessions,
    session,
    client,
    me,
    orgs,
    settings,
    identityError,
    refreshIdentity,
    signInWithKey,
    startDeviceLogin,
    pollDeviceLogin,
    startDemo,
    signOut,
    switchSession,
    removeSession,
    saveSettings,
  };

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}
