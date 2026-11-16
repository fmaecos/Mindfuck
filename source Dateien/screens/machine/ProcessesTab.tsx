import React, { useCallback, useState } from 'react';
import { View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Btn, Card, EmptyState, Row, Txt, useDialog, useTheme } from '../../components/ui';
import { useSession } from '../../lib/store';
import { errorText } from '../../lib/errors';
import { useAsync } from '../../lib/hooks';
import type { Machine, ProcessInfo } from '../../lib/types';
import { formatDuration } from '../../lib/format';

export default function ProcessesTab({ machine }: { machine: Machine }) {
  const t = useTheme();
  const dialog = useDialog();
  const { client } = useSession();
  const [busyPid, setBusyPid] = useState<number | null>(null);

  const processes = useAsync(async () => {
    if (!client) return null;
    return client.get<{ processes: ProcessInfo[]; live: boolean; capturedAt: string }>(
      `/v1/machines/${machine.id}/processes`
    );
  }, [client, machine.id]);

  const kill = useCallback(
    async (process: ProcessInfo) => {
      const ok = await dialog.confirm({
        title: 'Prozess beenden?',
        message: `PID ${process.pid}: ${process.command}`,
        confirmLabel: 'Beenden',
        destructive: true,
      });
      if (!ok) return;
      setBusyPid(process.pid);
      try {
        await client?.post(`/v1/machines/${machine.id}/exec`, { argv: ['kill', '-9', String(process.pid)] });
        dialog.toast('Prozess beendet', 'success');
        processes.reload();
      } catch (e) {
        dialog.toast(errorText(e), 'error');
      } finally {
        setBusyPid(null);
      }
    },
    [client, dialog, processes]
  );

  return (
    <View style={{ gap: 12 }}>
      {processes.error ? (
        <Card>
          <Txt variant="small" color={t.red}>
            {processes.error}
          </Txt>
        </Card>
      ) : null}
      {(processes.data?.processes || []).map((process) => (
        <Card key={process.pid} style={{ gap: 8 }}>
          <Row justify="space-between" align="flex-start">
            <View style={{ flex: 1, paddingRight: 8 }}>
              <Row gap={6}>
                <Ionicons name="terminal-outline" size={13} color={t.faint} />
                <Txt variant="small" color={t.faint}>
                  PID {process.pid} · {process.user}
                </Txt>
              </Row>
              <Txt variant="mono" color={t.text} style={{ marginTop: 4 }} numberOfLines={2}>
                {process.command}
              </Txt>
            </View>
            <Btn
              title="Beenden"
              small
              kind="danger"
              icon="close"
              loading={busyPid === process.pid}
              onPress={() => kill(process)}
            />
          </Row>
          <Row gap={14} wrap>
            <Txt variant="small" color={t.muted}>
              CPU {process.cpuPercent.toFixed(1)} %
            </Txt>
            <Txt variant="small" color={t.muted}>
              RAM {process.memPercent.toFixed(1)} %
            </Txt>
            <Txt variant="small" color={t.muted}>
              läuft {formatDuration(process.elapsedSeconds)}
            </Txt>
          </Row>
        </Card>
      ))}
      {!processes.loading && !(processes.data?.processes || []).length && !processes.error ? (
        <EmptyState icon="pulse-outline" title="Keine Prozesse" message="Die Maschine liefert keine Processliste." />
      ) : null}
    </View>
  );
}
