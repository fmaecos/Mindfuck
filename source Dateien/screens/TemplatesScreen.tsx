import React from 'react';
import { ScrollView, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Card, Row, Txt, useTheme } from '../components/ui';
import { useSession } from '../lib/store';
import { useAsync } from '../lib/hooks';
import { formatBytes } from '../lib/format';

export default function TemplatesScreen() {
  const t = useTheme();
  const { client } = useSession();

  const templates = useAsync(async () => {
    if (!client) return { templates: [] as any[] };
    return client.get<any>('/v1/templates');
  }, [client]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.bg }} edges={['bottom', 'left', 'right']}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        {(templates.data?.templates || [])
          .filter((tpl: any) => !tpl.hidden)
          .map((tpl: any) => (
            <Card key={`${tpl.id}-${tpl.version}`} style={{ marginBottom: 10, gap: 8 }}>
              <Row justify="space-between">
                <Row gap={8}>
                  <Ionicons name="cube-outline" size={16} color={t.accent} />
                  <Txt variant="body" style={{ fontWeight: '600' }}>
                    {tpl.id}
                  </Txt>
                  {tpl.default ? (
                    <View style={{ paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6, backgroundColor: t.accentSoft }}>
                      <Txt variant="small" color={t.accent}>
                        Standard
                      </Txt>
                    </View>
                  ) : null}
                </Row>
                <Txt variant="small" color={t.faint}>
                  {tpl.version}
                </Txt>
              </Row>
              {tpl.description ? (
                <Txt variant="small" color={t.muted} style={{ lineHeight: 19 }}>
                  {tpl.description}
                </Txt>
              ) : null}
              <Row gap={14} wrap>
                <Txt variant="small" color={t.faint}>
                  {tpl.defaultSpec.vcpus} vCPU
                </Txt>
                <Txt variant="small" color={t.faint}>
                  {formatBytes(tpl.defaultSpec.memMiB * 1024 * 1024)}
                </Txt>
                <Txt variant="small" color={t.faint}>
                  {tpl.defaultSpec.persistentDiskGiB} GB /data
                </Txt>
              </Row>
            </Card>
          ))}
        {!templates.loading && !(templates.data?.templates || []).length ? (
          <Card>
            <Txt variant="small" color={t.faint}>
              Keine Vorlagen geladen.
            </Txt>
          </Card>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}
