import React, { useCallback, useState } from 'react';
import { ScrollView, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Clipboard from 'expo-clipboard';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Banner, Btn, Card, Chip, EmptyState, Field, Row, SectionTitle, Txt, useDialog, useTheme } from '../components/ui';
import { useSession } from '../lib/store';
import { errorText } from '../lib/errors';
import { useAsync } from '../lib/hooks';
import type { OrgInvite, OrgMember } from '../lib/types';
import { formatDateTime } from '../lib/format';

export default function MembersScreen() {
  const t = useTheme();
  const dialog = useDialog();
  const { client, orgs, session } = useSession();
  const [orgId, setOrgId] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'member' | 'admin'>('member');

  const workspaces = orgs.filter((o) => o.kind === 'workspace');
  const effectiveOrg = orgId || workspaces[0]?.id || '';

  const members = useAsync(async () => {
    if (!client || !effectiveOrg) return { members: [] as OrgMember[] };
    if (session?.kind === 'key') throw new Error('Mit einem API-Schlüssel sind keine Mitgliederverwaltung möglich.');
    return client.get<{ members: OrgMember[] }>(`/v1/orgs/${effectiveOrg}/members`);
  }, [client, effectiveOrg, session?.kind]);

  const invites = useAsync(async () => {
    if (!client || !effectiveOrg) return { invites: [] as OrgInvite[] };
    if (session?.kind === 'key') return { invites: [] as OrgInvite[] };
    try {
      return await client.get<{ invites: OrgInvite[] }>(`/v1/orgs/${effectiveOrg}/invites`);
    } catch (e) {
      return { invites: [] as OrgInvite[] };
    }
  }, [client, effectiveOrg, session?.kind]);

  const inviteCode = useAsync(async () => {
    if (!client || !effectiveOrg) return null;
    if (session?.kind === 'key') return null;
    try {
      return await client.get<any>(`/v1/orgs/${effectiveOrg}/invite-code`);
    } catch (e) {
      return null;
    }
  }, [client, effectiveOrg, session?.kind]);

  const sendInvite = useCallback(async () => {
    if (!email.trim()) return;
    try {
      await client?.post(`/v1/orgs/${effectiveOrg}/invites`, { email: email.trim(), role });
      dialog.toast('Einladung verschickt', 'success');
      setEmail('');
      invites.reload();
    } catch (e) {
      dialog.toast(errorText(e), 'error');
    }
  }, [client, dialog, email, effectiveOrg, invites, role]);

  const revokeInvite = useCallback(
    async (invite: OrgInvite) => {
      try {
        await client?.del(`/v1/orgs/${effectiveOrg}/invites/${invite.id}`);
        dialog.toast('Einladung widerrufen', 'success');
        invites.reload();
      } catch (e) {
        dialog.toast(errorText(e), 'error');
      }
    },
    [client, dialog, effectiveOrg, invites]
  );

  const changeRole = useCallback(
    async (member: OrgMember) => {
      const next = member.role === 'admin' ? 'member' : 'admin';
      const ok = await dialog.confirm({
        title: 'Rolle ändern?',
        message: `${member.login} wird ${next === 'admin' ? 'Admin' : 'Mitglied'}.`,
        confirmLabel: 'Ändern',
      });
      if (!ok) return;
      try {
        await client?.patch(`/v1/orgs/${effectiveOrg}/members/${member.userId}`, { role: next });
        members.reload();
      } catch (e) {
        dialog.toast(errorText(e), 'error');
      }
    },
    [client, dialog, effectiveOrg, members]
  );

  const removeMember = useCallback(
    async (member: OrgMember) => {
      const ok = await dialog.confirm({
        title: 'Mitglied entfernen?',
        message: `${member.login} verliert den Zugriff auf den Workspace.`,
        confirmLabel: 'Entfernen',
        destructive: true,
      });
      if (!ok) return;
      try {
        await client?.del(`/v1/orgs/${effectiveOrg}/members/${member.userId}`);
        members.reload();
      } catch (e) {
        dialog.toast(errorText(e), 'error');
      }
    },
    [client, dialog, effectiveOrg, members]
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.bg }} edges={['bottom', 'left', 'right']}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        {workspaces.length > 1 ? (
          <Row gap={8} wrap style={{ marginBottom: 14 }}>
            {workspaces.map((org) => (
              <Chip key={org.id} label={org.name} active={effectiveOrg === org.id} onPress={() => setOrgId(org.id)} />
            ))}
          </Row>
        ) : null}

        {!effectiveOrg ? <Banner text="Kein Workspace vorhanden. Nur bezahlte Workspaces haben Mitglieder." tone="warn" /> : null}

        <SectionTitle title="Mitglieder" />
        {(members.data?.members || []).map((member) => (
          <Card key={member.userId} style={{ marginBottom: 10, gap: 8 }}>
            <Row justify="space-between">
              <View style={{ flex: 1 }}>
                <Txt variant="body" style={{ fontWeight: '600' }}>
                  {member.login}
                </Txt>
                <Txt variant="small" color={t.faint}>
                  {member.email || 'keine E-Mail'} · seit {formatDateTime(member.createdAt)}
                </Txt>
              </View>
              <Txt variant="small" color={member.role === 'owner' ? t.accent : t.muted}>
                {member.role}
              </Txt>
            </Row>
            {member.role !== 'owner' ? (
              <Row gap={8}>
                <Btn title="Rolle ändern" small onPress={() => changeRole(member)} />
                <Btn title="Entfernen" small kind="danger" onPress={() => removeMember(member)} />
              </Row>
            ) : null}
          </Card>
        ))}
        {members.error ? <Banner text={members.error} tone="error" /> : null}

        <SectionTitle title="Einladungen" />
        <Card style={{ gap: 12 }}>
          <Field
            label="E-Mail"
            value={email}
            onChangeText={setEmail}
            placeholder="person@example.com"
            keyboardType="email-address"
          />
          <Row gap={8}>
            <Chip label="Mitglied" active={role === 'member'} onPress={() => setRole('member')} />
            <Chip label="Admin" active={role === 'admin'} onPress={() => setRole('admin')} />
          </Row>
          <Btn title="Einladung senden" icon="paper-plane-outline" kind="primary" onPress={sendInvite} />
        </Card>

        {(invites.data?.invites || []).map((invite) => (
          <Card key={invite.id} style={{ marginBottom: 10, gap: 6 }}>
            <Row justify="space-between">
              <Row gap={8}>
                <Ionicons name="mail-outline" size={15} color={t.faint} />
                <Txt variant="body">{invite.email || 'ohne E-Mail'}</Txt>
              </Row>
              <Txt variant="small" color={t.muted}>
                {invite.redeemedAt ? 'eingelöst' : 'offen'}
              </Txt>
            </Row>
            <Row justify="space-between">
              <Txt variant="small" color={t.faint}>
                läuft ab {formatDateTime(invite.expiresAt)}
              </Txt>
              {!invite.redeemedAt ? <Btn title="Widerrufen" small kind="danger" onPress={() => revokeInvite(invite)} /> : null}
            </Row>
          </Card>
        ))}

        {inviteCode.data?.code ? (
          <>
            <SectionTitle title="Einladungscode" />
            <Card style={{ gap: 8 }}>
              <Txt variant="display" style={{ letterSpacing: 3 }}>
                {inviteCode.data.code}
              </Txt>
              <Txt variant="small" color={t.muted}>
                {inviteCode.data.useCount} von {inviteCode.data.maxUses} Plätzen belegt.
              </Txt>
              <Btn
                title="Code kopieren"
                icon="copy-outline"
                small
                onPress={async () => {
                  await Clipboard.setStringAsync(inviteCode.data.code);
                  dialog.toast('Code kopiert', 'success');
                }}
              />
            </Card>
          </>
        ) : null}

        {!members.loading && !(members.data?.members || []).length && !members.error ? (
          <EmptyState icon="people-outline" title="Keine Mitglieder" message="Lade Menschen über eine E-Mail-Einladung ein." />
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}
