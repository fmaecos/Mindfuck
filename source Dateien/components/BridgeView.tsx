import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useRef } from 'react';
import { Platform, StyleSheet, View, ViewStyle } from 'react-native';
import { WebView } from 'react-native-webview';

export type BridgeMessage = { type: string; payload?: any; [key: string]: any };

export type BridgeHandle = {
  post: (message: BridgeMessage) => void;
};

type Props = {
  html: string;
  onMessage: (message: BridgeMessage) => void;
  onReady?: () => void;
  style?: ViewStyle;
};

/**
 * Hosts the desktop/terminal viewer page.
 * Native: a WebView. Web: an iframe with srcDoc.
 * Both speak the same tiny JSON protocol.
 */
export const BridgeView = forwardRef<BridgeHandle, Props>(function BridgeView(
  { html, onMessage, onReady, style },
  ref
) {
  const webRef = useRef<WebView>(null);
  const frameRef = useRef<any>(null);
  const listenerRef = useRef(onMessage);
  listenerRef.current = onMessage;

  useImperativeHandle(
    ref,
    () => ({
      post: (message: BridgeMessage) => {
        const payload = JSON.stringify(message);
        if (Platform.OS === 'web') {
          const win = frameRef.current?.contentWindow;
          if (win) win.postMessage(payload, '*');
          return;
        }
        webRef.current?.injectJavaScript(
          `window.__ibpHost && window.__ibpHost(${JSON.stringify(payload)}); true;`
        );
      },
    }),
    []
  );

  useEffect(() => {
    if (Platform.OS !== 'web') return undefined;
    const handler = (event: MessageEvent) => {
      let data = event.data;
      if (typeof data === 'string') {
        try {
          data = JSON.parse(data);
        } catch (e) {
          return;
        }
      }
      if (!data || typeof data !== 'object' || !('type' in data)) return;
      listenerRef.current(data as BridgeMessage);
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  if (Platform.OS === 'web') {
    return (
      <View style={[styles.fill, style]}>
        <iframe
          ref={frameRef}
          title="instabox-viewer"
          srcDoc={html}
          style={{ border: 'none', width: '100%', height: '100%', background: '#000' }}
          sandbox="allow-scripts allow-same-origin allow-pointer-lock"
          onLoad={() => onReady?.()}
        />
      </View>
    );
  }

  return (
    <WebView
      ref={webRef}
      source={{ html, baseUrl: 'https://instabox.local' }}
      originWhitelist={['*']}
      style={[styles.fill, style]}
      containerStyle={styles.fill}
      scrollEnabled={false}
      bounces={false}
      overScrollMode="never"
      allowsInlineMediaPlayback
      javaScriptEnabled
      domStorageEnabled
      setSupportMultipleWindows={false}
      onMessage={(event) => {
        try {
          const data = JSON.parse(event.nativeEvent.data);
          listenerRef.current(data);
        } catch (e) {
          /* ignore malformed messages */
        }
      }}
      onLoad={() => onReady?.()}
      onError={() => listenerRef.current({ type: 'error', payload: { message: 'Viewer konnte nicht geladen werden.' } })}
    />
  );
});

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: '#000' },
});
