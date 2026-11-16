import React from 'react';
import { View } from 'react-native';
import { Card, KV, Row, Txt, useTheme } from '../../components/ui';
import type { Machine, MachineMetric } from '../../lib/types';
import { formatBytes, formatDateTime, formatDuration, formatRelative } from '../../lib/format';
import { useSession } from '../../lib/store';
import { useAsync } from '../../lib/hooks';

function Sparkline({ values, color }: { values: number[]; color: string }) {
  const t = useTheme();
  const max = Math.max(1, ...values);
  return (
    <Row gap={2} align="flex-end" style={{ height: 54 }}>
      {values.map((value, index) => (
        <View
          key={index}
          style={{
            flex: 1,
            height: `${Math.max(4, (value / max) * 100)}%`,
            backgroundColor: color,
            opacity: 0.35 + (0.65 * value) / max,
            borderRadius: 2,
          }}
        />
      ))}
      <View style={{ width: 1, backgroundColor: t.border }} />
    </Row>
  );
}

export default function OverviewTab({ machine }: { machine: Machine }) {
  const t = useTheme();
  const { client } = useSession();

  const metrics = useAsync(async () => {
    if (!client || machine.state !== 'running') return null;
    try {
      return client.get<{ metrics: MachineMetric[] }>(`/v1/machines/${machine.id}/metrics`);
    } catch (e) {
      return null;
    }
  }, [client, machine.id, machine.state]);

  const disk = useAsync(async () => {
    if (!client || machine.state !== 'running') return null;
    try {
      return client.get<any>(`/v1/machines/${machine.id}/disk`);
    } catch (e) {
      return null;
    }
  }, [client, machine.id, machine.state]);

  const cpu = (metrics.data?.metrics || []).map((m) => m.cpuUsedPct);
  const mem = (metrics.data?.metrics || []).map((m) => (m.memTotal ? (m.memUsed / m.memTotal) * 100 : 0));

  return (
    <View style={{ gap: 12 }}>
      <Card style={{ gap: 4 }}>
        <Txt variant="caption" color={t.faint}>
          Größe
        </Txt>
        <KV k="vCPU" v={String(machine.spec.vcpus)} />
        <KV k="Arbeitsspeicher" v={formatBytes(machine.spec.memMiB * 1024 * 1024)} />
        <KV k="Datenträger /data" v={`${machine.spec.persistentDiskGiB} GB`} />
        <KV k="Vorlage" v={`${machine.template?.id}@${machine.template?.version}`} />
        <KV k="Benutzer" v={machine.guestUser} />
        <KV k="Idle-Pause" v={machine.autoSuspendAfterSeconds ? `${machine.autoSuspendAfterSeconds / 60} min` : 'aus'} />
        <KV k="Max. Laufzeit" v={machine.maxRunMinutes === -1 ? 'unbegrenzt' : `${machine.maxRunMinutes ?? 480} min`} />
        <KV k="Erstellt" v={formatDateTime(machine.createdAt)} />
        <KV k="Zuletzt geändert" v={formatRelative(machine.updatedAt)} />
        {machine.readyAt ? <KV k="Bereit seit" v={formatRelative(machine.readyAt)} /> : null}
        {machine.runStartedAt ? <KV k="Läuft seit" v={formatDuration((Date.now() - new Date(machine.runStartedAt).getTime()) / 1000)} /> : null}
        {machine.oomKills ? <KV k="OOM-Kills" v={String(machine.oomKills)} /> : null}
      </Card>

      {machine.metadata && Object.keys(machine.metadata).length ? (
        <Card style={{ gap: 4 }}>
          <Txt variant="caption" color={t.faint}>
            Labels
          </Txt>
          {Object.entries(machine.metadata).map(([key, value]) => (
            <KV key={key} k={key} v={String(value)} />
          ))}
        </Card>
      ) : null}

      {machine.envNames?.length ? (
        <Card style={{ gap: 4 }}>
          <Txt variant="caption" color={t.faint}>
            Umgebungsvariablen
          </Txt>
          <Txt variant="mono" color={t.muted}>
            {machine.envNames.join(', ')}
          </Txt>
        </Card>
      ) : null}

      {metrics.data?.metrics?.length ? (
        <Card style={{ gap: 10 }}>
          <Txt variant="caption" color={t.faint}>
            Ressourcen (letzte 5 Minuten)
          </Txt>
          <View style={{ gap: 6 }}>
            <Row justify="space-between">
              <Txt variant="small">CPU</Txt>
              <Txt variant="small" color={t.muted}>
                {cpu.length ? `${Math.round(cpu[cpu.length - 1])} %` : '–'}
              </Txt>
            </Row>
            <Sparkline values={cpu} color={t.accent} />
          </View>
          <View style={{ gap: 6 }}>
            <Row justify="space-between">
              <Txt variant="small">Arbeitsspeicher</Txt>
              <Txt variant="small" color={t.muted}>
                {mem.length ? `${Math.round(mem[mem.length - 1])} %` : '–'}
              </Txt>
            </Row>
            <Sparkline values={mem} color={t.blue} />
          </View>
        </Card>
      ) : null}

      {disk.data?.filesystems?.length ? (
        <Card style={{ gap: 10 }}>
          <Txt variant="caption" color={t.faint}>
            Speicherplatz
          </Txt>
          {disk.data.filesystems.map((fs: any) => (
            <View key={fs.mount} style={{ gap: 5 }}>
              <Row justify="space-between">
                <Txt variant="small">{fs.mount}</Txt>
                <Txt variant="small" color={fs.level === 'ok' ? t.muted : t.yellow}>
                  {Math.round(fs.usedPct)} % · {formatBytes(fs.usedBytes)} / {formatBytes(fs.sizeBytes)}
                </Txt>
              </Row>
              <View style={{ height: 6, borderRadius: 3, backgroundColor: t.surfaceAlt, overflow: 'hidden' }}>
                <View
                  style={{
                    width: `${Math.min(100, fs.usedPct)}%`,
                    height: '100%',
                    backgroundColor: fs.level === 'ok' ? t.accent : t.yellow,
                  }}
                />
              </View>
            </View>
          ))}
        </Card>
      ) : null}
    </View>
  );
}
