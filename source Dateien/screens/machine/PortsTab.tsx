import React, { useCallback, useState } from 'react';
import { Linking, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Btn, Card, EmptyState, Field, Row, Txt, useDialog, useTheme } from '../../components/ui';
import { useSession } from '../../lib/store';
import { errorText } from '../../lib/errors';
import { useAsync } from '../../lib/hooks';
import type { Machine, PublicPort } from '../../lib/types';
import { formatDateTime } from '../../lib/format';

export default function PortsTab({ machine }: { machine: Machine }) {
  const t = useTheme();
  const dialog = useDialog();
  const { client } = useSession();
  const [port, setPort] = useState('');
  const [name, setName] = useState('');
  const [privateMode, setPrivateMode] = useState(false);
  const [busy, setBusy] = useState(false);

  const ports = useAsync(async () => {
    if (!client) return null;
    return client.get<{ ports: PublicPort[]; enabled: boolean }>(`/v1/machines/${machine.id}/ports`);
  }, [client, machine.id]);

  const publish = useCallback(async () => {
    if (!client) return;
    const number = Number(port);
    if (!number || number < 1 || number > 65535) {
      dialog.toast('Bitte eine gültige Portnummer eingeben.', 'error');
      return;
    }
    setBusy(true);
    try {
      await client.post(`/v1/machines/${machine.id}/ports`, {
        port: number,
        name: name.trim() || undefined,
        access: privateMode ? 'private' : 'public',
      });
      dialog.toast('Port veröffentlicht', 'success');
      setPort('');
      setName('');
      ports.reload();
    } catch (e) {
      dialog.toast(errorText(e), 'error');
    } finally {
      setBusy(false);
    }
  }, [client, dialog, name, port, ports, privateMode, machine.id]);

  const unpublish = useCallback(
    async (item: PublicPort) => {
      const ok = await dialog.confirm({
        title: 'Port entfernen?',
        message: `${item.url} wird geschlossen.`,
        confirmLabel: 'Entfernen',
        destructive: true,
      });
      if (!ok) return;
      try {
        await client?.del(`/v1/machines/${machine.id}/ports/${item.port}`);
        dialog.toast('Port entfernt', 'success');
        ports.reload();
      } catch (e) {
        dialog.toast(errorText(e), 'error');
      }
    },
    [client, dialog, machine.id, ports]
  );

  return (
    <View style={{ gap: 12 }}>
      <Card style={{ gap: 12 }}>
        <Txt variant="heading">Port veröffentlichen</Txt>
        <Txt variant="small" color={t.muted} style={{ lineHeight: 19 }}>
          Ein HTTP-Port in der Sandbox bekommt eine HTTPS-Adresse. Private Ports verlangen ein Token.
        </Txt>
        <Row gap={8}>
          <View style={{ width: 110 }}>
            <Field label="Port" value={port} onChangeText={setPort} placeholder="3000" keyboardType="numeric" />
          </View>
          <View style={{ flex: 1 }}>
            <Field label="Name" value={name} onChangeText={setName} placeholder="Next.js" autoCapitalize="sentences" />
          </View>
        </Row>
        <Row gap={10}>
          <Btn
            title={privateMode ? 'Privat' : 'Öffentlich'}
            icon={privateMode ? 'lock-closed-outline' : 'globe-outline'}
            small
            onPress={() => setPrivateMode((v) => !v)}
          />
          <Btn title="Veröffentlichen" kind="primary" small icon="share-outline" loading={busy} onPress={publish} />
        </Row>
      </Card>

      {(ports.data?.ports || []).map((item) => (
        <Card key={item.id} style={{ gap: 8 }}>
          <Row justify="space-between">
            <Row gap={7}>
              <Ionicons name="link-outline" size={15} color={t.accent} />
              <Txt variant="body" style={{ fontWeight: '600' }}>
                {item.name || `Port ${item.port}`}
              </Txt>
            </Row>
            <Txt variant="small" color={item.access === 'private' ? t.yellow : t.green}>
              {item.access === 'private' ? 'privat' : 'öffentlich'}
            </Txt>
          </Row>
          <Txt variant="mono" color={t.muted} numberOfLines={1}>
            {item.url}
          </Txt>
          <Row gap={10}>
            <Btn
              title="Öffnen"
              icon="open-outline"
              small
              onPress={() => Linking.openURL(item.url).catch(() => {})}
            />
            <Btn title="Entfernen" small kind="danger" icon="trash-outline" onPress={() => unpublish(item)} />
          </Row>
          <Txt variant="small" color={t.faint}>
            seit {formatDateTime(item.createdAt)}
          </Txt>
        </Card>
      ))}

      {!ports.loading && !(ports.data?.ports || []).length ? (
        <EmptyState icon="globe-outline" title="Keine öffentlichen Ports" message="Veröffentliche einen Port, um deine App erreichbar zu machen." />
      ) : null}
    </View>
  );
}
