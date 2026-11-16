import React, { useCallback, useState } from 'react';
import { Pressable, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Btn, Card, EmptyState, Row, Txt, useDialog, useTheme } from '../../components/ui';
import { useSession } from '../../lib/store';
import { errorText } from '../../lib/errors';
import { useAsync } from '../../lib/hooks';
import type { FilesPayload, Machine } from '../../lib/types';
import { formatBytes, formatDateTime } from '../../lib/format';

export default function FilesTab({ machine }: { machine: Machine }) {
  const t = useTheme();
  const dialog = useDialog();
  const { client } = useSession();
  const [path, setPath] = useState('/');
  const [openFile, setOpenFile] = useState<FilesPayload | null>(null);

  const files = useAsync(async () => {
    if (!client) return null;
    if (machine.state !== 'running') return null;
    return client.get<FilesPayload>(`/v1/machines/${machine.id}/files`, { path });
  }, [client, machine.id, machine.state, path]);

  const openEntry = useCallback(
    async (entryName: string, type: string) => {
      const target = (path === '/' ? '' : path) + '/' + entryName;
      if (type === 'dir') {
        setPath(target);
        setOpenFile(null);
        return;
      }
      try {
        const result = await client?.get<FilesPayload>(`/v1/machines/${machine.id}/files`, { path: target });
        setOpenFile(result || null);
      } catch (e) {
        dialog.toast(errorText(e), 'error');
      }
    },
    [client, dialog, machine.id, path]
  );

  const remove = useCallback(
    async (name: string) => {
      const target = (path === '/' ? '' : path) + '/' + name;
      const ok = await dialog.confirm({
        title: 'Datei löschen?',
        message: `${target} wird unwiderruflich entfernt.`,
        confirmLabel: 'Löschen',
        destructive: true,
      });
      if (!ok) return;
      try {
        await client?.post(`/v1/machines/${machine.id}/exec`, {
          argv: ['rm', '-rf', target],
        });
        dialog.toast('Gelöscht', 'success');
        files.reload();
      } catch (e) {
        dialog.toast(errorText(e), 'error');
      }
    },
    [client, dialog, files, machine.id, path]
  );

  if (machine.state !== 'running') {
    return (
      <EmptyState
        icon="folder-outline"
        title="Dateien nur bei laufender Maschine"
        message="Starte die Sandbox, um Dateien zu sehen und zu bearbeiten."
      />
    );
  }

  const crumbs = path.split('/').filter(Boolean);

  return (
    <View style={{ gap: 12 }}>
      <Card style={{ gap: 10 }}>
        <Row gap={6} wrap>
          <Pressable onPress={() => setPath('/')}>
            <Row gap={4}>
              <Ionicons name="home-outline" size={14} color={t.accent} />
              <Txt variant="small" color={t.accent}>
                root
              </Txt>
            </Row>
          </Pressable>
          {crumbs.map((crumb, index) => (
            <Row key={`${crumb}-${index}`} gap={4}>
              <Ionicons name="chevron-forward" size={12} color={t.faint} />
              <Pressable
                onPress={() => {
                  setPath('/' + crumbs.slice(0, index + 1).join('/'));
                  setOpenFile(null);
                }}
              >
                <Txt variant="small" color={t.muted}>
                  {crumb}
                </Txt>
              </Pressable>
            </Row>
          ))}
        </Row>
        {files.error ? (
          <Txt variant="small" color={t.red}>
            {files.error}
          </Txt>
        ) : null}
      </Card>

      {openFile ? (
        <Card style={{ gap: 10 }}>
          <Row justify="space-between">
            <Txt variant="heading" numberOfLines={1} style={{ flex: 1 }}>
              {openFile.path.split('/').pop()}
            </Txt>
            <Btn title="Schließen" small onPress={() => setOpenFile(null)} />
          </Row>
          <Txt variant="small" color={t.faint}>
            {formatBytes(openFile.size)} · {formatDateTime(openFile.modTime)} · {openFile.mode}
          </Txt>
          {openFile.binary ? (
            <Txt variant="small" color={t.yellow}>
              Binärdatei – nicht als Text darstellbar.
            </Txt>
          ) : (
            <Txt variant="mono" color={t.muted} style={{ lineHeight: 18 }}>
              {openFile.content || '(leer)'}
            </Txt>
          )}
        </Card>
      ) : null}

      <Card style={{ padding: 0, overflow: 'hidden' }}>
        {(files.data?.entries || []).map((entry, index) => (
          <View key={entry.name}>
            {index > 0 ? <View style={{ height: 1, backgroundColor: t.border }} /> : null}
            <Pressable
              onPress={() => openEntry(entry.name, entry.type)}
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                gap: 11,
                paddingHorizontal: 14,
                paddingVertical: 12,
                backgroundColor: pressed ? t.surfaceAlt : 'transparent',
              })}
            >
              <Ionicons
                name={entry.type === 'dir' ? 'folder' : entry.type === 'symlink' ? 'link' : 'document-text-outline'}
                size={18}
                color={entry.type === 'dir' ? t.blue : t.faint}
              />
              <View style={{ flex: 1 }}>
                <Txt variant="body" numberOfLines={1}>
                  {entry.name}
                </Txt>
                <Txt variant="small" color={t.faint}>
                  {entry.type === 'dir' ? 'Ordner' : formatBytes(entry.size)} · {formatDateTime(entry.modTime)}
                </Txt>
              </View>
              <Pressable onPress={() => remove(entry.name)} hitSlop={10}>
                <Ionicons name="trash-outline" size={16} color={t.faint} />
              </Pressable>
            </Pressable>
          </View>
        ))}
        {!files.loading && !(files.data?.entries || []).length ? (
          <View style={{ padding: 18 }}>
            <Txt variant="small" color={t.faint}>
              Keine Einträge.
            </Txt>
          </View>
        ) : null}
      </Card>
    </View>
  );
}
