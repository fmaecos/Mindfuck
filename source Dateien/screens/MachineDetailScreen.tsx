import React, { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as Clipboard from 'expo-clipboard';
import { Banner, Btn, Card, Row, StateBadge, Txt, useDialog, useTheme } from '../components/ui';
import { useSession } from '../lib/store';
import { waitForOperation } from '../lib/api';
import { errorText } from '../lib/errors';
import { useAsync } from '../lib/hooks';
import type { Machine } from '../lib/types';
import type { RootStackParamList } from '../navigation/types';
import OverviewTab from './machine/OverviewTab';
import ConsoleTab from './machine/ConsoleTab';
import FilesTab from './machine/FilesTab';
import ProcessesTab from './machine/ProcessesTab';
import LogsTab from './machine/LogsTab';
import PortsTab from './machine/PortsTab';
import SshTab from './machine/SshTab';
import MoreTab from './machine/MoreTab';

const TABS = [
  { id: 'overview', label: 'Übersicht', icon: 'information-circle-outline' },
  { id: 'console', label: 'Konsole', icon: 'terminal-outline' },
  { id: 'files', label: 'Dateien', icon: 'folder-outline' },
  { id: 'processes', label: 'Prozesse', icon: 'pulse-outline' },
  { id: 'logs', label: 'Logs', icon: 'reader-outline' },
  { id: 'ports', label: 'Ports', icon: 'globe-outline' },
  { id: 'ssh', label: 'SSH', icon: 'key-outline' },
  { id: 'more', label: 'Mehr', icon: 'ellipsis-horizontal-circle-outline' },
] as const;

type TabId = (typeof TABS)[number]['id'];

export default function MachineDetailScreen() {
  const t = useTheme();
  const route = useRoute<RouteProp<RootStackParamList, 'MachineDetail'>>();
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const dialog = useDialog();
  const { client } = useSession();
  const [tab, setTab] = useState<TabId>('overview');
  const [busy, setBusy] = useState(false);

  const load = useAsync(async () => {
    if (!client) return null;
    return client.get<Machine>(`/v1/machines/${route.params.id}`);
  }, [client, route.params.id]);

  const machine = load.data;

  const act = useCallback(
    async (action: 'start' | 'stop' | 'suspend' | 'resume' | 'wake') => {
      if (!client || !machine) return;
      setBusy(true);
      try {
        const op = await client.post(`/v1/machines/${machine.id}/${action}`, {}, { idempotent: action !== 'wake' });
        await waitForOperation(client, op?.id, undefined, 180_000);
        load.reload();
      } catch (e) {
        dialog.toast(errorText(e), 'error');
      } finally {
        setBusy(false);
      }
    },
    [client, dialog, load, machine]
  );

  const content = useMemo(() => {
    if (!machine) return null;
    switch (tab) {
      case 'overview':
        return <OverviewTab machine={machine} />;
      case 'console':
        return <ConsoleTab machine={machine} />;
      case 'files':
        return <FilesTab machine={machine} />;
      case 'processes':
        return <ProcessesTab machine={machine} />;
      case 'logs':
        return <LogsTab machine={machine} />;
      case 'ports':
        return <PortsTab machine={machine} />;
      case 'ssh':
        return <SshTab machine={machine} />;
      default:
        return <MoreTab machine={machine} onChanged={load.reload} />;
    }
  }, [tab, machine, load.reload]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.bg }} edges={['bottom', 'left', 'right']}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Row gap={8}>
            <Txt variant="title" numberOfLines={1} style={{ flex: 1 }}>
              {machine?.name || route.params.name || 'Sandbox'}
            </Txt>
            {machine ? <StateBadge state={machine.state} /> : null}
          </Row>
          <Pressable
            onPress={() => {
              Clipboard.setStringAsync(machine?.id || route.params.id);
              dialog.toast('ID kopiert');
            }}
          >
            <Row gap={5}>
              <Txt variant="mono" color={t.faint} numberOfLines={1} style={{ flex: 1 }}>
                {machine?.id || route.params.id}
              </Txt>
              <Ionicons name="copy-outline" size={13} color={t.faint} />
            </Row>
          </Pressable>
        </View>
      </View>

      {machine ? (
        <View style={{ paddingHorizontal: 16, paddingBottom: 10 }}>
          <Row gap={8} wrap>
            {machine.state === 'running' ? (
              <Btn title="Stoppen" icon="stop" small loading={busy} onPress={() => act('stop')} />
            ) : machine.state === 'suspended' ? (
              <>
                <Btn title="Fortsetzen" icon="play" small loading={busy} onPress={() => act('resume')} />
                <Btn title="Stoppen" icon="stop" small loading={busy} onPress={() => act('stop')} />
              </>
            ) : (
              <Btn title="Starten" icon="play" small kind="primary" loading={busy} onPress={() => act('start')} />
            )}
            <Btn
              title="Desktop"
              icon="desktop-outline"
              small
              onPress={() => nav.navigate('Desktop', { id: machine.id, name: machine.name })}
            />
            <Btn
              title="Terminal"
              icon="terminal-outline"
              small
              onPress={() => nav.navigate('Terminal', { id: machine.id, name: machine.name })}
            />
          </Row>
        </View>
      ) : null}

      <View style={[styles.tabs, { borderColor: t.border }]}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 12, gap: 4 }}>
          {TABS.map((item) => {
            const active = tab === item.id;
            return (
              <Pressable
                key={item.id}
                onPress={() => setTab(item.id)}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 5,
                  paddingVertical: 9,
                  paddingHorizontal: 11,
                  borderRadius: 10,
                  backgroundColor: active ? t.surfaceAlt : 'transparent',
                }}
              >
                <Ionicons name={item.icon} size={14} color={active ? t.accent : t.faint} />
                <Txt variant="small" color={active ? t.text : t.faint} style={{ fontWeight: active ? '700' : '500' }}>
                  {item.label}
                </Txt>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
        {load.error ? <Banner text={load.error} tone="error" /> : null}
        {machine?.lastError ? (
          <View style={{ marginBottom: 12 }}>
            <Banner text={`${machine.lastError.code}: ${machine.lastError.message}`} tone="warn" icon="alert-circle-outline" />
          </View>
        ) : null}
        {!machine && load.loading ? (
          <Card>
            <Txt variant="small" color={t.faint}>
              Lade Maschine …
            </Txt>
          </Card>
        ) : null}
        {content}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: 16, paddingTop: 6, paddingBottom: 10 },
  tabs: { borderBottomWidth: 1 },
});
