import React from 'react';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Banner, Card, KV, Row, Txt, useTheme } from '../components/ui';
import { useSession } from '../lib/store';
import { useAsync } from '../lib/hooks';
import { formatBytes, formatDuration, formatUsd } from '../lib/format';

export default function UsageScreen() {
  const t = useTheme();
  const { client } = useSession();

  const usage = useAsync(async () => {
    if (!client) return null;
    return client.get<any>('/v1/usage');
  }, [client]);

  const perMachine = useAsync(async () => {
    if (!client) return null;
    return client.get<any>('/v1/usage/machines', { sort: 'computeUSD', order: 'desc', limit: 20 });
  }, [client]);

  const cost = usage.data?.cost;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.bg }} edges={['bottom', 'left', 'right']}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        {usage.error ? <Banner text={usage.error} tone="error" /> : null}

        {cost ? (
          <Card style={{ gap: 4, marginBottom: 12 }}>
            <Txt variant="caption" color={t.faint}>
              Kosten im laufenden Monat
            </Txt>
            <Txt variant="display">{formatUsd(cost.costUSD)}</Txt>
            <KV k="vCPU" v={formatUsd(cost.vcpuUSD)} />
            <KV k="Arbeitsspeicher" v={formatUsd(cost.memUSD)} />
            <KV k="Speicher" v={formatUsd(cost.storageUSD)} />
            <KV k="Egress" v={formatUsd(cost.egressUSD)} />
            <KV k="Im Preis enthalten" v={formatUsd(cost.allowanceUSD)} />
            <KV k="Rest" v={formatUsd(cost.remainingUSD)} />
          </Card>
        ) : null}

        {usage.data ? (
          <Card style={{ gap: 4, marginBottom: 12 }}>
            <Txt variant="caption" color={t.faint}>
              Limits
            </Txt>
            <KV k="Sandboxen" v={`${usage.data.machines} / ${usage.data.limits.maxMachines}`} />
            <KV k="Snapshots" v={`${usage.data.snapshots} / ${usage.data.limits.maxSnapshots}`} />
            <KV k="Speicher" v={`${formatBytes(usage.data.storedBytes)} / ${usage.data.limits.maxStoredGiB} GB`} />
            <KV k="Logisch" v={formatBytes(usage.data.logicalBytes)} />
          </Card>
        ) : null}

        {perMachine.data?.machines?.length ? (
          <Card style={{ gap: 10 }}>
            <Txt variant="caption" color={t.faint}>
              Compute pro Sandbox
            </Txt>
            {perMachine.data.machines.map((machine: any) => (
              <View key={machine.id} style={{ gap: 3, paddingTop: 8, borderTopWidth: 1, borderTopColor: t.border }}>
                <Row justify="space-between">
                  <Txt variant="body" numberOfLines={1} style={{ flex: 1 }}>
                    {machine.name}
                  </Txt>
                  <Txt variant="small" color={t.muted}>
                    {formatUsd(machine.computeUSD)}
                  </Txt>
                </Row>
                <Txt variant="small" color={t.faint}>
                  {formatDuration(machine.runningSeconds)} Laufzeit · {machine.vcpuSeconds} vCPU-s ·{' '}
                  {machine.memGiBSeconds} GiB-s
                </Txt>
              </View>
            ))}
          </Card>
        ) : null}

        <Card style={{ marginTop: 12 }}>
          <Txt variant="small" color={t.faint} style={{ lineHeight: 19 }}>
            Preise: vCPU 0,004 $ pro Stunde, Arbeitsspeicher 0,00225 $ pro GiB-Stunde, Speicher 0,00011 $ pro
            GiB-Stunde, Egress 0,02 $ pro GiB. Abgerechnet wird pro Sekunde, solange die Sandbox läuft.
          </Txt>
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}
