import React, { useCallback, useEffect, useState } from 'react';
import { Linking, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Btn, Card, Field, Row, Txt, useDialog, useTheme } from '../components/ui';
import { useSession } from '../lib/store';
import { DEFAULT_BASE_URL, normalizeBaseUrl } from '../lib/api';
import { errorText } from '../lib/errors';

type Mode = 'key' | 'device' | 'demo';

export default function LoginScreen({ onConnected }: { onConnected?: () => void } = {}) {
  const t = useTheme();
  const dialog = useDialog();
  const { signInWithKey, startDeviceLogin, pollDeviceLogin, startDemo } = useSession();
  const [mode, setMode] = useState<Mode>('key');
  const [apiKey, setApiKey] = useState('');
  const [baseUrl, setBaseUrl] = useState(DEFAULT_BASE_URL);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [device, setDevice] = useState<any>(null);
  const [deviceStatus, setDeviceStatus] = useState<string | null>(null);

  useEffect(() => {
    if (!device) return undefined;
    let cancelled = false;
    const timer = setInterval(async () => {
      try {
        await pollDeviceLogin(device.deviceCode, device.baseUrl);
        if (!cancelled) {
          setDeviceStatus('Angemeldet');
          onConnected?.();
        }
      } catch (e: any) {
        const code = e?.code;
        if (code === 'authorization_pending' || code === 'slow_down') return;
        if (!cancelled) {
          setError(errorText(e));
          setDevice(null);
        }
      }
    }, Math.max(3, device.interval || 5) * 1000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [device, pollDeviceLogin]);

  const connect = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      await signInWithKey('API-Schlüssel', apiKey, baseUrl);
      onConnected?.();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }, [apiKey, baseUrl, signInWithKey]);

  const requestDevice = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const start = await startDeviceLogin(baseUrl);
      setDevice(start);
      setDeviceStatus('Warte auf Bestätigung …');
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }, [baseUrl, startDeviceLogin]);

  const enterDemo = useCallback(async () => {
    setBusy(true);
    try {
      await startDemo();
      onConnected?.();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }, [startDemo]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.bg }} edges={['top', 'left', 'right', 'bottom']}>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
        <View style={styles.brandRow}>
          <View style={[styles.logo, { backgroundColor: t.accent }]}>
            <Ionicons name="cube" size={26} color={t.dark ? '#04140A' : '#fff'} />
          </View>
          <View style={{ flex: 1 }}>
            <Txt variant="display">InstaBox Pilot</Txt>
            <Txt variant="small" color={t.muted} style={{ marginTop: 2 }}>
              Maschinen, Zugänge und KI-Assistent für instabox.sh
            </Txt>
          </View>
        </View>

        <View style={[styles.segment, { backgroundColor: t.surfaceAlt, borderColor: t.border }]}>
          {(
            [
              { id: 'key', label: 'API-Schlüssel' },
              { id: 'device', label: 'Konto' },
              { id: 'demo', label: 'Demo' },
            ] as { id: Mode; label: string }[]
          ).map((item) => {
            const active = mode === item.id;
            return (
              <Pressable
                key={item.id}
                onPress={() => {
                  setMode(item.id);
                  setError(null);
                }}
                style={{
                  flex: 1,
                  paddingVertical: 9,
                  borderRadius: 9,
                  alignItems: 'center',
                  backgroundColor: active ? t.surface : 'transparent',
                  borderWidth: 1,
                  borderColor: active ? t.border : 'transparent',
                }}
              >
                <Txt variant="small" color={active ? t.text : t.muted} style={{ fontWeight: '700' }}>
                  {item.label}
                </Txt>
              </Pressable>
            );
          })}
        </View>

        {mode === 'key' ? (
          <Card style={{ gap: 14 }}>
            <View style={{ gap: 4 }}>
              <Txt variant="heading">Mit API-Schlüssel anmelden</Txt>
              <Txt variant="small" color={t.muted} style={{ lineHeight: 19 }}>
                Der Schlüssel kommt aus dem Dashboard unter „API keys“. Er erreicht nur den Workspace, für den
                er erstellt wurde.
              </Txt>
            </View>
            <Field
              label="API-Schlüssel"
              value={apiKey}
              onChangeText={setApiKey}
              placeholder="ibk_…"
              secure
              autoCapitalize="none"
              returnKeyType="go"
              onSubmitEditing={connect}
            />
            <Btn
              title="Verbinden"
              kind="primary"
              icon="flash"
              loading={busy}
              disabled={!apiKey.trim()}
              onPress={connect}
            />
            <Pressable onPress={() => setShowAdvanced((v) => !v)}>
              <Row gap={6}>
                <Ionicons name={showAdvanced ? 'chevron-down' : 'chevron-forward'} size={14} color={t.faint} />
                <Txt variant="small" color={t.faint}>
                  Erweiterte Einstellungen
                </Txt>
              </Row>
            </Pressable>
            {showAdvanced ? (
              <Field
                label="API-Basis-URL"
                value={baseUrl}
                onChangeText={setBaseUrl}
                placeholder={DEFAULT_BASE_URL}
                keyboardType="url"
                hint="Für einen eigenen Proxy oder ein selbst gehostetes instabox.sh."
              />
            ) : null}
          </Card>
        ) : null}

        {mode === 'device' ? (
          <Card style={{ gap: 14 }}>
            <View style={{ gap: 4 }}>
              <Txt variant="heading">Mit InstaBox-Konto anmelden</Txt>
              <Txt variant="small" color={t.muted} style={{ lineHeight: 19 }}>
                Der Geräte-Code erlaubt den vollen Zugriff: API-Schlüssel verwalten, Sessions, Vault, Workspaces
                und Billing.
              </Txt>
            </View>
            {!device ? (
              <Btn title="Geräte-Code anfordern" kind="primary" icon="qr-code" loading={busy} onPress={requestDevice} />
            ) : (
              <View style={{ gap: 12 }}>
                <View style={[styles.codeBox, { backgroundColor: t.surfaceAlt, borderColor: t.border }]}>
                  <Txt variant="caption" color={t.faint}>
                    Dein Code
                  </Txt>
                  <Txt variant="display" style={{ letterSpacing: 3, fontSize: 26 }}>
                    {device.userCode}
                  </Txt>
                  <Txt variant="small" color={t.muted}>
                    {deviceStatus}
                  </Txt>
                </View>
                <Btn
                  title="Code bestätigen"
                  icon="open-outline"
                  onPress={() =>
                    Linking.openURL(device.verificationUriComplete || device.verificationUri).catch(() => {})
                  }
                />
              </View>
            )}
          </Card>
        ) : null}

        {mode === 'demo' ? (
          <Card style={{ gap: 14 }}>
            <View style={{ gap: 4 }}>
              <Txt variant="heading">Demo-Modus</Txt>
              <Txt variant="small" color={t.muted} style={{ lineHeight: 19 }}>
                Alle Oberflächen mit simulierten Maschinen, ohne echte InstaBox. Ideal, um die App und die
                Desktop-Skalierung zu testen. Es werden keine Daten übertragen.
              </Txt>
            </View>
            <Btn title="Demo starten" kind="primary" icon="play" loading={busy} onPress={enterDemo} />
          </Card>
        ) : null}

        {error ? (
          <View style={{ marginTop: 14 }}>
            <Card style={{ borderColor: t.red, backgroundColor: t.redSoft }}>
              <Row gap={8} align="flex-start">
                <Ionicons name="alert-circle" size={18} color={t.red} />
                <Txt variant="small" color={t.red} style={{ flex: 1, lineHeight: 19 }}>
                  {error}
                </Txt>
              </Row>
            </Card>
          </View>
        ) : null}

        <View style={{ marginTop: 22, gap: 8 }}>
          <Txt variant="caption" color={t.faint}>
            Links
          </Txt>
          <Pressable onPress={() => Linking.openURL('https://instabox.sh').catch(() => {})}>
            <Row gap={8}>
              <Ionicons name="globe-outline" size={16} color={t.muted} />
              <Txt variant="small" color={t.muted}>
                instabox.sh
              </Txt>
            </Row>
          </Pressable>
          <Pressable onPress={() => Linking.openURL('https://dashboard.instabox.sh/dashboard/api-keys').catch(() => {})}>
            <Row gap={8}>
              <Ionicons name="key-outline" size={16} color={t.muted} />
              <Txt variant="small" color={t.muted}>
                API-Schlüssel im Dashboard
              </Txt>
            </Row>
          </Pressable>
        </View>

        {Platform.OS === 'web' ? (
          <View style={{ marginTop: 18 }}>
            <Card style={{ borderColor: t.border }}>
              <Txt variant="small" color={t.faint} style={{ lineHeight: 19 }}>
                Hinweis für die Browser-Version: Die InstaBox-API erlaubt CORS nur für das eigene Dashboard.
                Im Browser funktionieren daher nur der Demo-Modus und ein selbst gesetzter Proxy als API-Basis-URL.
                Auf iOS und Android gibt es keine Einschränkung.
              </Txt>
            </Card>
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 22 },
  logo: { width: 52, height: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  segment: { flexDirection: 'row', padding: 4, borderRadius: 13, borderWidth: 1, marginBottom: 18, gap: 4 },
  codeBox: { borderRadius: 14, borderWidth: 1, padding: 16, gap: 6, alignItems: 'center' },
});
