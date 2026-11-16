import React, { useCallback, useState } from 'react';
import { ScrollView, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Banner, Btn, Card, Chip, EmptyState, Field, Row, SectionTitle, Txt, useDialog, useTheme } from '../components/ui';
import { useSession } from '../lib/store';
import { errorText } from '../lib/errors';
import { useAsync } from '../lib/hooks';
import type { WebhookInfo } from '../lib/types';
import { formatDateTime } from '../lib/format';

const EVENTS = [
  'sandbox.created',
  'sandbox.started',
  'sandbox.stopped',
  'sandbox.suspended',
  'sandbox.error',
  'sandbox.deleted',
  'snapshot.created',
  'snapshot.failed',
  'snapshot.deleted',
];

export default function WebhooksScreen() {
  const t = useTheme();
  const dialog = useDialog();
  const { client, orgs, session } = useSession();
  const [orgId, setOrgId] = useState<string | null>(null);
  const [url, setUrl] = useState('');
  const [description, setDescription] = useState('');
  const [events, setEvents] = useState<string[]>(['sandbox.error']);

  const effectiveOrg = orgId || orgs[0]?.id || session?.orgId || '';

  const hooks = useAsync(async () => {
    if (!client || !effectiveOrg) return { items: [] as WebhookInfo[] };
    if (session?.kind === 'key') throw new Error('Webhooks sind nur mit einer Anmeldung oder einem Workspace-Key sichtbar.');
    return client.get<{ items: WebhookInfo[] }>(`/v1/orgs/${effectiveOrg}/webhooks`);
  }, [client, effectiveOrg, session?.kind]);

  const create = useCallback(async () => {
    if (!url.trim()) return;
    try {
      await client?.post(`/v1/orgs/${effectiveOrg}/webhooks`, {
        url: url.trim(),
        description: description.trim(),
        events,
        enabled: true,
      });
      dialog.toast('Webhook angelegt', 'success');
      setUrl('');
      setDescription('');
      hooks.reload();
    } catch (e) {
      dialog.toast(errorText(e), 'error');
    }
  }, [client, description, dialog, effectiveOrg, events, hooks, url]);

  const remove = useCallback(
    async (hook: WebhookInfo) => {
      const ok = await dialog.confirm({
        title: 'Webhook löschen?',
        message: hook.url,
        confirmLabel: 'Löschen',
        destructive: true,
      });
      if (!ok) return;
      try {
        await client?.del(`/v1/orgs/${effectiveOrg}/webhooks/${hook.id}`);
        dialog.toast('Webhook gelöscht', 'success');
        hooks.reload();
      } catch (e) {
        dialog.toast(errorText(e), 'error');
      }
    },
    [client, dialog, effectiveOrg, hooks]
  );

  const test = useCallback(
    async (hook: WebhookInfo) => {
      try {
        await client?.post(`/v1/orgs/${effectiveOrg}/webhooks/${hook.id}/test`, {}, { idempotent: true });
        dialog.toast('Testevent wird zugestellt', 'success');
      } catch (e) {
        dialog.toast(errorText(e), 'error');
      }
    },
    [client, dialog, effectiveOrg]
  );

  const toggleEvent = (event: string) => {
    setEvents((prev) => (prev.includes(event) ? prev.filter((e) => e !== event) : [...prev, event]));
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.bg }} edges={['bottom', 'left', 'right']}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        {orgs.length > 1 ? (
          <Row gap={8} wrap style={{ marginBottom: 14 }}>
            {orgs.map((org) => (
              <Chip key={org.id} label={org.name} active={effectiveOrg === org.id} onPress={() => setOrgId(org.id)} />
            ))}
          </Row>
        ) : null}

        <Banner
          text="Webhooks werden mit HMAC-Signatur zugestellt. Die Signatur entsteht aus dem Secret, das nur beim Anlegen sichtbar ist."
          tone="info"
        />

        <SectionTitle title="Neuer Webhook" />
        <Card style={{ gap: 12 }}>
          <Field
            label="URL"
            value={url}
            onChangeText={setUrl}
            placeholder="https://hooks.example.com/instabox"
            keyboardType="url"
          />
          <Field label="Beschreibung" value={description} onChangeText={setDescription} placeholder="Deployment-Pipeline" autoCapitalize="sentences" />
          <Txt variant="small">Ereignisse</Txt>
          <Row gap={8} wrap>
            {EVENTS.map((event) => (
              <Chip key={event} label={event} active={events.includes(event)} onPress={() => toggleEvent(event)} />
            ))}
          </Row>
          <Btn title="Anlegen" kind="primary" icon="git-branch-outline" onPress={create} />
        </Card>

        <SectionTitle title="Endpunkte" />
        {hooks.error ? <Banner text={hooks.error} tone="error" /> : null}
        {(hooks.data?.items || []).map((hook) => (
          <Card key={hook.id} style={{ marginBottom: 10, gap: 8 }}>
            <Row justify="space-between" align="flex-start">
              <View style={{ flex: 1, paddingRight: 8 }}>
                <Txt variant="body" style={{ fontWeight: '600' }} numberOfLines={1}>
                  {hook.description || hook.url}
                </Txt>
                <Txt variant="mono" color={t.faint} numberOfLines={1}>
                  {hook.url}
                </Txt>
              </View>
              <Ionicons
                name={hook.enabled ? 'checkmark-circle' : 'pause-circle'}
                size={17}
                color={hook.enabled ? t.green : t.yellow}
              />
            </Row>
            <Row gap={6} wrap>
              {(hook.events || []).map((event) => (
                <View key={event} style={{ paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6, backgroundColor: t.surfaceAlt }}>
                  <Txt variant="small" color={t.muted}>
                    {event}
                  </Txt>
                </View>
              ))}
            </Row>
            <Txt variant="small" color={t.faint}>
              erstellt {formatDateTime(hook.createdAt)}
              {hook.disabledReason ? ` · deaktiviert (${hook.disabledReason})` : ''}
            </Txt>
            <Row gap={8}>
              <Btn title="Test" icon="send-outline" small onPress={() => test(hook)} />
              <Btn title="Löschen" icon="trash-outline" small kind="danger" onPress={() => remove(hook)} />
            </Row>
          </Card>
        ))}
        {!hooks.loading && !(hooks.data?.items || []).length && !hooks.error ? (
          <EmptyState icon="git-branch-outline" title="Keine Webhooks" message="Benachrichtige eigene Dienste über Sandbox-Ereignisse." />
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}
