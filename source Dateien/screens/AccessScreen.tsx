import React from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Card, Row, Txt, useTheme } from '../components/ui';
import { useSession } from '../lib/store';
import type { RootStackParamList } from '../navigation/types';

const ENTRIES: {
  route: keyof RootStackParamList;
  title: string;
  description: string;
  icon: keyof typeof Ionicons.glyphMap;
}[] = [
  {
    route: 'ApiKeys',
    title: 'API-Schlüssel',
    description: 'Schlüssel anlegen, Scopes sehen, widerrufen',
    icon: 'key-outline',
  },
  {
    route: 'Sessions',
    title: 'Anmeldungen',
    description: 'CLI- und Browser-Sitzungen im Konto',
    icon: 'finger-print-outline',
  },
  {
    route: 'Ports',
    title: 'Öffentliche Ports',
    description: 'Alle HTTPS-Adressen deiner Sandboxen',
    icon: 'globe-outline',
  },
  {
    route: 'Members',
    title: 'Mitglieder & Einladungen',
    description: 'Workspace verwalten, Codes einladen',
    icon: 'people-outline',
  },
  {
    route: 'Secrets',
    title: 'Org Secrets',
    description: 'Zugangsdaten für den Outbound-Proxy',
    icon: 'lock-closed-outline',
  },
  {
    route: 'Webhooks',
    title: 'Webhooks',
    description: 'Ereignisse an eigene Dienste senden',
    icon: 'git-branch-outline',
  },
];

export default function AccessScreen() {
  const t = useTheme();
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { session, orgs, me } = useSession();

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.bg }} edges={['top', 'left', 'right']}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        <Txt variant="title">Zugänge</Txt>
        <Txt variant="small" color={t.faint} style={{ marginTop: 2, marginBottom: 14 }}>
          Alles rund um Schlüssel, Sitzungen und Freigaben
        </Txt>

        {session?.kind === 'key' ? (
          <Card style={{ marginBottom: 14, backgroundColor: t.yellowSoft, borderColor: 'transparent' }}>
            <Row gap={8} align="flex-start">
              <Ionicons name="alert-circle-outline" size={17} color={t.yellow} />
              <Txt variant="small" color={t.yellow} style={{ flex: 1, lineHeight: 19 }}>
                Du bist mit einem API-Schlüssel angemeldet. Schlüssel, Sitzungen, Vault und Billing sind der
                Sign-in-Sitzung vorbehalten – melde dich mit dem Geräte-Code an, um sie zu verwalten.
              </Txt>
            </Row>
          </Card>
        ) : null}

        <Card style={{ marginBottom: 14 }}>
          <Row justify="space-between">
            <View>
              <Txt variant="caption" color={t.faint}>
                Konto
              </Txt>
              <Txt variant="heading" style={{ marginTop: 2 }}>
                {me?.login || session?.label || 'Lokal'}
              </Txt>
              <Txt variant="small" color={t.faint} style={{ marginTop: 2 }}>
                {orgs.length
                  ? orgs.map((o) => `${o.name} (${o.tier})`).join(' · ')
                  : session?.baseUrl || ''}
              </Txt>
            </View>
            <Ionicons name="person-circle-outline" size={30} color={t.faint} />
          </Row>
        </Card>

        {ENTRIES.map((entry) => (
          <Pressable key={entry.route} onPress={() => nav.navigate(entry.route as any)}>
            {({ pressed }) => (
              <Card style={{ marginBottom: 10, opacity: pressed ? 0.8 : 1 }}>
                <Row gap={13}>
                  <View
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: 12,
                      backgroundColor: t.surfaceAlt,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Ionicons name={entry.icon} size={19} color={t.accent} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Txt variant="body" style={{ fontWeight: '600' }}>
                      {entry.title}
                    </Txt>
                    <Txt variant="small" color={t.faint} style={{ marginTop: 2 }}>
                      {entry.description}
                    </Txt>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={t.faint} />
                </Row>
              </Card>
            )}
          </Pressable>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}
