import React from 'react';
import { ScrollView, View } from 'react-native';
import { Btn, Card, Row, Txt, useTheme } from '../../components/ui';
import { useSession } from '../../lib/store';
import { useAsync } from '../../lib/hooks';
import type { Machine, Operation } from '../../lib/types';
import { formatDateTime } from '../../lib/format';

export default function LogsTab({ machine }: { machine: Machine }) {
  const t = useTheme();
  const { client } = useSession();

  const logs = useAsync(async () => {
    if (!client) return null;
    return client.get<{ console: string; cursor: number; operations: Operation[]; consoleUnavailable?: string }>(
      `/v1/machines/${machine.id}/logs`,
      { tail: 200 }
    );
  }, [client, machine.id]);

  return (
    <View style={{ gap: 12 }}>
      <Card style={{ gap: 8 }}>
        <Row justify="space-between">
          <Txt variant="heading">Konsole</Txt>
          <Btn title="Neu laden" icon="refresh" small onPress={logs.reload} />
        </Row>
        {logs.data?.consoleUnavailable ? (
          <Txt variant="small" color={t.yellow}>
            {logs.data.consoleUnavailable}
          </Txt>
        ) : null}
        <ScrollView horizontal>
          <Txt variant="mono" color={t.muted} style={{ lineHeight: 18 }}>
            {logs.data?.console || 'Keine Konsolenausgabe.'}
          </Txt>
        </ScrollView>
      </Card>

      <Card style={{ gap: 10 }}>
        <Txt variant="heading">Letzte Operationen</Txt>
        {(logs.data?.operations || []).length ? (
          (logs.data?.operations || [])
            .slice()
            .reverse()
            .map((op) => (
              <View key={op.id} style={{ gap: 3, paddingVertical: 6, borderTopWidth: 1, borderTopColor: t.border }}>
                <Row justify="space-between">
                  <Txt variant="body">{op.type}</Txt>
                  <Txt
                    variant="small"
                    color={op.state === 'succeeded' ? t.green : op.state === 'failed' ? t.red : t.yellow}
                  >
                    {op.state}
                  </Txt>
                </Row>
                <Txt variant="small" color={t.faint}>
                  {formatDateTime(op.createdAt)} · {op.phase || op.trigger || '—'}
                </Txt>
                {op.error ? (
                  <Txt variant="small" color={t.red}>
                    {op.error.code}: {op.error.message}
                  </Txt>
                ) : null}
              </View>
            ))
        ) : (
          <Txt variant="small" color={t.faint}>
            Keine Operationen protokolliert.
          </Txt>
        )}
      </Card>
    </View>
  );
}
