import React, { useCallback, useState } from 'react';
import { Linking, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Banner, Btn, Card, EmptyState, KV, Row, Txt, useDialog, useTheme } from '../../components/ui';
import { useSession } from '../../lib/store';
import { errorText } from '../../lib/errors';
import { useAsync } from '../../lib/hooks';
import type { ConnectionInfo, Machine, SshToken } from '../../lib/types';
import { formatDateTime } from '../../lib/format';

export default function SshTab({ machine }: { machine: Machine }) {
  const t = useTheme();
  const dialog = useDialog();
  const { client } = useSession();
  const [busy, setBusy] = useState(false);

  const info = useAsync(async () => {
    if (!client) return null;
    return client.get<ConnectionInfo>(`/v1/machines/${machine.id}/connection-info`);
  }, [client, machine.id]);

  const tokens = useAsync(async () => {
    if (!client) return null;
    return client.get<{ tokens: SshToken[] }>(`/v1/machines/${machine.id}/ssh-tokens`);
  }, [client, machine.id]);

  const createToken = useCallback(async () => {
    if (!client) return;
    setBusy(true);
    try {
      const token = await client.post<SshToken>(`/v1/machines/${machine.id}/ssh-tokens`, { name: 'pilot' });
      if (token?.command) {
        await Clipboard.setStringAsync(token.command);
        dialog.toast('SSH-Befehl kopiert', 'success');
      }
      tokens.reload();
    } catch (e) {
      dialog.toast(errorText(e), 'error');
    } finally {
      setBusy(false);
    }
  }, [client, dialog, machine.id, tokens]);

  const revoke = useCallback(
    async (token: SshToken) => {
      const ok = await dialog.confirm({
        title: 'Token widerrufen?',
        message: 'Offene SSH-Verbindungen werden getrennt.',
        confirmLabel: 'Widerrufen',
        destructive: true,
      });
      if (!ok) return;
      try {
        await client?.del(`/v1/machines/${machine.id}/ssh-tokens/${token.id}`);
        dialog.toast('Token widerrufen', 'success');
        tokens.reload();
      } catch (e) {
        dialog.toast(errorText(e), 'error');
      }
    },
    [client, dialog, machine.id, tokens]
  );

  return (
    <View style={{ gap: 12 }}>
      <Card style={{ gap: 4 }}>
        <Txt variant="heading">Verbindung</Txt>
        {info.data ? (
          <>
            <KV k="Host" v={info.data.host} mono />
            <KV k="Port" v={String(info.data.port)} />
            <KV k="Benutzer" v={info.data.username} mono />
            <KV k="Fähigkeiten" v={(info.data.capabilities || []).join(', ')} />
            <KV k="Host-Key" v={info.data.hostTrust?.publicKey?.slice(0, 42) || '–'} mono />
          </>
        ) : (
          <Txt variant="small" color={t.faint}>
            {info.error || 'Lade …'}
          </Txt>
        )}
      </Card>

      <Card style={{ gap: 10 }}>
        <Row justify="space-between">
          <Txt variant="heading">SSH-Token</Txt>
          <Btn title="Token" icon="add" small loading={busy} onPress={createToken} />
        </Row>
        <Txt variant="small" color={t.muted} style={{ lineHeight: 19 }}>
          Ein Token funktioniert ohne Schlüsseldatei – der Token ist der Benutzername. Der Befehl wird nach der
          Erstellung kopiert.
        </Txt>
        {(tokens.data?.tokens || []).map((token) => (
          <View key={token.id} style={{ gap: 6, paddingTop: 10, borderTopWidth: 1, borderTopColor: t.border }}>
            <Row justify="space-between">
              <Row gap={6}>
                <Ionicons name="key-outline" size={14} color={t.faint} />
                <Txt variant="body">{token.name || token.id}</Txt>
              </Row>
              {token.revokedAt ? (
                <Txt variant="small" color={t.red}>
                  widerrufen
                </Txt>
              ) : (
                <Btn title="Widerrufen" small onPress={() => revoke(token)} />
              )}
            </Row>
            <Txt variant="small" color={t.faint}>
              erstellt {formatDateTime(token.createdAt)}
              {token.expiresAt ? ` · gültig bis ${formatDateTime(token.expiresAt)}` : ' · ohne Ablauf'}
            </Txt>
            {token.command ? (
              <Row gap={8}>
                <Txt variant="mono" color={t.muted} style={{ flex: 1 }} numberOfLines={1}>
                  {token.command}
                </Txt>
                <PressableCopy value={token.command} />
              </Row>
            ) : null}
          </View>
        ))}
        {!tokens.loading && !(tokens.data?.tokens || []).length ? (
          <EmptyState icon="key-outline" title="Keine Tokens" message="Erstelle einen Token für eine SSH-Sitzung." />
        ) : null}
      </Card>

      <Banner
        text="Zugänge aus der Konsole: instabox ssh <name> – dort gelten die Token aus dem Dashboard."
        tone="info"
      />
    </View>
  );
}

function PressableCopy({ value }: { value: string }) {
  const t = useTheme();
  const dialog = useDialog();
  return (
    <Btn
      title="Kopieren"
      icon="copy-outline"
      small
      onPress={async () => {
        await Clipboard.setStringAsync(value);
        dialog.toast('Kopiert', 'success');
      }}
    />
  );
}
