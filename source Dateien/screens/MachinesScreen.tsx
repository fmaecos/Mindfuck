import React, { useCallback, useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, TextInput, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Btn, Card, Chip, EmptyState, ErrorState, Row, Skeleton, StateBadge, Txt, useDialog, useTheme } from '../components/ui';
import { useSession } from '../lib/store';
import { waitForOperation } from '../lib/api';
import { errorText } from '../lib/errors';
import { useAsync } from '../lib/hooks';
import type { Machine } from '../lib/types';
import { formatRelative, formatSpec } from '../lib/format';
import type { RootStackParamList } from '../navigation/types';

type Filter = 'alle' | 'running' | 'stopped' | 'suspended' | 'error';

export default function MachinesScreen() {
  const t = useTheme();
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const dialog = useDialog();
  const { client, session } = useSession();
  const [filter, setFilter] = useState<Filter>('alle');
  const [query, setQuery] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useAsync(async () => {
    if (!client) return { machines: [] as Machine[] };
    const result = await client.get<{ machines: Machine[] }>('/v1/machines', { limit: 100 });
    return result;
  }, [client]);

  const machines = useMemo(() => {
    const list = load.data?.machines || [];
    const q = query.trim().toLowerCase();
    return list.filter((m) => {
      if (filter !== 'alle' && m.state !== filter) return false;
      if (!q) return true;
      return (
        m.name.toLowerCase().includes(q) ||
        m.id.toLowerCase().includes(q) ||
        (m.template?.id || '').toLowerCase().includes(q)
      );
    });
  }, [load.data, filter, query]);

  const act = useCallback(
    async (machine: Machine, action: 'start' | 'stop' | 'suspend' | 'resume') => {
      if (!client) return;
      setBusyId(machine.id);
      try {
        const op = await client.post(`/v1/machines/${machine.id}/${action}`, {}, { idempotent: true });
        await waitForOperation(client, op?.id, undefined, 180_000);
        load.reload();
        dialog.toast(`${machine.name}: ${action === 'start' ? 'gestartet' : action === 'stop' ? 'gestoppt' : action === 'suspend' ? 'pausiert' : 'fortgesetzt'}`, 'success');
      } catch (e) {
        dialog.toast(errorText(e), 'error');
      } finally {
        setBusyId(null);
      }
    },
    [client, dialog, load]
  );

  const renderItem = useCallback(
    ({ item }: { item: Machine }) => {
      const busy = busyId === item.id;
      const running = item.state === 'running';
      const paused = item.state === 'suspended';
      return (
        <Card style={{ marginBottom: 12, gap: 12 }} onPress={() => nav.navigate('MachineDetail', { id: item.id, name: item.name })}>
          <Row justify="space-between" align="flex-start">
            <View style={{ flex: 1, paddingRight: 8 }}>
              <Txt variant="heading" numberOfLines={1}>
                {item.name}
              </Txt>
              <Txt variant="small" color={t.faint} style={{ marginTop: 3 }}>
                {item.template?.id} · {formatSpec(item.spec.vcpus, item.spec.memMiB)} · {item.spec.persistentDiskGiB} GB
              </Txt>
            </View>
            <StateBadge state={item.state} />
          </Row>

          <Row gap={6} wrap>
            <Ionicons name="time-outline" size={13} color={t.faint} />
            <Txt variant="small" color={t.faint}>
              erstellt {formatRelative(item.createdAt)}
            </Txt>
            {item.oomKills ? (
              <>
                <Txt variant="small" color={t.faint}>
                  ·
                </Txt>
                <Txt variant="small" color={t.yellow}>
                  {item.oomKills} OOM-Kills
                </Txt>
              </>
            ) : null}
          </Row>

          <Row gap={8} wrap>
            {running || paused ? (
              <Btn
                title={running ? 'Stoppen' : 'Fortsetzen'}
                icon={running ? 'stop' : 'play'}
                small
                loading={busy}
                onPress={() => act(item, running ? 'stop' : 'resume')}
              />
            ) : (
              <Btn title="Starten" icon="play" small loading={busy} onPress={() => act(item, 'start')} />
            )}
            <Btn
              title="Desktop"
              icon="desktop-outline"
              small
              onPress={() => nav.navigate('Desktop', { id: item.id, name: item.name })}
            />
            <Btn
              title="Terminal"
              icon="terminal-outline"
              small
              onPress={() => nav.navigate('Terminal', { id: item.id, name: item.name })}
            />
          </Row>
        </Card>
      );
    },
    [act, busyId, nav, t]
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.bg }} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Txt variant="title">Maschinen</Txt>
          <Txt variant="small" color={t.faint}>
            {load.data ? `${load.data.machines.length} Sandboxen im Workspace` : 'Lade …'}
          </Txt>
        </View>
        <Btn title="Neu" icon="add" kind="primary" small onPress={() => nav.navigate('CreateMachine')} />
      </View>

      {session?.kind === 'demo' ? (
        <View style={{ paddingHorizontal: 16, paddingBottom: 8 }}>
          <Card style={{ backgroundColor: t.blueSoft, borderColor: 'transparent', paddingVertical: 10 }}>
            <Row gap={8}>
              <Ionicons name="flask-outline" size={16} color={t.blue} />
              <Txt variant="small" color={t.blue} style={{ flex: 1 }}>
                Demo-Modus: simulierte Daten, keine echten Instanzen.
              </Txt>
            </Row>
          </Card>
        </View>
      ) : null}

      <View style={{ paddingHorizontal: 16, gap: 10, paddingBottom: 10 }}>
        <View style={[styles.search, { backgroundColor: t.surface, borderColor: t.border }]}>
          <Ionicons name="search" size={16} color={t.faint} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Name oder ID suchen"
            placeholderTextColor={t.faint}
            autoCapitalize="none"
            autoCorrect={false}
            style={{ flex: 1, color: t.text, fontSize: 14, paddingVertical: 2 }}
          />
          {query ? (
            <Pressable onPress={() => setQuery('')} hitSlop={8}>
              <Ionicons name="close-circle" size={16} color={t.faint} />
            </Pressable>
          ) : (
            <Txt variant="small" color={t.faint}>
              {machines.length}
            </Txt>
          )}
        </View>
        <Row gap={8} wrap>
          {(
            [
              ['alle', 'Alle'],
              ['running', 'Läuft'],
              ['stopped', 'Gestoppt'],
              ['suspended', 'Pausiert'],
              ['error', 'Fehler'],
            ] as [Filter, string][]
          ).map(([id, label]) => (
            <Chip key={id} label={label} active={filter === id} onPress={() => setFilter(id)} />
          ))}
        </Row>
      </View>

      {load.loading && !load.data ? (
        <View style={{ paddingHorizontal: 16, gap: 12 }}>
          <Skeleton />
          <Skeleton />
          <Skeleton />
        </View>
      ) : load.error ? (
        <View style={{ paddingHorizontal: 16 }}>
          <ErrorState message={load.error} onRetry={load.reload} />
        </View>
      ) : (
        <FlatList
          data={machines}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 30 }}
          refreshControl={
            <RefreshControl refreshing={load.loading && !!load.data} onRefresh={load.reload} tintColor={t.accent} />
          }
          ListEmptyComponent={
            <EmptyState
              icon="cube-outline"
              title="Keine Maschinen"
              message="Lege eine Sandbox an, um loszulegen."
              action={<Btn title="Sandbox erstellen" kind="primary" icon="add" onPress={() => nav.navigate('CreateMachine')} />}
            />
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
  },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
});
