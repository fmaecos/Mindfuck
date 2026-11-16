import React, { useCallback, useState } from 'react';
import { ScrollView, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Banner, Btn, Card, Chip, EmptyState, Field, Row, SectionTitle, Txt, useDialog, useTheme } from '../components/ui';
import { useSession } from '../lib/store';
import { errorText } from '../lib/errors';
import { useAsync } from '../lib/hooks';
import type { SecretInfo } from '../lib/types';
import { formatDateTime } from '../lib/format';

export default function SecretsScreen() {
  const t = useTheme();
  const dialog = useDialog();
  const { client, orgs, session } = useSession();
  const [orgId, setOrgId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [value, setValue] = useState('');
  const [delivery, setDelivery] = useState<'proxy' | 'env'>('env');

  const effectiveOrg = orgId || orgs[0]?.id || session?.orgId || '';

  const secrets = useAsync(async () => {
    if (!client || !effectiveOrg) return { items: [] as SecretInfo[] };
    if (session?.kind === 'key') {
      throw new Error('Org Secrets sind nur mit einem Workspace-Key oder einer Anmeldung verfügbar.');
    }
    return client.get<{ items: SecretInfo[] }>(`/v1/orgs/${effectiveOrg}/secrets`);
  }, [client, effectiveOrg, session?.kind]);

  const save = useCallback(async () => {
    if (!name.trim() || !value) return;
    try {
      await client?.put(`/v1/orgs/${effectiveOrg}/secrets/${encodeURIComponent(name.trim())}`, {
        value,
        delivery,
      });
      dialog.toast('Secret gespeichert', 'success');
      setName('');
      setValue('');
      secrets.reload();
    } catch (e) {
      dialog.toast(errorText(e), 'error');
    }
  }, [client, delivery, dialog, effectiveOrg, name, secrets, value]);

  const remove = useCallback(
    async (secret: SecretInfo) => {
      const ok = await dialog.confirm({
        title: 'Secret löschen?',
        message: `„${secret.name}“ wird aus dem Workspace entfernt.`,
        confirmLabel: 'Löschen',
        destructive: true,
      });
      if (!ok) return;
      try {
        await client?.del(`/v1/orgs/${effectiveOrg}/secrets/${encodeURIComponent(secret.name)}`);
        dialog.toast('Secret gelöscht', 'success');
        secrets.reload();
      } catch (e) {
        dialog.toast(errorText(e), 'error');
      }
    },
    [client, dialog, effectiveOrg, secrets]
  );

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
          text="Secrets liefern echte Werte an Sandboxen. „proxy“ setzt einen Platzhalter in HTTPS-Headern auf erlaubten Hosts, „env“ exportiert den Wert als Umgebungsvariable."
          tone="info"
        />

        <SectionTitle title="Neues Secret" />
        <Card style={{ gap: 12 }}>
          <Field label="Name" value={name} onChangeText={setName} placeholder="NPM_TOKEN" autoCapitalize="characters" />
          <Field label="Wert" value={value} onChangeText={setValue} placeholder="…" secure />
          <Row gap={8}>
            <Chip label="Umgebung" active={delivery === 'env'} onPress={() => setDelivery('env')} />
            <Chip label="Proxy" active={delivery === 'proxy'} onPress={() => setDelivery('proxy')} />
          </Row>
          <Btn title="Speichern" kind="primary" icon="lock-closed-outline" onPress={save} />
        </Card>

        <SectionTitle title="Vorhandene Secrets" />
        {secrets.error ? <Banner text={secrets.error} tone="error" /> : null}
        {(secrets.data?.items || []).map((secret) => (
          <Card key={secret.id} style={{ marginBottom: 10, gap: 6 }}>
            <Row justify="space-between">
              <Row gap={8}>
                <Ionicons name="key-outline" size={15} color={t.accent} />
                <Txt variant="body" style={{ fontWeight: '600' }}>
                  {secret.name}
                </Txt>
              </Row>
              <Btn title="Löschen" small kind="danger" onPress={() => remove(secret)} />
            </Row>
            <Row gap={10} wrap>
              <Txt variant="small" color={t.muted}>
                {secret.delivery}
              </Txt>
              <Txt variant="small" color={t.faint}>
                {secret.size} Bytes · Version {secret.version}
              </Txt>
            </Row>
            <Txt variant="small" color={t.faint}>
              erstellt {formatDateTime(secret.createdAt)} · geändert {formatDateTime(secret.updatedAt)}
            </Txt>
          </Card>
        ))}
        {!secrets.loading && !(secrets.data?.items || []).length && !secrets.error ? (
          <EmptyState icon="lock-closed-outline" title="Keine Secrets" message="Lege Zugangsdaten an, die deine Agenten nutzen sollen." />
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}
