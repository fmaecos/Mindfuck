import React, { useCallback, useState } from 'react';
import { FlatList, RefreshControl, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Btn, Card, EmptyState, ErrorState, Row, Skeleton, Txt, useDialog, useTheme } from '../components/ui';
import { useSession } from '../lib/store';
import { errorText } from '../lib/errors';
import { useAsync } from '../lib/hooks';
import type { Snapshot } from '../lib/types';
import { formatBytes, formatDateTime } from '../lib/format';
import type { RootStackParamList } from '../navigation/types';

export default function SnapshotsScreen() {
  const t = useTheme();
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const dialog = useDialog();
  const { client } = useSession();
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useAsync(async () => {
    if (!client) return { snapshots: [] as Snapshot[] };
    return client.get<{ snapshots: Snapshot[] }>('/v1/snapshots');
  }, [client]);

  const remove = useCallback(
    async (snapshot: Snapshot) => {
      const ok = await dialog.confirm({
        title: 'Snapshot löschen?',
        message: `„${snapshot.name}“ wird entfernt. Maschinen, die daraus erstellt wurden, bleiben erhalten.`,
        confirmLabel: 'Löschen',
        destructive: true,
      });
      if (!ok) return;
      setBusyId(snapshot.id);
      try {
        await client?.del(`/v1/snapshots/${snapshot.id}`, {
          idempotent: true,
          confirmDelete: snapshot.name,
        });
        dialog.toast('Snapshot gelöscht', 'success');
        load.reload();
      } catch (e) {
        dialog.toast(errorText(e), 'error');
      } finally {
        setBusyId(null);
      }
    },
    [client, dialog, load]
  );

  const renderItem = useCallback(
    ({ item }: { item: Snapshot }) => (
      <Card style={{ marginBottom: 12, gap: 10 }}>
        <Row justify="space-between" align="flex-start">
          <View style={{ flex: 1, paddingRight: 8 }}>
            <Txt variant="heading" numberOfLines={1}>
              {item.name}
            </Txt>
            <Txt variant="small" color={t.faint} style={{ marginTop: 2 }}>
              {item.template?.id || 'Snapshot'} · {formatDateTime(item.createdAt)}
            </Txt>
          </View>
          <Row gap={6}>
            <Ionicons
              name={item.status === 'ready' ? 'checkmark-circle' : item.status === 'failed' ? 'close-circle' : 'sync-circle'}
              size={16}
              color={item.status === 'ready' ? t.green : item.status === 'failed' ? t.red : t.yellow}
            />
            <Txt variant="small" color={t.muted}>
              {item.status}
            </Txt>
          </Row>
        </Row>
        <Row gap={14} wrap>
          <Txt variant="small" color={t.muted}>
            System {formatBytes(item.rootSizeBytes)}
          </Txt>
          {item.dataSizeBytes ? (
            <Txt variant="small" color={t.muted}>
              Daten {formatBytes(item.dataSizeBytes)}
            </Txt>
          ) : null}
        </Row>
        {item.description ? (
          <Txt variant="small" color={t.faint}>
            {item.description}
          </Txt>
        ) : null}
        <Row gap={8}>
          <Btn
            title="Maschine erstellen"
            icon="cube-outline"
            small
            onPress={() => nav.navigate('CreateMachine')}
          />
          <Btn title="Löschen" icon="trash-outline" small kind="danger" loading={busyId === item.id} onPress={() => remove(item)} />
        </Row>
      </Card>
    ),
    [busyId, nav, remove, t]
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.bg }} edges={['top', 'left', 'right']}>
      <View style={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12 }}>
        <Txt variant="title">Snapshots</Txt>
        <Txt variant="small" color={t.faint}>
          {load.data ? `${load.data.snapshots.length} gespeicherte Images` : 'Lade …'}
        </Txt>
      </View>
      {load.loading && !load.data ? (
        <View style={{ paddingHorizontal: 16, gap: 12 }}>
          <Skeleton />
          <Skeleton />
        </View>
      ) : load.error ? (
        <View style={{ paddingHorizontal: 16 }}>
          <ErrorState message={load.error} onRetry={load.reload} />
        </View>
      ) : (
        <FlatList
          data={load.data?.snapshots || []}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 30 }}
          refreshControl={<RefreshControl refreshing={load.loading && !!load.data} onRefresh={load.reload} tintColor={t.accent} />}
          ListEmptyComponent={
            <EmptyState
              icon="save-outline"
              title="Keine Snapshots"
              message="Speichere einen Zustand einer Sandbox, um schnell neue Maschinen zu starten."
            />
          }
        />
      )}
    </SafeAreaView>
  );
}
