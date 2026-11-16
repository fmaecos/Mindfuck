import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRoute, RouteProp } from '@react-navigation/native';
import { BridgeView, BridgeHandle, BridgeMessage } from '../components/BridgeView';
import { Row, Txt, useDialog, useTheme } from '../components/ui';
import { TERMINAL_HTML } from '../lib/generated/viewers';
import { useSession } from '../lib/store';
import { requestAccess, toWebSocketUrl } from '../lib/connect';
import { errorText } from '../lib/errors';
import { utf8ToString } from '../lib/encoding';
import type { Machine } from '../lib/types';
import type { RootStackParamList } from '../navigation/types';
import { base64ToBytes } from '../lib/b64';

export default function TerminalScreen() {
  const t = useTheme();
  const route = useRoute<RouteProp<RootStackParamList, 'Terminal'>>();
  const dialog = useDialog();
  const { client } = useSession();
  const bridge = useRef<BridgeHandle>(null);
  const socket = useRef<WebSocket | null>(null);
  const [viewerReady, setViewerReady] = useState(false);
  const [status, setStatus] = useState<'idle' | 'connecting' | 'ready' | 'error'>('idle');
  const [message, setMessage] = useState<string | null>(null);

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
      const access = await requestAccess(client, route.params.id, 'terminal', { cols: 100, rows: 30 });
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
      };
      ws.onmessage = (event: any) => {
        const data = event?.data;
        if (typeof data === 'string') {
          try {
            const control = JSON.parse(data);
            if (control?.type === 'error') {
              setMessage(control.message || 'Fehler in der Shell-Sitzung.');
              bridge.current?.post({ type: 'error', payload: { message: control.message } });
              return;
            }
            if (control?.type === 'exit') {
              setMessage(`Shell beendet (Code ${control.code}).`);
              return;
            }
            if (control?.type === 'taken') {
              setMessage('Die Sitzung ist bereits an einem anderen Ort geöffnet.');
              return;
            }
          } catch (e) {
            bridge.current?.post({ type: 'text', payload: data });
          }
          return;
        }
        if (data) {
          const view = data instanceof ArrayBuffer ? new Uint8Array(data) : new Uint8Array(data.buffer || data);
          bridge.current?.post({ type: 'text', payload: utf8ToString(view) });
        }
      };
      ws.onerror = () => {
        setStatus('error');
        setMessage('Die Verbindung zur Shell ist fehlgeschlagen.');
      };
      ws.onclose = () => {
        setStatus('idle');
      };
    } catch (e) {
      setStatus('error');
      setMessage(errorText(e));
    }
  }, [client, closeSocket, route.params.id, viewerReady]);

  useEffect(() => {
    if (!viewerReady) return;
    bridge.current?.post({ type: 'init', mode: client?.demo ? 'demo' : 'remote' });
  }, [viewerReady, client?.demo]);

  useEffect(() => {
    if (viewerReady && status === 'idle' && client && !client.demo) connect();
  }, [viewerReady, status, client, connect]);

  const onMessage = useCallback(
    async (msg: BridgeMessage) => {
      if (msg.type === 'data' && typeof msg.payload?.data === 'string') {
        socket.current?.send(msg.payload.data);
        return;
      }
      if (msg.type === 'resize' && socket.current?.readyState === 1) {
        socket.current.send(
          JSON.stringify({ type: 'resize', cols: msg.payload?.cols || 100, rows: msg.payload?.rows || 30 })
        );
        return;
      }
      if (msg.type === 'reconnect') {
        connect();
      }
    },
    [connect]
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.bg }} edges={['bottom', 'left', 'right']}>
      <View style={styles.bar}>
        <View style={{ flex: 1 }}>
          <Txt variant="small" color={t.muted} numberOfLines={1}>
            {route.params.name || 'Terminal'}
          </Txt>
          <Txt variant="small" color={t.faint}>
            {client?.demo ? 'Demo-Terminal' : status === 'ready' ? 'Shell verbunden' : status === 'connecting' ? 'Verbinde …' : 'Nicht verbunden'}
          </Txt>
        </View>
        {message ? (
          <Row gap={6} style={{ flex: 1, justifyContent: 'flex-end' }}>
            <Ionicons name="information-circle-outline" size={14} color={t.yellow} />
            <Txt variant="small" color={t.yellow} numberOfLines={2} style={{ flexShrink: 1 }}>
              {message}
            </Txt>
          </Row>
        ) : null}
      </View>
      <View style={{ flex: 1 }}>
        <BridgeView ref={bridge} html={TERMINAL_HTML} onMessage={onMessage} onReady={() => setViewerReady(true)} />
      </View>
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
});
