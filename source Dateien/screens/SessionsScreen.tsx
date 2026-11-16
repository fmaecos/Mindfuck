import React, { useCallback } from 'react';
import { ScrollView, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Banner, Btn, Card, EmptyState, Row, Txt, useDialog, useTheme } from '../components/ui';
import { useSession } from '../lib/store';
import { errorText } from '../lib/errors';
import { useAsync } from '../lib/hooks';
import type { SessionInfo } from '../lib/types';
import { formatDateTime, formatRelative } from '../lib/format';

export default function SessionsScreen() {
  const t = useTheme();
  const dialog = useDialog();
  const { client, session } = useSession();

  const sessions = useAsync(async () => {
    if (!client) return { sessions: [] as SessionInfo[] };
    if (session?.kind === 'key') {
      throw new Error('Mit einem API-Schlüssel lassen sich keine Sitzungen auflisten.');
    }
    return client.get<{ sessions: SessionInfo[] }>('/v1/sessions');
  }, [client, session?.kind]);

  const revoke = useCallback(
    async (item: SessionInfo) => {
      const ok = await dialog.confirm({
        title: 'Anmeldung beenden?',
        message: 'Alle Token dieser Sitzung werden widerrufen.',
        confirmLabel: 'Beenden',
        destructive: true,
      });
      if (!ok) return;
      try {
        await client?.del(`/v1/sessions/${item.id}`);
        dialog.toast('Sitzung beendet', 'success');
        sessions.reload();
      } catch (e) {
        dialog.toast(errorText(e), 'error');
      }
    },
    [client, dialog, sessions]
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.bg }} edges={['bottom', 'left', 'right']}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        <Banner
          text="Sitzungen sind Anmeldungen über CLI oder Browser. Eine widerrufene Sitzung kann mit ihrem Refresh-Token nicht mehr weiterarbeiten."
          tone="info"
        />
        <Row justify="space-between" style={{ marginTop: 16, marginBottom: 8 }}>
          <Txt variant="heading">Sitzungen</Txt>
          <Btn title="Neu laden" icon="refresh" small onPress={sessions.reload} />
        </Row>
        {sessions.error ? <Banner text={sessions.error} tone="error" /> : null}
        {(sessions.data?.sessions || []).map((item) => (
          <Card key={item.id} style={{ marginBottom: 10, gap: 6 }}>
            <Row justify="space-between">
              <Row gap={8}>
                <Ionicons
                  name={item.kind === 'cli' ? 'terminal-outline' : 'globe-outline'}
                  size={16}
                  color={t.muted}
                />
                <Txt variant="body" style={{ fontWeight: '600' }}>
                  {item.kind === 'cli' ? 'CLI' : 'Browser'}
                  {item.current ? ' (dieses Gerät)' : ''}
                </Txt>
              </Row>
              {item.current ? (
                <Txt variant="small" color={t.green}>
                  aktiv
                </Txt>
              ) : (
                <Btn title="Beenden" small kind="danger" onPress={() => revoke(item)} />
              )}
            </Row>
            <Txt variant="small" color={t.faint}>
              erstellt {formatDateTime(item.createdAt)} · zuletzt genutzt {formatRelative(item.lastUsedAt)} · gültig bis{' '}
              {formatDateTime(item.expiresAt)}
            </Txt>
          </Card>
        ))}
        {!sessions.loading && !(sessions.data?.sessions || []).length && !sessions.error ? (
          <EmptyState icon="finger-print-outline" title="Keine Sitzungen" message="In diesem Konto ist keine Anmeldung aktiv." />
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}
