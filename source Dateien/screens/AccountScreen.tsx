import React, { useCallback, useState } from 'react';
import { Linking, Pressable, ScrollView, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Banner, Btn, Card, Chip, Divider, KV, Row, SectionTitle, Txt, useDialog, useTheme } from '../components/ui';
import { useSession } from '../lib/store';
import { errorText } from '../lib/errors';
import { useAsync } from '../lib/hooks';
import { formatBytes, formatUsd } from '../lib/format';
import { DEFAULT_MODEL } from '../lib/openai';
import { DEFAULT_BASE_URL } from '../lib/api';
import type { RootStackParamList } from '../navigation/types';

export default function AccountScreen() {
  const t = useTheme();
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const dialog = useDialog();
  const { client, me, orgs, session, sessions, switchSession, removeSession, signOut, settings, saveSettings } = useSession();
  const [busy, setBusy] = useState(false);

  const usage = useAsync(async () => {
    if (!client) return null;
    return client.get<any>('/v1/usage');
  }, [client]);

  const openBilling = useCallback(async () => {
    const org = orgs[0];
    if (!org || !client) return;
    setBusy(true);
    try {
      const result = await client.post<{ url: string }>(`/v1/orgs/${org.id}/billing/portal`, {});
      if (result?.url) await Linking.openURL(result.url);
    } catch (e) {
      dialog.toast(errorText(e), 'error');
    } finally {
      setBusy(false);
    }
  }, [client, dialog, orgs]);

  const activeOrg = orgs[0];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.bg }} edges={['top', 'left', 'right']}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        <Card style={{ gap: 10 }}>
          <Row justify="space-between">
            <Row gap={12}>
              <View style={[styles.avatar, { backgroundColor: t.accentSoft }]}>
                <Ionicons name="person" size={22} color={t.accent} />
              </View>
              <View>
                <Txt variant="title">{me?.name || me?.login || session?.label}</Txt>
                <Txt variant="small" color={t.faint}>
                  {me?.email || session?.baseUrl}
                </Txt>
              </View>
            </Row>
            {activeOrg ? (
              <Chip label={activeOrg.tier} active />
            ) : null}
          </Row>
          {activeOrg?.usage ? (
            <>
              <Divider />
              <KV k="Sandboxen" v={`${activeOrg.usage.machines} (${activeOrg.usage.running} laufend)`} />
              <KV k="Snapshots" v={String(activeOrg.usage.snapshots)} />
              <KV k="Speicher" v={`${activeOrg.usage.allocatedDiskGiB} GB`} />
              <KV k="Kosten im Monat" v={formatUsd(activeOrg.usage.costUSD)} />
              <KV k="Restguthaben" v={formatUsd(activeOrg.usage.remainingUSD)} />
            </>
          ) : null}
          <Row gap={8} wrap>
            <Btn title="Nutzung" icon="stats-chart-outline" small onPress={() => nav.navigate('Usage')} />
            <Btn title="Vorlagen" icon="cube-outline" small onPress={() => nav.navigate('Templates')} />
            {session?.kind === 'session' ? (
              <Btn title="Billing" icon="card-outline" small loading={busy} onPress={openBilling} />
            ) : null}
          </Row>
        </Card>

        <SectionTitle title="Verbindungen" />
        <Card style={{ gap: 12 }}>
          {sessions.map((item) => {
            const active = item.id === session?.id;
            return (
              <View key={item.id} style={{ gap: 6 }}>
                <Row justify="space-between">
                  <Row gap={8} style={{ flex: 1 }}>
                    <Ionicons
                      name={item.kind === 'demo' ? 'flask-outline' : item.kind === 'key' ? 'key-outline' : 'person-circle-outline'}
                      size={16}
                      color={active ? t.accent : t.faint}
                    />
                    <View style={{ flex: 1 }}>
                      <Txt variant="body" color={active ? t.text : t.muted}>
                        {item.label}
                      </Txt>
                      <Txt variant="small" color={t.faint} numberOfLines={1}>
                        {item.baseUrl}
                      </Txt>
                    </View>
                  </Row>
                  {active ? (
                    <Txt variant="small" color={t.green}>
                      aktiv
                    </Txt>
                  ) : (
                    <Btn title="Wechseln" small onPress={() => switchSession(item.id)} />
                  )}
                </Row>
                {!active ? (
                  <Btn title="Verbindung entfernen" small kind="danger" onPress={() => removeSession(item.id)} />
                ) : null}
              </View>
            );
          })}
          <Btn title="Verbindung hinzufügen" icon="add" small kind="primary" onPress={() => nav.navigate('AddProfile' as any)} />
        </Card>

        <SectionTitle title="Darstellung" />
        <Card style={{ gap: 10 }}>
          <Row gap={8}>
            {(
              [
                ['system', 'System'],
                ['dark', 'Dunkel'],
                ['light', 'Hell'],
              ] as const
            ).map(([id, label]) => (
              <Chip
                key={id}
                label={label}
                active={settings.themeMode === id}
                onPress={() => saveSettings({ themeMode: id })}
              />
            ))}
          </Row>
        </Card>

        <SectionTitle title="KI-Assistent" />
        <Card style={{ gap: 10 }}>
          <KV k="OpenAI-Schlüssel" v={settings.openaiKey ? 'hinterlegt' : 'nicht hinterlegt'} />
          <KV k="Modell" v={settings.openaiModel || DEFAULT_MODEL} />
          <Txt variant="small" color={t.faint} style={{ lineHeight: 18 }}>
            Der Schlüssel wird ausschließlich auf diesem Gerät gespeichert (SecureStore) und direkt an
            api.openai.com gesendet.
          </Txt>
          <Btn
            title="Schlüssel ändern"
            small
            onPress={() => {
              saveSettings({ openaiKey: '' });
              dialog.toast('Schlüssel entfernt');
            }}
          />
        </Card>

        <SectionTitle title="API" />
        <Card style={{ gap: 10 }}>
          <KV k="Basis-URL" v={session?.baseUrl || DEFAULT_BASE_URL} mono />
          <KV k="Modus" v={session?.kind === 'demo' ? 'Demo (offline)' : session?.kind === 'key' ? 'API-Schlüssel' : 'Konto-Sitzung'} />
          <Txt variant="small" color={t.faint} style={{ lineHeight: 18 }}>
            Die Basis-URL lässt sich beim Anmelden ändern – etwa für einen eigenen Proxy, wenn die CORS-Policy
            der InstaBox-API den Browser blockiert.
          </Txt>
        </Card>

        <SectionTitle title="Über" />
        <Card style={{ gap: 10 }}>
          <KV k="Version" v="1.0.0" />
          <Txt variant="small" color={t.faint} style={{ lineHeight: 18 }}>
            InstaBox Pilot ist ein inoffizieller Client für instabox.sh. Er nutzt die offizielle REST-API und
            ist nicht mit InstaBox affiliated.
          </Txt>
          <Row gap={8} wrap>
            <Btn title="Dokumentation" icon="book-outline" small onPress={() => Linking.openURL('https://instabox.sh/llms.txt').catch(() => {})} />
            <Btn title="Dashboard" icon="open-outline" small onPress={() => Linking.openURL('https://dashboard.instabox.sh').catch(() => {})} />
            <Btn title="Status" icon="pulse-outline" small onPress={() => Linking.openURL('https://instabox.sh/status').catch(() => {})} />
          </Row>
        </Card>

        {usage.error ? (
          <View style={{ marginTop: 14 }}>
            <Banner text={usage.error} tone="warn" />
          </View>
        ) : null}

        <Pressable
          onPress={async () => {
            const ok = await dialog.confirm({
              title: 'Abmelden?',
              message: 'Die aktuelle Verbindung wird entfernt. Andere Verbindungen bleiben erhalten.',
              confirmLabel: 'Abmelden',
              destructive: true,
            });
            if (ok) signOut();
          }}
          style={{ marginTop: 18 }}
        >
          <Row gap={8} justify="center">
            <Ionicons name="log-out-outline" size={16} color={t.red} />
            <Txt variant="small" color={t.red}>
              Abmelden
            </Txt>
          </Row>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = {
  avatar: { width: 44, height: 44, borderRadius: 22, alignItems: 'center' as const, justifyContent: 'center' as const },
};
