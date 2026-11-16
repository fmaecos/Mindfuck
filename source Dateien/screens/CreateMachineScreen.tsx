import React, { useCallback, useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Btn, Card, Chip, Field, Row, SectionTitle, Txt, Toggle, useDialog, useTheme } from '../components/ui';
import { useSession } from '../lib/store';
import { waitForOperation } from '../lib/api';
import { errorText } from '../lib/errors';
import { useAsync } from '../lib/hooks';
import type { MachineSpec, Snapshot, TemplateVersion } from '../lib/types';
import { formatBytes } from '../lib/format';
import type { RootStackParamList } from '../navigation/types';

function parsePairs(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .forEach((line) => {
      const index = line.indexOf('=');
      if (index <= 0) return;
      out[line.slice(0, index).trim()] = line.slice(index + 1).trim();
    });
  return out;
}

export default function CreateMachineScreen() {
  const t = useTheme();
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const dialog = useDialog();
  const { client, me, orgs, session } = useSession();

  const [name, setName] = useState('');
  const [source, setSource] = useState<{ kind: 'template' | 'snapshot'; id: string }>({ kind: 'template', id: 'agent-browser' });
  const [spec, setSpec] = useState<MachineSpec | null>(null);
  const [autoSuspend, setAutoSuspend] = useState(1800);
  const [startRunning, setStartRunning] = useState(true);
  const [envText, setEnvText] = useState('');
  const [metaText, setMetaText] = useState('');
  const [busy, setBusy] = useState(false);

  const templates = useAsync(async () => {
    if (!client) return { templates: [] as TemplateVersion[] };
    return client.get<{ templates: TemplateVersion[] }>('/v1/templates');
  }, [client]);

  const snapshots = useAsync(async () => {
    if (!client) return { snapshots: [] as Snapshot[] };
    return client.get<{ snapshots: Snapshot[] }>('/v1/snapshots');
  }, [client]);

  const specs = useMemo<MachineSpec[]>(() => {
    const fromMe = me?.allowedSpecs?.length ? me.allowedSpecs : null;
    const fromOrg = orgs.flatMap((o) => o.allowedSpecs || []);
    const list = fromMe || fromOrg;
    if (list.length) return list;
    return [{ vcpus: 4, memMiB: 8192, persistentDiskGiB: 20 }];
  }, [me, orgs]);

  const activeSpec = spec || specs[0];

  const create = useCallback(async () => {
    if (!client) return;
    setBusy(true);
    try {
      const body: Record<string, any> = {
        desiredState: startRunning ? 'running' : 'stopped',
      };
      if (name.trim()) body.name = name.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-');
      if (source.kind === 'template') body.templateId = source.id;
      else body.snapshotId = source.id;
      if (activeSpec) {
        body.vcpus = activeSpec.vcpus;
        body.memMiB = activeSpec.memMiB;
      }
      const env = parsePairs(envText);
      if (Object.keys(env).length) body.env = env;
      const metadata = parsePairs(metaText);
      if (Object.keys(metadata).length) body.metadata = metadata;
      if (autoSuspend > 0) body.autoSuspendAfterSeconds = autoSuspend;

      const op = await client.post('/v1/machines', body, { idempotent: true });
      dialog.toast('Sandbox wird erstellt …', 'success');
      try {
        await waitForOperation(client, op?.id, undefined, 300_000);
      } catch (e) {
        /* the machine may still come up */
      }
      nav.replace('MachineDetail', { id: op?.machineId || '', name: body.name });
    } catch (e) {
      dialog.toast(errorText(e), 'error');
    } finally {
      setBusy(false);
    }
  }, [activeSpec, autoSuspend, client, dialog, envText, metaText, name, nav, source, startRunning]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.bg }} edges={['bottom', 'left', 'right']}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={90}
      >
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
          <Card style={{ gap: 12 }}>
            <Txt variant="heading">Neue Sandbox</Txt>
            <Field
              label="Name"
              value={name}
              onChangeText={setName}
              placeholder="z. B. build-agent"
              hint="Kleinbuchstaben, Ziffern und Bindestriche. Leer lassen für einen automatischen Namen."
            />
          </Card>

          <SectionTitle title="Vorlage" />
          <Row gap={8} wrap>
            {(templates.data?.templates || [])
              .filter((tpl) => tpl.creatable !== false && !tpl.hidden)
              .map((tpl) => (
                <Chip
                  key={`${tpl.id}-${tpl.version}`}
                  label={tpl.id}
                  active={source.kind === 'template' && source.id === tpl.id}
                  onPress={() => setSource({ kind: 'template', id: tpl.id })}
                />
              ))}
          </Row>
          {templates.data?.templates?.find((tpl) => tpl.id === source.id)?.description ? (
            <Txt variant="small" color={t.faint} style={{ marginTop: 8, lineHeight: 18 }}>
              {templates.data.templates.find((tpl) => tpl.id === source.id)?.description}
            </Txt>
          ) : null}

          {(snapshots.data?.snapshots || []).length ? (
            <>
              <SectionTitle title="Snapshot" />
              <Row gap={8} wrap>
                {(snapshots.data?.snapshots || []).map((snap) => (
                  <Chip
                    key={snap.id}
                    label={snap.name}
                    icon="save-outline"
                    active={source.kind === 'snapshot' && source.id === snap.id}
                    onPress={() => setSource({ kind: 'snapshot', id: snap.id })}
                  />
                ))}
              </Row>
            </>
          ) : null}

          <SectionTitle title="Größe" />
          <Row gap={8} wrap>
            {specs.map((s) => (
              <Chip
                key={`${s.vcpus}-${s.memMiB}`}
                label={`${s.vcpus} vCPU · ${formatBytes(s.memMiB * 1024 * 1024).replace('B', '')}`}
                active={activeSpec?.vcpus === s.vcpus && activeSpec?.memMiB === s.memMiB}
                onPress={() => setSpec(s)}
              />
            ))}
          </Row>
          {session?.kind !== 'demo' ? (
            <Txt variant="small" color={t.faint} style={{ marginTop: 8 }}>
              Die Größe richtet sich nach deinem Plan. Der Speicher (20 GB) kommt vom Template.
            </Txt>
          ) : null}

          <SectionTitle title="Lebenszyklus" />
          <Card style={{ gap: 12 }}>
            <Toggle
              value={startRunning}
              onChange={setStartRunning}
              label="Sofort starten"
              description="Sonst wird die Sandbox gestoppt angelegt und startet bei Bedarf."
            />
            <View style={{ gap: 8 }}>
              <Txt variant="small">Automatisch pausieren nach</Txt>
              <Row gap={8} wrap>
                {[300, 600, 900, 1200, 1800, 0].map((seconds) => (
                  <Chip
                    key={seconds}
                    label={seconds === 0 ? 'aus' : `${seconds / 60} min`}
                    active={autoSuspend === seconds}
                    onPress={() => setAutoSuspend(seconds)}
                  />
                ))}
              </Row>
            </View>
          </Card>

          <SectionTitle title="Umgebung" />
          <Card style={{ gap: 12 }}>
            <Field
              label="Variablen (KEY=WERT pro Zeile)"
              value={envText}
              onChangeText={setEnvText}
              placeholder={'NODE_ENV=production\nAPI_URL=https://…'}
              multiline
              mono
            />
            <Field
              label="Labels (key=value pro Zeile)"
              value={metaText}
              onChangeText={setMetaText}
              placeholder={'project=website\nteam=core'}
              multiline
              mono
              hint="Labels lassen sich später filtern: instabox ls --metadata project=website"
            />
          </Card>

          <Btn
            title="Sandbox erstellen"
            kind="primary"
            icon="cube"
            loading={busy}
            style={{ marginTop: 20 }}
            onPress={create}
          />
          <Row gap={8} style={{ marginTop: 10, justifyContent: 'center' }}>
            <Ionicons name="information-circle-outline" size={14} color={t.faint} />
            <Txt variant="small" color={t.faint} style={{ flex: 1 }}>
              Das Anlegen läuft als Operation. Du kannst den Fortschritt in der Detailansicht verfolgen.
            </Txt>
          </Row>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
