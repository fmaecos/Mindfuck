import React, { useCallback, useState } from 'react';
import { ScrollView, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Clipboard from 'expo-clipboard';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Banner, Btn, Card, Chip, EmptyState, Row, Txt, useDialog, useTheme } from '../components/ui';
import { useSession } from '../lib/store';
import { errorText } from '../lib/errors';
import { useAsync } from '../lib/hooks';
import type { ApiKeyInfo } from '../lib/types';
import { formatDateTime, formatRelative } from '../lib/format';

const SCOPES = [
  { id: 'machines:read', label: 'Maschinen lesen' },
  { id: 'machines:write', label: 'Maschinen ändern' },
  { id: 'machines:delete', label: 'Maschinen löschen' },
  { id: 'images:read', label: 'Snapshots lesen' },
  { id: 'images:write', label: 'Snapshots schreiben' },
  { id: 'images:delete', label: 'Snapshots löschen' },
];

export default function ApiKeysScreen() {
  const t = useTheme();
  const dialog = useDialog();
  const { client, orgs, session } = useSession();
  const [orgId, setOrgId] = useState<string | null>(null);
  const [created, setCreated] = useState<{ key: string; name: string } | null>(null);

  const effectiveOrg = orgId || orgs[0]?.id || session?.orgId || '';

  const keys = useAsync(async () => {
    if (!client) return { keys: [] as ApiKeyInfo[] };
    if (session?.kind === 'key') {
      throw new Error('Mit einem API-Schlüssel lassen sich keine Schlüssel verwalten. Melde dich mit dem Konto an.');
    }
    if (effectiveOrg && effectiveOrg !== session?.orgId) {
      return client.get<{ keys: ApiKeyInfo[] }>(`/v1/orgs/${effectiveOrg}/keys`);
    }
    return client.get<{ keys: ApiKeyInfo[] }>('/v1/keys');
  }, [client, effectiveOrg, session?.kind, session?.orgId]);

  const createKey = useCallback(async () => {
    const name = await dialog.prompt({
      title: 'Neuer API-Schlüssel',
      message: 'Wie soll der Schlüssel heißen?',
      placeholder: 'z. B. CI-Pipeline',
      confirmLabel: 'Anlegen',
    });
    if (!name) return;
    try {
      const result = await client?.post<any>(
        effectiveOrg && effectiveOrg !== session?.orgId ? `/v1/orgs/${effectiveOrg}/keys` : '/v1/keys',
        { name, scopes: ['machines:read', 'machines:write'], expiresInDays: 90 }
      );
      if (result?.key) {
        setCreated({ key: result.key, name });
        await Clipboard.setStringAsync(result.key);
        dialog.toast('Schlüssel kopiert – er wird nur einmal angezeigt.', 'success');
      }
      keys.reload();
    } catch (e) {
      dialog.toast(errorText(e), 'error');
    }
  }, [client, dialog, effectiveOrg, keys, session?.orgId]);

  const revoke = useCallback(
    async (key: ApiKeyInfo) => {
      const ok = await dialog.confirm({
        title: 'Schlüssel widerrufen?',
        message: `„${key.name}“ kann danach nicht mehr verwendet werden.`,
        confirmLabel: 'Widerrufen',
        destructive: true,
      });
      if (!ok) return;
      try {
        await client?.del(
          effectiveOrg && effectiveOrg !== session?.orgId ? `/v1/orgs/${effectiveOrg}/keys/${key.id}` : `/v1/keys/${key.id}`
        );
        dialog.toast('Schlüssel widerrufen', 'success');
        keys.reload();
      } catch (e) {
        dialog.toast(errorText(e), 'error');
      }
    },
    [client, dialog, effectiveOrg, keys, session?.orgId]
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.bg }} edges={['bottom', 'left', 'right']}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        {orgs.length > 1 ? (
          <Row gap={8} wrap style={{ marginBottom: 14 }}>
            {orgs.map((org) => (
              <Chip
                key={org.id}
                label={org.name}
                active={effectiveOrg === org.id}
                onPress={() => setOrgId(org.id)}
              />
            ))}
          </Row>
        ) : null}

        {created ? (
          <View style={{ marginBottom: 14 }}>
            <Card style={{ gap: 8, borderColor: t.accent }}>
              <Row gap={8}>
                <Ionicons name="shield-checkmark-outline" size={17} color={t.accent} />
                <Txt variant="heading">Neuer Schlüssel: {created.name}</Txt>
              </Row>
              <Txt variant="small" color={t.muted}>
                Der Schlüssel wird nur einmal angezeigt und wurde in die Zwischenablage kopiert.
              </Txt>
              <Txt variant="mono" color={t.text} selectable>
                {created.key}
              </Txt>
              <Btn title="Erneut kopieren" icon="copy-outline" small onPress={() => Clipboard.setStringAsync(created.key)} />
            </Card>
          </View>
        ) : null}

        <Banner
          text="Ein Schlüssel gehört zu genau einem Workspace und erreicht nichts außerhalb davon. Scopes bestimmen, was er darf."
          tone="info"
        />

        <Row justify="space-between" style={{ marginTop: 16, marginBottom: 8 }}>
          <Txt variant="heading">Schlüssel</Txt>
          <Btn title="Neu" icon="add" small kind="primary" onPress={createKey} />
        </Row>

        {keys.error ? <Banner text={keys.error} tone="error" /> : null}

        {(keys.data?.keys || []).map((key) => (
          <Card key={key.id} style={{ marginBottom: 10, gap: 8 }}>
            <Row justify="space-between">
              <Txt variant="body" style={{ fontWeight: '600' }}>
                {key.name}
              </Txt>
              <Btn title="Widerrufen" small kind="danger" onPress={() => revoke(key)} />
            </Row>
            <Txt variant="mono" color={t.faint}>
              ibk_{key.prefix}…
            </Txt>
            <Row gap={8} wrap>
              {(key.scopes || []).map((scope) => (
                <View
                  key={scope}
                  style={{
                    paddingHorizontal: 8,
                    paddingVertical: 3,
                    borderRadius: 6,
                    backgroundColor: t.surfaceAlt,
                  }}
                >
                  <Txt variant="small" color={t.muted}>
                    {scope}
                  </Txt>
                </View>
              ))}
            </Row>
            <Txt variant="small" color={t.faint}>
              erstellt {formatDateTime(key.createdAt)} · zuletzt genutzt {formatRelative(key.lastUsedAt)} ·{' '}
              {key.expiresAt ? `läuft ab ${formatDateTime(key.expiresAt)}` : 'läuft unbegrenzt'}
            </Txt>
          </Card>
        ))}

        {!keys.loading && !(keys.data?.keys || []).length && !keys.error ? (
          <EmptyState icon="key-outline" title="Noch keine Schlüssel" message="Lege einen API-Schlüssel für die CLI oder CI an." />
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}
