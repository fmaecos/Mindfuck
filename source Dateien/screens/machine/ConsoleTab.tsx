import React, { useCallback, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Btn, Card, Field, Row, Txt, useDialog, useTheme } from '../../components/ui';
import { useSession } from '../../lib/store';
import { errorText } from '../../lib/errors';
import type { Machine } from '../../lib/types';

export default function ConsoleTab({ machine }: { machine: Machine }) {
  const t = useTheme();
  const dialog = useDialog();
  const { client } = useSession();
  const [command, setCommand] = useState('');
  const [output, setOutput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState<string[]>([]);

  const run = useCallback(async () => {
    if (!client || !command.trim()) return;
    if (machine.state !== 'running') {
      dialog.toast('Die Maschine läuft gerade nicht.', 'error');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await client.post<any>(`/v1/machines/${machine.id}/exec`, { cmd: command.trim() }, { timeoutMs: 120_000 });
      const stdout = result.stdout || '';
      const stderr = result.stderr || '';
      setOutput((prev) => `${prev}${prev ? '\n' : ''}$ ${command.trim()}\n${stdout}${stderr ? `\n[stderr] ${stderr}` : ''}`);
      setHistory((prev) => [command.trim(), ...prev.filter((c) => c !== command.trim())].slice(0, 12));
      setCommand('');
    } catch (e) {
      const message = errorText(e);
      setError(message);
      dialog.toast(message, 'error');
    } finally {
      setBusy(false);
    }
  }, [client, command, dialog, machine.id, machine.state]);

  return (
    <KeyboardAvoidingView style={{ gap: 12 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Card style={{ gap: 10 }}>
        <Row justify="space-between">
          <Txt variant="heading">Befehl ausführen</Txt>
          <Ionicons name="terminal-outline" size={18} color={t.faint} />
        </Row>
        <Field
          value={command}
          onChangeText={setCommand}
          placeholder="ls -la /data/home"
          mono
          returnKeyType="go"
          onSubmitEditing={run}
        />
        <Btn title="Ausführen" kind="primary" icon="play" loading={busy} disabled={!command.trim()} onPress={run} />
        {error ? (
          <Txt variant="small" color={t.red}>
            {error}
          </Txt>
        ) : null}
      </Card>

      {output ? (
        <Card style={{ gap: 8, backgroundColor: '#08080A' }}>
          <Txt variant="caption" color={t.faint}>
            Ausgabe
          </Txt>
          <ScrollView horizontal>
            <Txt variant="mono" color="#D7D7DE" style={{ lineHeight: 18 }}>
              {output}
            </Txt>
          </ScrollView>
        </Card>
      ) : null}

      {history.length ? (
        <Card style={{ gap: 8 }}>
          <Txt variant="caption" color={t.faint}>
            Zuletzt ausgeführt
          </Txt>
          {history.map((cmd) => (
            <Row key={cmd} gap={8}>
              <Ionicons name="return-down-forward-outline" size={13} color={t.faint} />
              <Txt variant="mono" color={t.muted} style={{ flex: 1 }} numberOfLines={1}>
                {cmd}
              </Txt>
              <Btn title="Ausführen" small onPress={() => setCommand(cmd)} />
            </Row>
          ))}
        </Card>
      ) : null}
    </KeyboardAvoidingView>
  );
}
