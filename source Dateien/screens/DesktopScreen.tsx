import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Clipboard from 'expo-clipboard';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRoute, RouteProp } from '@react-navigation/native';
import { BridgeView, BridgeHandle, BridgeMessage } from '../components/BridgeView';
import { Btn, Card, Chip, Row, Txt, useDialog, useTheme } from '../components/ui';
import { DESKTOP_HTML } from '../lib/generated/viewers';
import { useSession } from '../lib/store';
import { requestAccess, toWebSocketUrl } from '../lib/connect';
import { errorText } from '../lib/errors';
import { useAsync } from '../lib/hooks';
import type { DesktopState, Machine } from '../lib/types';
import type { RootStackParamList } from '../navigation/types';
import { base64ToBytes, bytesToBase64 } from '../lib/b64';

const RESOLUTIONS = [
  { w: 1280, h: 800, label: '1280 × 800' },
  { w: 1440, h: 900, label: '1440 × 900' },
  { w: 1920, h: 1080, label: '1920 × 1080' },
  { w: 2560, h: 1440, label: '2560 × 1440' },
];

export default function DesktopScreen() {
  const t = useTheme();
  const route = useRoute<RouteProp<RootStackParamList, 'Desktop'>>();
  const dialog = useDialog();
  const { client, session } = useSession();
  const bridge = useRef<BridgeHandle>(null);
  const socket = useRef<WebSocket | null>(null);
  const [viewerReady, setViewerReady] = useState(false);
  const [status, setStatus] = useState<'idle' | 'connecting' | 'ready' | 'error'>('idle');
  const [message, setMessage] = useState<string | null>(null);
  const [viewOnly, setViewOnly] = useState(true);
  const [resolution, setResolution] = useState(RESOLUTIONS[0]);
  const [busy, setBusy] = useState(false);

  const machine = useAsync(async () => {
    if (!client) return null;
    return client.get<Machine>(`/v1/machines/${route.params.id}`);
  }, [client, route.params.id]);

  const desktop = useAsync(async () => {
    if (!client) return null;
    try {
      return await client.post<DesktopState>(`/v1/machines/${route.params.id}/desktop`, { action: 'status' });
    } catch (e) {
      return null;
    }
  }, [client, route.params.id]);

  const closeSocket = useCallback(() => {
    if (socket.current) {
      try {
        socket.current.close();
      } catch (e) {
        /* ignore */
      }
      socket.current = null;
    }
  }, []);

  useEffect(() => closeSocket, [closeSocket]);

  const connect = useCallback(async () => {
    if (!client || !viewerReady) return;
    closeSocket();
    setStatus('connecting');
    setMessage(null);
    try {
      const access = await requestAccess(client, route.params.id, 'vnc');
      if (client.demo) {
        setStatus('ready');
        return;
      }
      const url = toWebSocketUrl(access.url);
      const headers = Platform.OS === 'web' ? undefined : await client.getAuth?.();
      const ws = new (WebSocket as any)(
        url,
        access.protocols.length ? access.protocols : undefined,
        headers ? { headers: { Authorization: headers } } : undefined
      );
      socket.current = ws;
      try {
        (ws as any).binaryType = 'arraybuffer';
      } catch (e) {
        /* ignore */
      }
      ws.onopen = () => {
        setStatus('ready');
        bridge.current?.post({ type: 'sock', payload: { kind: 'open' } });
      };
      ws.onmessage = (event: any) => {
        const data = event?.data;
        if (typeof data === 'string') {
          bridge.current?.post({ type: 'sock', payload: { kind: 'send', b64: bytesToBase64(new TextEncoder().encode(data)) } });
        } else if (data) {
          const view = data instanceof ArrayBuffer ? new Uint8Array(data) : new Uint8Array(data.buffer || data);
          bridge.current?.post({ type: 'sock', payload: { kind: 'send', b64: bytesToBase64(view) } });
        }
      };
      ws.onerror = () => {
        setStatus('error');
        setMessage('Die Verbindung zum Desktop ist fehlgeschlagen.');
        bridge.current?.post({ type: 'sock', payload: { kind: 'error', message: 'Verbindungsfehler.' } });
      };
      ws.onclose = (event: any) => {
        bridge.current?.post({ type: 'sock', payload: { kind: 'close', code: event?.code, reason: event?.reason } });
      };
    } catch (e) {
      setStatus('error');
      setMessage(errorText(e));
    }
  }, [client, closeSocket, route.params.id, viewerReady]);

  useEffect(() => {
    if (!viewerReady) return;
    const mode = client?.demo ? 'demo' : 'remote';
    bridge.current?.post({ type: 'init', mode, viewOnly: true, scaleMode: 'fit' });
  }, [viewerReady, client?.demo]);

  useEffect(() => {
    if (viewerReady && status === 'idle' && client && !client.demo) connect();
  }, [viewerReady, status, client, connect]);

  const onMessage = useCallback(
    async (msg: BridgeMessage) => {
      if (msg.type === 'sock' && msg.payload?.kind === 'send') {
        try {
          const bytes = base64ToBytes(msg.payload.b64);
          socket.current?.send(bytes.buffer as ArrayBuffer);
        } catch (e) {
          /* ignore */
        }
        return;
      }
      if (msg.type === 'control') {
        const action = msg.payload?.action;
        try {
          const state = await client?.post<DesktopState>(`/v1/machines/${route.params.id}/desktop`, { action });
          const nextViewOnly = action !== 'takeover';
          setViewOnly(nextViewOnly);
          bridge.current?.post({ type: 'control', payload: { viewOnly: nextViewOnly } });
          dialog.toast(
            nextViewOnly ? 'Du beobachtest den Desktop' : 'Du steuerst den Desktop jetzt',
            'success'
          );
          if (state?.controlError) dialog.toast(state.controlError, 'error');
        } catch (e) {
          dialog.toast(errorText(e), 'error');
        }
        return;
      }
      if (msg.type === 'reconnect') {
        connect();
        return;
      }
      if (msg.type === 'clipboard' && typeof msg.payload === 'string' && msg.payload) {
        await Clipboard.setStringAsync(msg.payload);
        dialog.toast('Text aus der Zwischenablage kopiert', 'success');
      }
    },
    [client, connect, dialog, route.params.id]
  );

  const startDesktop = useCallback(async () => {
    if (!client) return;
    setBusy(true);
    try {
      await client.post(`/v1/machines/${route.params.id}/desktop`, {
        action: 'start',
        width: resolution.w,
        height: resolution.h,
      });
      dialog.toast('Desktop gestartet', 'success');
      desktop.reload();
      setTimeout(connect, 1200);
    } catch (e) {
      dialog.toast(errorText(e), 'error');
    } finally {
      setBusy(false);
    }
  }, [client, connect, desktop, dialog, resolution, route.params.id]);

  const installDesktop = useCallback(async () => {
    if (!client) return;
    setBusy(true);
    try {
      await client.post(`/v1/machines/${route.params.id}/desktop`, { action: 'install' });
      dialog.toast('Installation läuft im Hintergrund (~30 s)', 'success');
      setTimeout(() => desktop.reload(), 5000);
    } catch (e) {
      dialog.toast(errorText(e), 'error');
    } finally {
      setBusy(false);
    }
  }, [client, desktop, dialog, route.params.id]);

  const needsInstall = desktop.data && !desktop.data.installed && !desktop.data.installing;
  const desktopRunning = desktop.data?.running;
  const machineRunning = machine.data?.state === 'running';

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.bg }} edges={['bottom', 'left', 'right']}>
      <View style={styles.bar}>
        <View style={{ flex: 1 }}>
          <Txt variant="small" color={t.muted} numberOfLines={1}>
            {machine.data?.name || route.params.name || 'Desktop'}
          </Txt>
          <Txt variant="small" color={t.faint}>
            {client?.demo
              ? 'Demo-Desktop'
              : status === 'ready'
              ? `Verbunden · ${resolution.label}`
              : status === 'connecting'
              ? 'Verbinde …'
              : 'Nicht verbunden'}
          </Txt>
        </View>
        {status === 'ready' ? (
          <Chip label={viewOnly ? 'Nur ansehen' : 'Steuerung aktiv'} active={!viewOnly} />
        ) : null}
        <Pressable onPress={connect} hitSlop={8}>
          <Ionicons name="refresh" size={18} color={t.muted} />
        </Pressable>
      </View>

      <View style={{ flex: 1 }}>
        <BridgeView ref={bridge} html={DESKTOP_HTML} onMessage={onMessage} onReady={() => setViewerReady(true)} />
      </View>

      {!client?.demo && (needsInstall || !desktopRunning || !machineRunning) ? (
        <View style={styles.overlayWrap}>
          <Card style={{ gap: 12 }}>
            <Txt variant="heading">
              {!machineRunning ? 'Maschine läuft nicht' : needsInstall ? 'Desktop installieren' : 'Desktop starten'}
            </Txt>
            <Txt variant="small" color={t.muted} style={{ lineHeight: 19 }}>
              {!machineRunning
                ? 'Starte die Sandbox, um ihren Desktop zu sehen.'
                : needsInstall
                ? 'Auf universal- und t3-Vorlagen ist der Desktop nicht vorinstalliert. Die Installation dauert rund 30 Sekunden.'
                : 'Wähle die Auflösung des virtuellen Desktops. Die Ansicht skaliert sie automatisch auf das Display.'}
            </Txt>
            {!needsInstall && machineRunning ? (
              <Row gap={8} wrap>
                {RESOLUTIONS.map((res) => (
                  <Chip key={res.label} label={res.label} active={resolution.label === res.label} onPress={() => setResolution(res)} />
                ))}
              </Row>
            ) : null}
            <Btn
              title={!machineRunning ? 'Zum Starten' : needsInstall ? 'Installieren' : 'Desktop starten'}
              kind="primary"
              icon={needsInstall ? 'download-outline' : 'desktop-outline'}
              loading={busy}
              onPress={needsInstall ? installDesktop : startDesktop}
            />
            {message ? (
              <Txt variant="small" color={t.red}>
                {message}
              </Txt>
            ) : null}
          </Card>
        </View>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: '#26262E',
  },
  overlayWrap: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: 14 },
});
