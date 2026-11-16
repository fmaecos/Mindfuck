import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Btn, Card, Chip, Field, Row, Txt, useDialog, useTheme } from '../components/ui';
import { useSession } from '../lib/store';
import { errorText } from '../lib/errors';
import { searchDocs, KNOWLEDGE_SNAPSHOT_DATE } from '../lib/knowledge';
import {
  ChatMessage,
  DEFAULT_MODEL,
  listModels,
  runTurn,
  ToolCall,
  ToolDefinition,
  ToolResult,
} from '../lib/openai';
import { KNOWLEDGE } from '../lib/generated/knowledge';
import { waitForOperation } from '../lib/api';

const TOOLS: ToolDefinition[] = [
  {
    type: 'function',
    name: 'list_machines',
    description: 'Listet alle Sandboxen des angemeldeten Workspaces mit Zustand, Größe, Vorlage und Laufzeit.',
    parameters: { type: 'object', properties: {}, required: [], additionalProperties: false },
  },
  {
    type: 'function',
    name: 'get_machine',
    description: 'Holt Details zu einer Sandbox, angegeben mit ID oder Name.',
    parameters: {
      type: 'object',
      properties: { id: { type: 'string', description: 'ID oder Name der Sandbox' } },
      required: ['id'],
      additionalProperties: false,
    },
  },
  {
    type: 'function',
    name: 'machine_action',
    description: 'Startet, stoppt, pausiert oder weckt eine Sandbox und wartet auf das Ende der Operation.',
    parameters: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'ID oder Name der Sandbox' },
        action: { type: 'string', enum: ['start', 'stop', 'suspend', 'resume', 'wake'] },
      },
      required: ['id', 'action'],
      additionalProperties: false,
    },
  },
  {
    type: 'function',
    name: 'run_command',
    description: 'Führt einen Shell-Befehl in einer laufenden Sandbox aus (bash -lc) und liefert stdout, stderr und Exit-Code.',
    parameters: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'ID oder Name der Sandbox' },
        command: { type: 'string', description: 'Der Shell-Befehl' },
      },
      required: ['id', 'command'],
      additionalProperties: false,
    },
  },
  {
    type: 'function',
    name: 'create_machine',
    description: 'Erstellt eine neue Sandbox aus einer Vorlage oder einem Snapshot.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        template: { type: 'string', description: 'Vorlage, z. B. agent-browser, android, omarchy, ci, universal' },
        snapshot: { type: 'string', description: 'Name oder ID eines Snapshots' },
        vcpus: { type: 'integer' },
        mem_mib: { type: 'integer' },
      },
      required: [],
      additionalProperties: false,
    },
  },
  {
    type: 'function',
    name: 'delete_machine',
    description: 'Löscht eine Sandbox samt Dateien. Endgültig.',
    parameters: {
      type: 'object',
      properties: { id: { type: 'string' } },
      required: ['id'],
      additionalProperties: false,
    },
  },
  {
    type: 'function',
    name: 'list_snapshots',
    description: 'Listet alle gespeicherten Snapshots.',
    parameters: { type: 'object', properties: {}, required: [], additionalProperties: false },
  },
  {
    type: 'function',
    name: 'list_templates',
    description: 'Listet die Vorlagen, aus denen neue Sandboxen erstellt werden können.',
    parameters: { type: 'object', properties: {}, required: [], additionalProperties: false },
  },
  {
    type: 'function',
    name: 'get_usage',
    description: 'Liefert Speicher-, Maschinen- und Kostengrenzen sowie die Kosten des laufenden Monats.',
    parameters: { type: 'object', properties: {}, required: [], additionalProperties: false },
  },
  {
    type: 'function',
    name: 'search_docs',
    description: 'Durchsucht die offizielle InstaBox-Dokumentation und liefert relevante Abschnitte.',
    parameters: {
      type: 'object',
      properties: { query: { type: 'string', description: 'Suchbegriff, z. B. "idle suspend" oder "ports"' } },
      required: ['query'],
      additionalProperties: false,
    },
  },
  {
    type: 'function',
    name: 'api_request',
    description:
      'Ruft eine beliebige InstaBox-API-Route auf (nur /v1/...). Nur verwenden, wenn kein spezialisiertes Werkzeug passt.',
    parameters: {
      type: 'object',
      properties: {
        method: { type: 'string', enum: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'] },
        path: { type: 'string', description: 'Pfad ab /v1/…' },
        body: { type: 'object' },
      },
      required: ['method', 'path'],
      additionalProperties: false,
    },
  },
];

const SUGGESTIONS = [
  'Welche Maschinen laufen gerade?',
  'Wie funktioniert die Idle-Pause?',
  'Zeig mir die Vorlagen',
  'Wie skaliere ich den Desktop auf dem Handy?',
];

function buildInstructions(): string {
  return `Du bist der InstaBox-Assistent in der App „InstaBox Pilot“ und kennst instabox.sh sehr genau.

Antworte auf Deutsch, sachlich und knapp (maximal 8 Zeilen, wenn nicht mehr nötig). Nutze Markdown sparsam.

Wichtige Regeln:
* Fakten über InstaBox stammen aus der Dokumentation unten oder aus dem Werkzeug search_docs. Rate nie.
* Der aktuelle Zustand (Maschinen, Snapshots, Kosten) kommt ausschließlich aus den Werkzeugen.
* Änderungen an Maschinen, Befehle in der Sandbox und Löschungen werden vom Benutzer bestätigt, bevor sie ausgeführt werden.
* Nenne beim Erklären konkrete Befehle, z. B. "instabox create --name dev" oder "curl -H 'X-API-Key: $INSTABOX_API_KEY' …".
* Erfinde keine API-Pfade. Die API-Basis ist https://api.instabox.sh, Auth über X-API-Key oder Authorization: Bearer.
* Wichtige API-Regeln: Lifecycle-Aufrufe (create, start, stop, suspend, resume, delete) brauchen einen Idempotency-Key-Header, exec nicht. Löschen braucht zusätzlich X-Confirm-Delete mit ID oder exaktem Namen. Antwortet ein Fehler, ist error.code die Wahrheit (retryable, retryAfterSeconds, docs_url).
* Größen: vCPU und memMiB müssen einer erlaubten Größe des Plans entsprechen, sonst 400 spec_not_allowed.
* Secrets: Werte werden nie zurückgegeben, nur Metadaten.

Dokumentationsstand: ${KNOWLEDGE_SNAPSHOT_DATE}. Für Details rufe search_docs auf.

--- DOKUMENTATION (Auszug) ---
${KNOWLEDGE}
--- ENDE DOKUMENTATION ---`;
}

export default function AssistantScreen() {
  const t = useTheme();
  const dialog = useDialog();
  const { client, session, settings, saveSettings } = useSession();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [toolResults, setToolResults] = useState<ToolResult[]>([]);
  const [modelOpen, setModelOpen] = useState(false);
  const [models, setModels] = useState<string[]>([]);
  const previousResponseId = useRef<string | null>(null);
  const scrollRef = useRef<ScrollView>(null);

  const model = settings.openaiModel || DEFAULT_MODEL;

  const executeTool = useCallback(
    async (call: ToolCall): Promise<{ ok: boolean; summary: string; data?: any }> => {
      if (!client) return { ok: false, summary: 'Keine Verbindung zu instabox.sh.' };
      const args = call.arguments || {};
      switch (call.name) {
        case 'list_machines': {
          const res = await client.get<any>('/v1/machines');
          const list = (res.machines || []).map(
            (m: any) =>
              `${m.name} (${m.id}) – Zustand ${m.state}, ${m.spec.vcpus} vCPU / ${Math.round(m.spec.memMiB / 1024)} GiB, Vorlage ${m.template?.id}, erstellt ${m.createdAt}`
          );
          return { ok: true, summary: list.length ? list.join('\n') : 'Es gibt keine Sandboxen.' };
        }
        case 'get_machine': {
          const machine = await client.get<any>(`/v1/machines/${encodeURIComponent(args.id)}`);
          return {
            ok: true,
            summary: JSON.stringify({
              id: machine.id,
              name: machine.name,
              state: machine.state,
              spec: machine.spec,
              template: machine.template,
              createdAt: machine.createdAt,
              autoSuspendAfterSeconds: machine.autoSuspendAfterSeconds,
              metadata: machine.metadata,
              lastError: machine.lastError || null,
            }),
          };
        }
        case 'machine_action': {
          const action = String(args.action);
          const ok = await dialog.confirm({
            title: `Aktion bestätigen: ${action}`,
            message: `Sandbox „${args.id}“ soll ${action} werden.`,
            confirmLabel: 'Ausführen',
          });
          if (!ok) return { ok: false, summary: 'Der Benutzer hat die Aktion abgelehnt.' };
          const op = await client.post(`/v1/machines/${encodeURIComponent(args.id)}/${action}`, {}, { idempotent: action !== 'wake' });
          const done = await waitForOperation(client, op?.id, undefined, 180_000);
          return {
            ok: done?.state !== 'failed',
            summary: `Operation ${op?.id}: ${done?.state}${done?.error ? ` – ${done.error.code}: ${done.error.message}` : ''}`,
          };
        }
        case 'run_command': {
          const ok = await dialog.confirm({
            title: 'Befehl ausführen?',
            message: `In „${args.id}“: ${args.command}`,
            confirmLabel: 'Ausführen',
          });
          if (!ok) return { ok: false, summary: 'Der Benutzer hat den Befehl abgelehnt.' };
          const result = await client.post<any>(
            `/v1/machines/${encodeURIComponent(args.id)}/exec`,
            { cmd: String(args.command) },
            { timeoutMs: 120_000 }
          );
          return {
            ok: result.exitCode === 0,
            summary: `exit=${result.exitCode}\nstdout:\n${(result.stdout || '').slice(0, 6000)}\nstderr:\n${(result.stderr || '').slice(0, 2000)}`,
          };
        }
        case 'create_machine': {
          const ok = await dialog.confirm({
            title: 'Sandbox erstellen?',
            message: args.name ? `Neue Sandbox „${args.name}“.` : 'Neue Sandbox ohne Namen.',
            confirmLabel: 'Erstellen',
          });
          if (!ok) return { ok: false, summary: 'Der Benutzer hat das Erstellen abgelehnt.' };
          const body: any = {};
          if (args.name) body.name = String(args.name).toLowerCase().replace(/[^a-z0-9-]/g, '-');
          if (args.template) body.templateId = String(args.template);
          if (args.snapshot) body.snapshotId = String(args.snapshot);
          if (args.vcpus) body.vcpus = Number(args.vcpus);
          if (args.mem_mib) body.memMiB = Number(args.mem_mib);
          const op = await client.post('/v1/machines', body, { idempotent: true });
          const done = await waitForOperation(client, op?.id, undefined, 300_000);
          return {
            ok: done?.state !== 'failed',
            summary: `Operation ${op?.id}: ${done?.state}. Sandbox-ID: ${op?.machineId || done?.machine?.id || 'unbekannt'}.`,
          };
        }
        case 'delete_machine': {
          const ok = await dialog.confirm({
            title: 'Sandbox löschen?',
            message: `„${args.id}“ wird endgültig gelöscht.`,
            confirmLabel: 'Löschen',
            destructive: true,
          });
          if (!ok) return { ok: false, summary: 'Der Benutzer hat das Löschen abgelehnt.' };
          const op = await client.del(`/v1/machines/${encodeURIComponent(args.id)}`, {
            idempotent: true,
            confirmDelete: String(args.id),
          });
          return { ok: true, summary: `Löschoperation ${op?.id} gestartet.` };
        }
        case 'list_snapshots': {
          const res = await client.get<any>('/v1/snapshots');
          const list = (res.snapshots || []).map(
            (s: any) => `${s.name} (${s.id}) – ${s.status}, erstellt ${s.createdAt}`
          );
          return { ok: true, summary: list.length ? list.join('\n') : 'Es gibt keine Snapshots.' };
        }
        case 'list_templates': {
          const res = await client.get<any>('/v1/templates');
          const list = (res.templates || [])
            .filter((tpl: any) => tpl.creatable !== false && !tpl.hidden)
            .map(
              (tpl: any) =>
                `${tpl.id}@${tpl.version} – ${tpl.defaultSpec.vcpus} vCPU / ${Math.round(tpl.defaultSpec.memMiB / 1024)} GiB${tpl.description ? ` – ${tpl.description}` : ''}`
            );
          return { ok: true, summary: list.join('\n') };
        }
        case 'get_usage': {
          const usage = await client.get<any>('/v1/usage');
          return {
            ok: true,
            summary: JSON.stringify({
              machines: usage.machines,
              snapshots: usage.snapshots,
              storedBytes: usage.storedBytes,
              limits: usage.limits,
              cost: usage.cost,
            }),
          };
        }
        case 'search_docs': {
          const results = await searchDocs(String(args.query), 3);
          if (!results.length) return { ok: true, summary: 'Keine Treffer in der Dokumentation.' };
          return {
            ok: true,
            summary: results
              .map((r) => `### ${r.page} (${r.url})\n${r.excerpt.slice(0, 2500)}`)
              .join('\n\n'),
          };
        }
        case 'api_request': {
          const method = String(args.method || 'GET').toUpperCase();
          const path = String(args.path || '');
          if (!path.startsWith('/v1/')) {
            return { ok: false, summary: 'Nur Pfade unter /v1/ sind erlaubt.' };
          }
          if (method !== 'GET') {
            const ok = await dialog.confirm({
              title: `${method} ${path} bestätigen?`,
              message: 'Der Assistent möchte eine schreibende API-Anfrage senden.',
              confirmLabel: 'Senden',
              destructive: method === 'DELETE',
            });
            if (!ok) return { ok: false, summary: 'Der Benutzer hat die Anfrage abgelehnt.' };
          }
          const result = await client.request(method, path, { body: args.body });
          return { ok: true, summary: JSON.stringify(result).slice(0, 6000) };
        }
        default:
          return { ok: false, summary: `Unbekanntes Werkzeug: ${call.name}` };
      }
    },
    [client, dialog]
  );

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || busy) return;
      if (!settings.openaiKey) {
        dialog.toast('Bitte zuerst einen OpenAI-Schlüssel hinterlegen.', 'error');
        return;
      }
      setInput('');
      const history = [...messages, { role: 'user' as const, content: trimmed }];
      setMessages(history);
      setBusy(true);
      setToolResults([]);
      try {
        const result = await runTurn({
          apiKey: settings.openaiKey,
          model,
          instructions: buildInstructions(),
          input: [{ role: 'user', content: trimmed }],
          tools: TOOLS,
          previousResponseId: previousResponseId.current,
          onToolCall: (call) => {
            setToolResults((prev) => [
              ...prev,
              { callId: call.id, name: call.name, ok: true, summary: `Werkzeug ${call.name} wird ausgeführt …` },
            ]);
          },
          executeTool,
        });
        previousResponseId.current = result.previousResponseId || null;
        setToolResults(result.toolCalls);
        setMessages((prev) => [
          ...prev,
          { role: 'assistant', content: result.text || '(keine Antwort)' },
        ]);
      } catch (e) {
        setMessages((prev) => [
          ...prev,
          { role: 'assistant', content: `Fehler: ${errorText(e)}` },
        ]);
      } finally {
        setBusy(false);
        setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 60);
      }
    },
    [busy, dialog, executeTool, messages, model, settings.openaiKey]
  );

  const openModels = useCallback(async () => {
    if (!settings.openaiKey) {
      dialog.toast('Kein OpenAI-Schlüssel hinterlegt.', 'error');
      return;
    }
    setModelOpen(true);
    try {
      const list = await listModels(settings.openaiKey);
      setModels(list);
    } catch (e) {
      dialog.toast(errorText(e), 'error');
    }
  }, [dialog, settings.openaiKey]);

  const setupComplete = !!settings.openaiKey;

  const history = useMemo(() => messages, [messages]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.bg }} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Txt variant="title">Assistent</Txt>
          <Txt variant="small" color={t.faint}>
            {setupComplete ? `InstaBox-Wissen · ${model}` : 'OpenAI-Schlüssel fehlt'}
          </Txt>
        </View>
        <Chip label="Modell" icon="options-outline" onPress={openModels} />
        {history.length ? (
          <Pressable
            onPress={() => {
              setMessages([]);
              setToolResults([]);
              previousResponseId.current = null;
            }}
            hitSlop={8}
          >
            <Ionicons name="refresh-outline" size={19} color={t.muted} />
          </Pressable>
        ) : null}
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={80}
      >
        <ScrollView
          ref={scrollRef}
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: 16, paddingBottom: 20, gap: 12 }}
          keyboardShouldPersistTaps="handled"
        >
          {!setupComplete ? (
            <Card style={{ gap: 14 }}>
              <Txt variant="heading">Eigener OpenAI-Schlüssel (BYOK)</Txt>
              <Txt variant="small" color={t.muted} style={{ lineHeight: 19 }}>
                Der Assistent nutzt die OpenAI-Responses-API mit deinem Schlüssel. Er wird nur auf dem Gerät
                gespeichert und direkt an api.openai.com gesendet – ohne Umweg über einen Server.
              </Txt>
              <Field
                label="OpenAI API Key"
                value={settings.openaiKey}
                onChangeText={(v) => saveSettings({ openaiKey: v })}
                placeholder="sk-…"
                secure
                autoCapitalize="none"
              />
              <Field
                label="Modell"
                value={model}
                onChangeText={(v) => saveSettings({ openaiModel: v })}
                placeholder={DEFAULT_MODEL}
                autoCapitalize="none"
                hint="Standard: gpt-6-luna. Jede ID aus der Modellliste von OpenAI funktioniert."
              />
            </Card>
          ) : null}

          {history.length === 0 && setupComplete ? (
            <View style={{ gap: 12 }}>
              <Card style={{ gap: 8 }}>
                <Row gap={8}>
                  <Ionicons name="sparkles-outline" size={17} color={t.accent} />
                  <Txt variant="heading">Frag mich zu instabox.sh</Txt>
                </Row>
                <Txt variant="small" color={t.muted} style={{ lineHeight: 19 }}>
                  Ich kenne die Dokumentation, lese deinen Workspace und führe Aktionen auf deinem Gerät aus –
                  nach deiner Bestätigung.
                </Txt>
              </Card>
              <Row gap={8} wrap>
                {SUGGESTIONS.map((s) => (
                  <Chip key={s} label={s} onPress={() => send(s)} />
                ))}
              </Row>
            </View>
          ) : null}

          {history.map((message, index) => (
            <View
              key={index}
              style={{
                alignSelf: message.role === 'user' ? 'flex-end' : 'flex-start',
                maxWidth: '92%',
                backgroundColor: message.role === 'user' ? t.accent : t.surface,
                borderRadius: 16,
                borderWidth: message.role === 'user' ? 0 : 1,
                borderColor: t.border,
                padding: 12,
              }}
            >
              <Txt
                variant="body"
                color={message.role === 'user' ? (t.dark ? '#04140A' : '#FFFFFF') : t.text}
                style={{ lineHeight: 20 }}
              >
                {message.content}
              </Txt>
            </View>
          ))}

          {toolResults.map((result) => (
            <Card key={result.callId} style={{ gap: 6, paddingVertical: 10 }}>
              <Row gap={7}>
                <Ionicons
                  name={result.ok ? 'checkmark-circle' : 'close-circle'}
                  size={14}
                  color={result.ok ? t.green : t.red}
                />
                <Txt variant="small" color={t.muted}>
                  Werkzeug: {result.name}
                </Txt>
              </Row>
              <Txt variant="mono" color={t.faint} numberOfLines={3}>
                {result.summary}
              </Txt>
            </Card>
          ))}

          {busy ? (
            <Row gap={8}>
              <Ionicons name="ellipsis-horizontal" size={16} color={t.faint} />
              <Txt variant="small" color={t.faint}>
                Der Assistent arbeitet …
              </Txt>
            </Row>
          ) : null}
        </ScrollView>

        <View style={[styles.composer, { borderTopColor: t.border, backgroundColor: t.surface }]}>
          <TextInput
            value={input}
            onChangeText={setInput}
            placeholder={setupComplete ? 'Frage zu Instaox …' : 'Zuerst den OpenAI-Schlüssel eintragen'}
            placeholderTextColor={t.faint}
            style={{ flex: 1, color: t.text, fontSize: 15, paddingVertical: 9, maxHeight: 120 }}
            multiline
            returnKeyType="send"
            onSubmitEditing={() => send(input)}
            autoCapitalize="sentences"
          />
          <Pressable
            onPress={() => send(input)}
            disabled={!input.trim() || busy || !setupComplete}
            style={{
              width: 38,
              height: 38,
              borderRadius: 19,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: input.trim() && setupComplete ? t.accent : t.surfaceAlt,
            }}
          >
            <Ionicons name="arrow-up" size={19} color={input.trim() && setupComplete ? '#04140A' : t.faint} />
          </Pressable>
        </View>
      </KeyboardAvoidingView>

      <Modal visible={modelOpen} transparent animationType="slide" onRequestClose={() => setModelOpen(false)}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)' }} onPress={() => setModelOpen(false)} />
        <View style={[styles.sheet, { backgroundColor: t.surface, borderColor: t.border }]}>
          <Row justify="space-between" style={{ marginBottom: 10 }}>
            <Txt variant="heading">Modell wählen</Txt>
            <Pressable onPress={() => setModelOpen(false)}>
              <Ionicons name="close" size={20} color={t.muted} />
            </Pressable>
          </Row>
          <ScrollView style={{ maxHeight: 420 }}>
            {models.map((id) => (
              <Pressable
                key={id}
                onPress={() => {
                  saveSettings({ openaiModel: id });
                  setModelOpen(false);
                }}
                style={{ paddingVertical: 11, borderTopWidth: 1, borderTopColor: t.border }}
              >
                <Txt variant="body" color={id === model ? t.accent : t.text}>
                  {id}
                </Txt>
              </Pressable>
            ))}
            {!models.length ? (
              <Txt variant="small" color={t.faint} style={{ paddingVertical: 12 }}>
                Modelliste konnte nicht geladen werden. Trage die ID unten ein.
              </Txt>
            ) : null}
          </ScrollView>
          <View style={{ marginTop: 12 }}>
            <Field
              label="Modell-ID manuell"
              value={model}
              onChangeText={(v) => saveSettings({ openaiModel: v })}
              autoCapitalize="none"
              placeholder={DEFAULT_MODEL}
            />
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 10,
  },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderTopWidth: 1,
  },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderWidth: 1,
    padding: 18,
    paddingBottom: 30,
  },
});
