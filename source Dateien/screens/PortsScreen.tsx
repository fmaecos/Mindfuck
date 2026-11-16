import React from 'react';
import { Linking, ScrollView, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Banner, Btn, Card, EmptyState, Row, Txt, useTheme } from '../components/ui';
import { useSession } from '../lib/store';
import { useAsync } from '../lib/hooks';
import type { PublicPort } from '../lib/types';
import { formatDateTime } from '../lib/format';

export default function PortsScreen() {
  const t = useTheme();
  const { client } = useSession();

  const ports = useAsync(async () => {
    if (!client) return { ports: [] as PublicPort[] };
    return client.get<{ ports: PublicPort[]; enabled: boolean }>('/v1/ports');
  }, [client]);

  const machines = useAsync(async () => {
    if (!client) return { machines: [] as { id: string; name: string }[] };
    const res = await client.get<any>('/v1/machines');
    return { machines: (res.machines || []) as { id: string; name: string }[] };
  }, [client]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.bg }} edges={['bottom', 'left', 'right']}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        <Banner
          text="Öffentliche Ports sind HTTPS-Adressen auf deinen Sandboxen. Private Ports verlangen ein Token im Link."
          tone="info"
        />
        {(ports.data?.ports || []).map((port) => {
          const machine = machines.data?.machines?.find((m) => m.id === port.machineId);
          return (
            <Card key={port.id} style={{ marginBottom: 10, gap: 8 }}>
              <Row justify="space-between">
                <Row gap={8}>
                  <Ionicons name="link-outline" size={16} color={t.accent} />
                  <Txt variant="body" style={{ fontWeight: '600' }}>
                    {port.name || `Port ${port.port}`}
                  </Txt>
                </Row>
                <Txt variant="small" color={port.access === 'private' ? t.yellow : t.green}>
                  {port.access}
                </Txt>
              </Row>
              <Txt variant="small" color={t.faint}>
                {machine?.name || port.machineId} · Port {port.port} · seit {formatDateTime(port.createdAt)}
              </Txt>
              <Txt variant="mono" color={t.muted} numberOfLines={1}>
                {port.url}
              </Txt>
              <Btn
                title="Öffnen"
                icon="open-outline"
                small
                onPress={() => Linking.openURL(port.url).catch(() => {})}
              />
            </Card>
          );
        })}
        {!ports.loading && !(ports.data?.ports || []).length ? (
          <EmptyState icon="globe-outline" title="Keine Ports" message="Veröffentliche in der Maschinenansicht einen Port." />
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}
