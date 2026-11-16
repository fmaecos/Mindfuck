import React, { useCallback, useState } from 'react';
import { Linking, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Btn, Card, Field, Row, SectionTitle, Txt, useDialog, useTheme } from '../../components/ui';
import { useSession } from '../../lib/store';
import { waitForOperation } from '../../lib/api';
import { errorText } from '../../lib/errors';
import { useAsync } from '../../lib/hooks';
import type { Machine, Snapshot } from '../../lib/types';

export default function MoreTab({ machine, onChanged }: { machine: Machine; onChanged: () => void }) {
  const t = useTheme();
  const dialog = useDialog();
  const { client } = useSession();
  const [newName, setNewName] = useState(machine.name);
  const [snapshotName, setSnapshotName] = useState('');
  const [vcpus, setVcpus] = useState(String(machine.spec.vcpus));
  const [mem, setMem] = useState(String(machine.spec.memMiB));
  const [disk, setDisk] = useState(String(machine.spec.persistentDiskGiB));
  const [autoSuspend, setAutoSuspend] = useState(String(machine.autoSuspendAfterSeconds ?? 0));
  const [busy, setBusy] = useState(false);

  const snapshots = useAsync(async () => {
    if (!client) return null;
    return client.get<{ snapshots: Snapshot[] }>('/v1/snapshots');
  }, [client]);

  const run = useCallback(
    async (fn: () => Promise<void>, successMessage: string) => {
      setBusy(true);
      try {
        await fn();
        dialog.toast(successMessage, 'success');
        onChanged();
      } catch (e) {
        dialog.toast(errorText(e), 'error');
      } finally {
        setBusy(false);
      }
    },
    [dialog, onChanged]
  );

  const rename = () =>
    run(async () => {
      await client?.patch(`/v1/machines/${machine.id}`, { name: newName.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-') });
    }, 'Name gespeichert');

  const resize = () =>
    run(async () => {
      await client?.patch(`/v1/machines/${machine.id}`, {
        vcpus: Number(vcpus),
        memMiB: Number(mem),
        persistentDiskGiB: Number(disk),
      });
    }, 'Größe gespeichert');

  const changeAutoSuspend = () =>
    run(async () => {
      await client?.patch(`/v1/machines/${machine.id}`, { autoSuspendAfterSeconds: Number(autoSuspend) });
    }, 'Idle-Pause gespeichert');

  const saveSnapshot = () =>
    run(async () => {
      await client?.post(
        `/v1/machines/${machine.id}/snapshots`,
        { name: snapshotName.trim() || `snap-${Date.now().toString(36)}` },
        { idempotent: true }
      );
      setSnapshotName('');
      snapshots.reload();
    }, 'Snapshot wird gespeichert');

  const fork = () =>
    run(async () => {
      const op = await client?.post(`/v1/machines/${machine.id}/fork`, {}, { idempotent: true });
      await waitForOperation(client!, op?.id, undefined, 180_000);
    }, 'Kopie wird erstellt');

  const restore = async (snapshot: Snapshot) => {
    const ok = await dialog.confirm({
      title: 'Snapshot wiederherstellen?',
      message: `Die Datenträger von ${machine.name} werden auf „${snapshot.name}“ zurückgesetzt.`,
      confirmLabel: 'Wiederherstellen',
      destructive: true,
    });
    if (!ok) return;
    await run(async () => {
      const op = await client?.post(
        `/v1/machines/${machine.id}/restore`,
        { snapshotId: snapshot.id },
        { idempotent: true }
      );
      await waitForOperation(client!, op?.id, undefined, 300_000);
    }, 'Wiederhergestellt');
  };

  const shareDesktop = () =>
    run(async () => {
      const link = await client?.post<{ url: string; expiresAt: string }>(
        `/v1/machines/${machine.id}/desktop/stream`,
        { viewOnly: true, ttlSeconds: 3600 },
        { idempotent: true }
      );
      if (link?.url) {
        await Clipboard.setStringAsync(link.url);
        dialog.toast('Link kopiert (gilt für eine Stunde)', 'success');
      }
    }, 'Freigabelink erstellt');

  const remove = async () => {
    const typed = await dialog.prompt({
      title: 'Maschine löschen',
      message: `Tippe den Namen „${machine.name}“ zur Bestätigung. Dateien und Snapshots gehen verloren.`,
      placeholder: machine.name,
      confirmLabel: 'Löschen',
      destructive: true,
    });
    if (typed !== machine.name) return;
    await run(async () => {
      await client?.del(`/v1/machines/${machine.id}`, {
        idempotent: true,
        confirmDelete: machine.name,
      });
    }, 'Maschine wird gelöscht');
  };

  return (
    <View style={{ gap: 12 }}>
      <Card style={{ gap: 12 }}>
        <Txt variant="heading">Umbenennen</Txt>
        <Field value={newName} onChangeText={setNewName} placeholder={machine.name} />
        <Btn title="Speichern" small loading={busy} onPress={rename} />
      </Card>

      <Card style={{ gap: 12 }}>
        <Txt variant="heading">Größe ändern</Txt>
        <Txt variant="small" color={t.muted} style={{ lineHeight: 19 }}>
          vCPU und RAM werden beim nächsten Start angewendet, die Platte wächst auch im Betrieb.
        </Txt>
        <Row gap={8}>
          <View style={{ flex: 1 }}>
            <Field label="vCPU" value={vcpus} onChangeText={setVcpus} keyboardType="numeric" />
          </View>
          <View style={{ flex: 1 }}>
            <Field label="RAM (MiB)" value={mem} onChangeText={setMem} keyboardType="numeric" />
          </View>
          <View style={{ flex: 1 }}>
            <Field label="Disk (GB)" value={disk} onChangeText={setDisk} keyboardType="numeric" />
          </View>
        </Row>
        <Btn title="Größe speichern" small loading={busy} onPress={resize} />
      </Card>

      <Card style={{ gap: 12 }}>
        <Txt variant="heading">Idle-Pause</Txt>
        <Field
          label="Sekunden (0 = aus)"
          value={autoSuspend}
          onChangeText={setAutoSuspend}
          keyboardType="numeric"
          hint="Zwischen 300 und 1800 Sekunden in ganzen Minuten, je nach Plan."
        />
        <Btn title="Speichern" small loading={busy} onPress={changeAutoSuspend} />
      </Card>

      <SectionTitle title="Snapshots" />
      <Card style={{ gap: 12 }}>
        <Row gap={8}>
          <View style={{ flex: 1 }}>
            <Field label="Neuer Snapshot" value={snapshotName} onChangeText={setSnapshotName} placeholder="release-1.2" />
          </View>
        </Row>
        <Btn title="Snapshot speichern" icon="save-outline" small loading={busy} onPress={saveSnapshot} />
        {(snapshots.data?.snapshots || [])
          .filter((snap) => snap.sourceMachineId === machine.id)
          .map((snap) => (
            <View key={snap.id} style={{ gap: 6, paddingTop: 10, borderTopWidth: 1, borderTopColor: t.border }}>
              <Row justify="space-between">
                <Row gap={6}>
                  <Ionicons name="save-outline" size={14} color={t.faint} />
                  <Txt variant="body">{snap.name}</Txt>
                </Row>
                <Txt variant="small" color={snap.status === 'ready' ? t.green : t.yellow}>
                  {snap.status}
                </Txt>
              </Row>
              <Btn title="Wiederherstellen" small onPress={() => restore(snap)} />
            </View>
          ))}
      </Card>

      <SectionTitle title="Aktionen" />
      <Card style={{ gap: 10 }}>
        <Btn title="Kopie (Fork) erstellen" icon="copy-outline" loading={busy} onPress={fork} />
        <Btn title="Desktop-Link teilen" icon="link-outline" loading={busy} onPress={shareDesktop} />
        <Btn
          title="Maschine löschen"
          icon="trash-outline"
          kind="danger"
          loading={busy}
          onPress={remove}
        />
      </Card>

      <Card style={{ gap: 6 }}>
        <Txt variant="caption" color={t.faint}>
          Schnellbefehle
        </Txt>
        <Txt variant="mono" color={t.muted}>
          instabox logs {machine.name}
        </Txt>
        <Txt variant="mono" color={t.muted}>
          instabox snapshot save {machine.name} --name release
        </Txt>
        <Txt variant="mono" color={t.muted}>
          instabox resize {machine.name} --disk 50
        </Txt>
        <Row gap={8} style={{ marginTop: 6 }}>
          <Btn
            title="CLI-Doku"
            small
            icon="open-outline"
            onPress={() => Linking.openURL('https://instabox.sh/docs/cli.md').catch(() => {})}
          />
        </Row>
      </Card>
    </View>
  );
}
