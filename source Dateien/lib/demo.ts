import { ApiError } from './errors';
import type {
  ApiKeyInfo,
  DesktopState,
  ExecResult,
  FileEntry,
  FilesPayload,
  Machine,
  MachineMetric,
  Me,
  Operation,
  Org,
  OrgInvite,
  OrgMember,
  PublicPort,
  SecretInfo,
  SessionInfo,
  Snapshot,
  SshToken,
  TemplateVersion,
  Usage,
  WebhookInfo,
} from './types';

/* A tiny in-memory InstaBox stand-in. It powers the demo mode so the app can be
   explored without credentials. Every response mirrors the real API's shape. */

const now = () => new Date().toISOString();
const ago = (mins: number) => new Date(Date.now() - mins * 60_000).toISOString();

let seq = 1;
const id = (prefix: string, len = 26) => {
  const chars = 'abcdefghijklmnopqrstuvwxyz234567';
  let out = '';
  for (let i = 0; i < len; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return `${prefix}${out}`;
};

const orgPersonal: Org = {
  id: 'org_personal_demo',
  name: 'Persönlich',
  kind: 'personal',
  tier: 'pro',
  role: 'owner',
  limits: {
    maxMachines: 500,
    maxRunning: 100,
    maxSnapshots: 100,
    maxStoredGiB: 1024,
    maxMembers: 1,
    alwaysOn: true,
  },
  allowedSpecs: [
    { vcpus: 4, memMiB: 8192, persistentDiskGiB: 20 },
    { vcpus: 2, memMiB: 4096, persistentDiskGiB: 20 },
    { vcpus: 8, memMiB: 16384, persistentDiskGiB: 20 },
  ],
  usage: {
    costUSD: 4.82,
    machines: 3,
    running: 1,
    snapshots: 2,
    allocatedDiskGiB: 60,
    remainingUSD: 15.18,
    allowanceUSD: 20,
    creditsUSD: 0,
    periodStart: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString(),
    periodEnd: new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1).toISOString(),
  },
};

const orgWorkspace: Org = {
  id: 'org_team_demo',
  name: 'Studio-Team',
  kind: 'workspace',
  tier: 'team',
  role: 'owner',
  limits: {
    maxMachines: 0,
    maxRunning: 500,
    maxSnapshots: 0,
    maxStoredGiB: 0,
    maxMembers: 25,
    alwaysOn: true,
  },
  allowedSpecs: [
    { vcpus: 4, memMiB: 8192, persistentDiskGiB: 20 },
    { vcpus: 8, memMiB: 16384, persistentDiskGiB: 20 },
    { vcpus: 16, memMiB: 32768, persistentDiskGiB: 20 },
  ],
  usage: {
    costUSD: 118.4,
    machines: 9,
    running: 4,
    snapshots: 14,
    allocatedDiskGiB: 320,
    remainingUSD: 381.6,
    allowanceUSD: 500,
    creditsUSD: 40,
    periodStart: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString(),
    periodEnd: new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1).toISOString(),
  },
};

const orgs: Org[] = [orgPersonal, orgWorkspace];

const templates: TemplateVersion[] = [
  {
    id: 'agent-browser',
    version: '2026-10-15.4',
    description: 'Debian 13 mit Docker, Node, Bun, Python, Go, Rust, JDK 21, XFCE-Desktop und Chromium.',
    defaultSpec: { vcpus: 4, memMiB: 8192, persistentDiskGiB: 20 },
    creatable: true,
    default: true,
    latest: true,
    preboot: true,
    arch: 'amd64',
  },
  {
    id: 'android',
    version: '2026-10-02.1',
    description: 'agent-browser plus Android 14 als Container auf dem eigenen Kernel, mit adb.',
    defaultSpec: { vcpus: 4, memMiB: 8192, persistentDiskGiB: 20 },
    creatable: true,
    latest: true,
    arch: 'amd64',
  },
  {
    id: 'omarchy',
    version: '2026-09-28.3',
    description: 'Arch Linux mit Omarchy und Hyprland (Wayland).',
    defaultSpec: { vcpus: 4, memMiB: 8192, persistentDiskGiB: 20 },
    creatable: true,
    latest: true,
    arch: 'amd64',
  },
  {
    id: 'ci',
    version: '2026-10-09.7',
    description: 'Ubuntu 24.04 für CI-Läufe, ohne Desktop.',
    defaultSpec: { vcpus: 4, memMiB: 8192, persistentDiskGiB: 20 },
    creatable: true,
    latest: true,
    arch: 'amd64',
  },
  {
    id: 'universal',
    version: '2026-10-11.2',
    description: 'Debian 13 ohne vorinstallierten Desktop — gut für eigene Images.',
    defaultSpec: { vcpus: 4, memMiB: 8192, persistentDiskGiB: 20 },
    creatable: true,
    latest: true,
    arch: 'amd64',
  },
];

const makeMachine = (name: string, state: Machine['state'], extra: Partial<Machine> = {}): Machine => ({
  id: id('m_'),
  name,
  state,
  desiredState: state === 'running' ? 'running' : 'stopped',
  spec: { vcpus: 4, memMiB: 8192, persistentDiskGiB: 20 },
  template: { id: 'agent-browser', version: '2026-10-15.4', digest: 'sha256:demo' },
  orgId: orgPersonal.id,
  guestUser: 'dev',
  createdAt: ago(220),
  updatedAt: ago(12),
  readyAt: state === 'running' ? ago(210) : undefined,
  runStartedAt: state === 'running' ? ago(180) : null,
  revision: 3,
  operationId: null,
  metadata: {},
  autoSuspendAfterSeconds: 1800,
  maxRunMinutes: 480,
  oomKills: 0,
  runtime: { ready: state === 'running' },
  storage: { mountPath: '/data', sizeGiB: 20, synced: true },
  ...extra,
});

const machines: Machine[] = [
  makeMachine('build-agent', 'running', {
    id: 'm_demo_buildagent0000000001',
    orgId: orgWorkspace.id,
    metadata: { project: 'website', env: 'prod' },
    envNames: ['CI', 'NPM_TOKEN'],
    createdAt: ago(1450),
    updatedAt: ago(3),
    runStartedAt: ago(42),
    spec: { vcpus: 8, memMiB: 16384, persistentDiskGiB: 40 },
  }),
  makeMachine('playwright-tests', 'suspended', {
    id: 'm_demo_playwright0000000002',
    orgId: orgWorkspace.id,
    autoSuspendAfterSeconds: 600,
    createdAt: ago(2880),
    updatedAt: ago(64),
  }),
  makeMachine('scratch', 'stopped', {
    id: 'm_demo_scratch000000000003',
    createdAt: ago(500),
    updatedAt: ago(500),
  }),
];

const snapshots: Snapshot[] = [
  {
    id: id('sn_'),
    name: 'agent-browser-base',
    status: 'ready',
    createdAt: ago(4300),
    orgId: orgPersonal.id,
    sourceMachineId: machines[2].id,
    rootSizeBytes: 16 * 1024 ** 3,
    dataSizeBytes: 20 * 1024 ** 3,
    guestUser: 'dev',
    description: 'Basis-Image mit Chromium und Playwright',
    template: { id: 'agent-browser', version: '2026-10-15.4' },
  },
  {
    id: id('sn_'),
    name: 'ubuntu-ci',
    status: 'ready',
    createdAt: ago(2100),
    orgId: orgWorkspace.id,
    sourceMachineId: machines[1].id,
    rootSizeBytes: 8 * 1024 ** 3,
    guestUser: 'dev',
    template: { id: 'ci', version: '2026-10-09.7' },
  },
];

const apiKeys: ApiKeyInfo[] = [
  {
    id: 'key_demo_1',
    name: 'Laptop',
    prefix: 'ibk_demo1',
    scopes: ['machines:read', 'machines:write', 'images:read'],
    createdAt: ago(2000),
    expiresAt: null,
    lastUsedAt: ago(4),
  },
  {
    id: 'key_demo_2',
    name: 'CI-Pipeline',
    prefix: 'ibk_demo2',
    scopes: ['machines:read', 'machines:write', 'machines:delete'],
    createdAt: ago(8000),
    expiresAt: new Date(Date.now() + 20 * 86400_000).toISOString(),
    lastUsedAt: ago(120),
  },
];

const sessions: SessionInfo[] = [
  {
    id: 'ss_demo_current',
    kind: 'cli',
    createdAt: ago(300),
    lastUsedAt: ago(0),
    expiresAt: new Date(Date.now() + 30 * 86400_000).toISOString(),
    current: true,
  },
  {
    id: 'ss_demo_browser',
    kind: 'browser',
    createdAt: ago(2000),
    lastUsedAt: ago(600),
    expiresAt: new Date(Date.now() + 7 * 86400_000).toISOString(),
    current: false,
  },
];

const members: OrgMember[] = [
  { userId: 1, login: 'studio-lead', email: 'lead@example.com', role: 'owner', createdAt: ago(9000) },
  { userId: 2, login: 'dev-lena', email: 'lena@example.com', role: 'admin', createdAt: ago(5000) },
  { userId: 3, login: 'dev-max', role: 'member', createdAt: ago(3000) },
];

const invites: OrgInvite[] = [
  {
    id: id('inv_'),
    email: 'new@example.com',
    role: 'member',
    createdAt: ago(700),
    expiresAt: new Date(Date.now() + 6 * 86400_000).toISOString(),
  },
];

const secrets: SecretInfo[] = [
  {
    id: 'sec_demo_1',
    name: 'NPM_TOKEN',
    size: 36,
    createdAt: ago(4000),
    updatedAt: ago(4000),
    version: 2,
    delivery: 'env',
  },
  {
    id: 'sec_demo_2',
    name: 'GITHUB_PAT',
    size: 40,
    createdAt: ago(3000),
    updatedAt: ago(1000),
    version: 3,
    delivery: 'proxy',
    hosts: ['api.github.com'],
  },
];

const webhooks: WebhookInfo[] = [
  {
    id: id('wh_'),
    url: 'https://hooks.example.com/instabox',
    description: 'Deployment-Pipeline',
    enabled: true,
    events: ['sandbox.started', 'sandbox.stopped', 'sandbox.error'],
    createdAt: ago(1500),
  },
];

const ports: PublicPort[] = [
  {
    id: id('pp_'),
    machineId: machines[0].id,
    port: 3000,
    name: 'Next.js',
    access: 'public',
    url: 'https://3000-build-agent.instabox.sh',
    protocol: 'http',
    createdAt: ago(300),
  },
  {
    id: id('pp_'),
    machineId: machines[1].id,
    port: 8080,
    name: 'Docs',
    access: 'private',
    url: 'https://8080-playwright-tests.instabox.sh',
    protocol: 'http',
    createdAt: ago(1200),
    token: 'ibp_demotoken',
  },
];

const sshTokens: SshToken[] = [
  {
    id: id('cn_'),
    name: 'laptop',
    createdAt: ago(300),
    expiresAt: new Date(Date.now() + 7 * 86400_000).toISOString(),
    command: 'ssh -p 22 ibssh_demo@sbx-1.example.com',
    host: 'sbx-1.example.com',
    port: 22,
  },
];

const files: Record<string, { type: 'file' | 'dir'; content?: string; children?: string[] }> = {
  '/': { type: 'dir', children: ['home', 'data', 'etc', 'usr'] },
  '/data': { type: 'dir', children: ['home'] },
  '/data/home': { type: 'dir', children: ['project', 'notes.txt'] },
  '/data/home/project': {
    type: 'dir',
    children: ['package.json', 'src', 'README.md'],
  },
  '/data/home/project/package.json': {
    type: 'file',
    content: '{\n  "name": "demo",\n  "version": "1.0.0",\n  "scripts": {\n    "build": "vite build"\n  }\n}\n',
  },
  '/data/home/project/README.md': {
    type: 'file',
    content: '# Demo-Projekt\n\nBeispiel für den Dateibrowser von InstaBox Pilot.\n',
  },
  '/data/home/project/src': { type: 'dir', children: ['index.ts'] },
  '/data/home/project/src/index.ts': {
    type: 'file',
    content: "export const hello = () => 'Hallo aus der Sandbox';\n",
  },
  '/data/home/notes.txt': { type: 'file', content: 'Notizen für die Demo.\n' },
};

const me: Me = {
  userId: 1,
  login: 'demo-user',
  name: 'Demo User',
  email: 'demo@example.com',
  orgId: orgPersonal.id,
  allowedSpecs: orgPersonal.allowedSpecs,
  idleChoicesSeconds: [300, 600, 900, 1200, 1500, 1800],
  alwaysOnAllowed: true,
  machineMetrics: true,
  webhooksEnabled: true,
  workspaces: [{ id: orgWorkspace.id, name: orgWorkspace.name, kind: 'workspace', tier: 'team' }],
};

const operations = new Map<string, Operation>();

function fail(status: number, code: string, message: string, hint?: string): never {
  throw new ApiError(status, { code, message, hint, retryable: false, requestId: 'req_demo' });
}

function machineById(machineId: string): Machine {
  const machine = machines.find((m) => m.id === machineId || m.name === machineId);
  if (!machine) fail(404, 'not_found', `Keine Maschine „${machineId}“ gefunden.`);
  return machine;
}

function fakeOperation(machine: Machine, type: string): Operation {
  const op: Operation = {
    id: id('op_'),
    type,
    state: 'running',
    createdAt: now(),
    updatedAt: now(),
    machineId: machine.id,
  };
  operations.set(op.id, op);
  setTimeout(() => {
    op.state = 'succeeded';
    op.updatedAt = now();
    if (type === 'start') machine.state = 'running';
    if (type === 'stop') machine.state = 'stopped';
    if (type === 'suspend') machine.state = 'suspended';
    if (type === 'resume') machine.state = 'running';
    if (type === 'delete') machine.state = 'deleted';
    machine.updatedAt = now();
  }, 900);
  return op;
}

const metrics = (machine: Machine): MachineMetric[] => {
  const out: MachineMetric[] = [];
  for (let i = 9; i >= 0; i--) {
    out.push({
      timestamp: new Date(Date.now() - i * 30_000).toISOString(),
      cpuUsedPct: 6 + Math.random() * 22,
      cpuCount: machine.spec.vcpus,
      memUsed: machine.spec.memMiB * 1024 * 1024 * (0.32 + Math.random() * 0.2),
      memTotal: machine.spec.memMiB * 1024 * 1024,
      netInBytesPerSec: Math.random() * 220_000,
      netOutBytesPerSec: Math.random() * 90_000,
      diskUsed: 4.2 * 1024 ** 3,
      diskTotal: machine.spec.persistentDiskGiB * 1024 ** 3,
    });
  }
  return out;
};

function execResult(cmd: string): ExecResult {
  const trimmed = cmd.trim();
  if (/^uname/.test(trimmed)) {
    return { stdout: 'Linux instabox 6.18.60-instabox-drm #1 SMP PREEMPT_DYNAMIC x86_64 GNU/Linux\n', stderr: '', exitCode: 0 };
  }
  if (/^whoami/.test(trimmed)) return { stdout: `${machines[0].guestUser}\n`, stderr: '', exitCode: 0 };
  if (/^pwd/.test(trimmed)) return { stdout: '/data/home\n', stderr: '', exitCode: 0 };
  if (/^df/.test(trimmed)) {
    return {
      stdout:
        'Filesystem      Size  Used Avail Use% Mounted on\n/dev/vda1        20G  4.2G   16G  22% /data\n/dev/vda2        16G  6.1G  9.8G  40% /\n',
      stderr: '',
      exitCode: 0,
    };
  }
  if (/^ls/.test(trimmed)) {
    return { stdout: 'Desktop\nDocuments\nDownloads\nnotes.txt\nproject\n', stderr: '', exitCode: 0 };
  }
  if (/^echo/.test(trimmed)) {
    return { stdout: trimmed.replace(/^echo\s+/, '') + '\n', stderr: '', exitCode: 0 };
  }
  if (/^npm/.test(trimmed) || /^node/.test(trimmed)) {
    return { stdout: 'v22.11.0\n', stderr: '', exitCode: 0 };
  }
  if (/^cat/.test(trimmed)) {
    return { stdout: 'Hallo aus der Sandbox.\n', stderr: '', exitCode: 0 };
  }
  return {
    stdout: '',
    stderr: `instabox: demo mode — der Befehl „${trimmed}“ wurde nicht ausgeführt.\n`,
    exitCode: 127,
  };
}

export type DemoRequest = {
  method: string;
  path: string;
  query?: Record<string, string | undefined>;
  body?: any;
};

export function demoRequest(req: DemoRequest): any {
  const { method, path } = req;
  const query = req.query || {};
  const body = req.body || {};
  const seg = path.split('/').filter(Boolean);
  const v1 = seg[0] === 'v1';
  const p = v1 ? seg.slice(1) : seg;

  // --- session / account ---
  if (p[0] === 'me' && method === 'GET') return me;
  if (p[0] === 'stats' && method === 'GET') return { runningMachines: 8419, at: now() };
  if (p[0] === 'orgs' && method === 'GET') return { orgs };
  if (p[0] === 'orgs' && p.length === 2 && method === 'GET') {
    const org = orgs.find((o) => o.id === p[1]);
    if (!org) fail(404, 'not_found', 'Workspace nicht gefunden.');
    return org;
  }
  if (p[0] === 'orgs' && p.length === 3 && p[2] === 'members' && method === 'GET') {
    return { members: orgWorkspace.id === p[1] ? members : members.slice(0, 1) };
  }
  if (p[0] === 'orgs' && p.length === 3 && p[2] === 'invites' && method === 'GET') {
    return { invites };
  }
  if (p[0] === 'orgs' && p.length === 3 && p[2] === 'invites' && method === 'POST') {
    const invite: OrgInvite = {
      id: id('inv_'),
      email: body.email,
      role: body.role || 'member',
      createdAt: now(),
      expiresAt: new Date(Date.now() + 7 * 86400_000).toISOString(),
    };
    invites.unshift(invite);
    return invite;
  }
  if (p[0] === 'orgs' && p.length === 4 && p[2] === 'invites' && method === 'DELETE') {
    const i = invites.findIndex((x) => x.id === p[3]);
    if (i >= 0) invites.splice(i, 1);
    return null;
  }
  if (p[0] === 'orgs' && p.length === 3 && p[2] === 'secrets' && method === 'GET') {
    return { items: secrets };
  }
  if (p[0] === 'orgs' && p.length === 4 && p[2] === 'secrets' && method === 'PUT') {
    const name = decodeURIComponent(p[3]);
    let secret = secrets.find((s) => s.name === name);
    if (secret) {
      secret = { ...secret, updatedAt: now(), version: secret.version + 1, size: (body.value || '').length };
      secrets[secrets.indexOf(secrets.find((s) => s.name === name)!)] = secret;
    } else {
      secret = {
        id: id('sec_'),
        name,
        size: (body.value || '').length,
        createdAt: now(),
        updatedAt: now(),
        version: 1,
        delivery: body.delivery || 'env',
        hosts: body.hosts,
      };
      secrets.push(secret);
    }
    return secret;
  }
  if (p[0] === 'orgs' && p.length === 4 && p[2] === 'secrets' && method === 'DELETE') {
    const i = secrets.findIndex((s) => s.name === decodeURIComponent(p[3]));
    if (i >= 0) secrets.splice(i, 1);
    return null;
  }
  if (p[0] === 'orgs' && p.length === 3 && p[2] === 'webhooks' && method === 'GET') {
    return { items: webhooks, eventTypes: ['sandbox.created', 'sandbox.started', 'sandbox.stopped', 'sandbox.error'], maxEndpoints: 10 };
  }
  if (p[0] === 'orgs' && p.length === 3 && p[2] === 'webhooks' && method === 'POST') {
    const hook: WebhookInfo = {
      id: id('wh_'),
      url: body.url,
      description: body.description || '',
      enabled: body.enabled !== false,
      events: body.events || ['sandbox.error'],
      createdAt: now(),
    };
    webhooks.push(hook);
    return hook;
  }
  if (p[0] === 'orgs' && p.length === 4 && p[2] === 'webhooks' && method === 'DELETE') {
    const i = webhooks.findIndex((w) => w.id === p[3]);
    if (i >= 0) webhooks.splice(i, 1);
    return null;
  }
  if (p[0] === 'keys' && method === 'GET') return { keys: apiKeys };
  if (p[0] === 'keys' && method === 'POST') {
    const created = {
      id: id('key_'),
      name: body.name,
      prefix: 'ibk_new',
      scopes: body.scopes || ['machines:read'],
      createdAt: now(),
      expiresAt: body.expiresInDays ? new Date(Date.now() + body.expiresInDays * 86400_000).toISOString() : null,
      lastUsedAt: null,
    };
    apiKeys.unshift(created);
    return { apiKey: created, key: `ibk_demo_${Math.random().toString(36).slice(2, 54)}` };
  }
  if (p[0] === 'keys' && p.length === 2 && method === 'DELETE') {
    const i = apiKeys.findIndex((k) => k.id === p[1]);
    if (i >= 0) apiKeys.splice(i, 1);
    return null;
  }
  if (p[0] === 'sessions' && method === 'GET') return { sessions };
  if (p[0] === 'sessions' && p.length === 2 && method === 'DELETE') {
    const i = sessions.findIndex((s) => s.id === p[1]);
    if (i >= 0) sessions.splice(i, 1);
    return null;
  }
  if (p[0] === 'templates' && method === 'GET') return { templates };
  if (p[0] === 'usage' && method === 'GET') {
    const org = orgs.find((o) => o.id === query.org) || orgPersonal;
    const usage: Usage = {
      machines: machines.length,
      snapshots: snapshots.length,
      storedBytes: 11 * 1024 ** 3,
      logicalBytes: 17 * 1024 ** 3,
      computedAt: now(),
      limits: {
        maxMachines: org.limits?.maxMachines ?? 1,
        maxSnapshots: org.limits?.maxSnapshots ?? 5,
        maxStoredGiB: org.limits?.maxStoredGiB ?? 200,
        machineSpec: { vcpus: 4, memMiB: 8192, persistentDiskGiB: 20 },
        machineSpecs: org.allowedSpecs,
      },
      cost: {
        costUSD: org.usage?.costUSD ?? 0,
        vcpuUSD: (org.usage?.costUSD ?? 0) * 0.6,
        memUSD: (org.usage?.costUSD ?? 0) * 0.25,
        storageUSD: (org.usage?.costUSD ?? 0) * 0.1,
        egressUSD: (org.usage?.costUSD ?? 0) * 0.05,
        allowanceUSD: org.usage?.allowanceUSD ?? 0,
        remainingUSD: org.usage?.remainingUSD ?? 0,
        creditsUSD: org.usage?.creditsUSD ?? 0,
        running: org.usage?.running ?? 0,
        machines: org.usage?.machines ?? 0,
        snapshots: org.usage?.snapshots ?? 0,
        allocatedDiskGiB: org.usage?.allocatedDiskGiB ?? 0,
        periodStart: org.usage?.periodStart ?? now(),
        periodEnd: org.usage?.periodEnd ?? now(),
      },
      org: { id: org.id, name: org.name, tier: org.tier },
    };
    return usage;
  }
  if (p[0] === 'usage' && p[1] === 'machines' && method === 'GET') {
    return {
      from: now(),
      to: now(),
      total: machines.length,
      machines: machines.map((m) => ({
        id: m.id,
        name: m.name,
        computeUSD: Number((m.spec.vcpus * 0.004 * 4).toFixed(3)),
        vcpuSeconds: 14400,
        memGiBSeconds: 28800,
        runningSeconds: 3600,
        free: false,
      })),
    };
  }

  // --- machines ---
  if (p[0] === 'machines' && p.length === 1 && method === 'GET') {
    let list = machines;
    const filter = query.metadata;
    if (filter) {
      const [key, value] = filter.split(':');
      list = list.filter((m) => (m.metadata || {})[key] === value);
    }
    return { machines: list, nextCursor: null };
  }
  if (p[0] === 'machines' && method === 'POST') {
    const template = templates.find((t) => t.id === (body.templateId || 'agent-browser')) || templates[0];
    const machine = makeMachine(body.name || `box-${Math.random().toString(16).slice(2, 10)}`, 'creating', {
      orgId: body.orgId || orgPersonal.id,
      spec: {
        vcpus: body.vcpus || template.defaultSpec.vcpus,
        memMiB: body.memMiB || template.defaultSpec.memMiB,
        persistentDiskGiB: body.persistentDiskGiB || template.defaultSpec.persistentDiskGiB,
      },
      template: { id: template.id, version: template.version },
      metadata: body.metadata || {},
      autoSuspendAfterSeconds: body.autoSuspendAfterSeconds ?? 1800,
    });
    machines.unshift(machine);
    const op = fakeOperation(machine, 'create');
    machine.operationId = op.id;
    setTimeout(() => {
      machine.state = body.desiredState === 'stopped' ? 'stopped' : 'running';
      machine.operationId = null;
    }, 1800);
    return op;
  }
  if (p[0] === 'machines' && p.length >= 2) {
    const machine = machineById(p[1]);
    const action = p[2];

    if (!action && method === 'GET') return machine;
    if (!action && method === 'PATCH') {
      if (body.name) machine.name = body.name;
      if (typeof body.vcpus === 'number') machine.spec.vcpus = body.vcpus;
      if (typeof body.memMiB === 'number') machine.spec.memMiB = body.memMiB;
      if (typeof body.persistentDiskGiB === 'number') machine.spec.persistentDiskGiB = body.persistentDiskGiB;
      if (typeof body.autoSuspendAfterSeconds === 'number') machine.autoSuspendAfterSeconds = body.autoSuspendAfterSeconds;
      if (body.metadata) machine.metadata = body.metadata;
      machine.updatedAt = now();
      machine.revision += 1;
      return machine;
    }
    if (!action && method === 'DELETE') {
      const op = fakeOperation(machine, 'delete');
      setTimeout(() => {
        const i = machines.indexOf(machine);
        if (i >= 0) machines.splice(i, 1);
      }, 1200);
      return op;
    }
    if (['start', 'stop', 'suspend', 'resume', 'wake', 'restore', 'fork', 'resize'].includes(action) && method === 'POST') {
      if (action === 'fork') {
        const copy = makeMachine(`${machine.name}-fork`, 'creating', { orgId: machine.orgId });
        machines.unshift(copy);
        const op = fakeOperation(copy, 'create');
        copy.operationId = op.id;
        return op;
      }
      if (action === 'restore') {
        const op = fakeOperation(machine, 'restore');
        return op;
      }
      const op = fakeOperation(machine, action);
      machine.operationId = op.id;
      return op;
    }
    if (action === 'exec' && method === 'POST') {
      if (machine.state !== 'running') {
        fail(409, 'machine_not_running', 'Die Maschine läuft nicht. Starte sie zuerst.');
      }
      const cmd = body.cmd || (body.argv || []).join(' ');
      return execResult(cmd);
    }
    if (action === 'files' && method === 'GET') {
      const target = query.path || '/';
      const entry = files[target];
      if (!entry) fail(404, 'not_found', `Pfad ${target} nicht gefunden.`);
      if (entry.type === 'dir') {
        const entries: FileEntry[] = (entry.children || []).map((name) => {
          const childPath = (target === '/' ? '' : target) + '/' + name;
          const child = files[childPath];
          return {
            name,
            type: child?.type === 'dir' ? 'dir' : 'file',
            size: child?.content ? child.content.length : 0,
            modTime: ago(60),
            mode: child?.type === 'dir' ? 'drwxr-xr-x' : '-rw-r--r--',
          };
        });
        const payload: FilesPayload = {
          path: target,
          type: 'dir',
          mode: 'drwxr-xr-x',
          size: 0,
          modTime: ago(60),
          entries,
        };
        return payload;
      }
      return {
        path: target,
        type: 'file',
        mode: '-rw-r--r--',
        size: (entry.content || '').length,
        modTime: ago(60),
        content: entry.content,
      } satisfies FilesPayload;
    }
    if (action === 'files' && method === 'PUT') {
      const target = query.path || '/data/home/new-file.txt';
      files[target] = { type: 'file', content: String(body ?? '') };
      return { created: true, path: target, size: String(body ?? '').length, sha256: 'demo', mode: '0644' };
    }
    if (action === 'processes' && method === 'GET') {
      return {
        capturedAt: now(),
        live: true,
        machineId: machine.id,
        state: machine.state,
        trigger: 'request',
        truncated: false,
        processes: [
          { pid: 1, ppid: 0, user: 'root', cpuPercent: 0.2, memPercent: 0.4, elapsedSeconds: 3800, command: '/sbin/init' },
          { pid: 412, ppid: 1, user: 'dev', cpuPercent: 3.1, memPercent: 6.2, elapsedSeconds: 3500, command: 'node /data/home/project/server.js' },
          { pid: 512, ppid: 412, user: 'dev', cpuPercent: 1.4, memPercent: 2.1, elapsedSeconds: 3400, command: 'chromium --no-sandbox' },
          { pid: 733, ppid: 1, user: 'dev', cpuPercent: 0.1, memPercent: 0.8, elapsedSeconds: 900, command: 'sleep 3600' },
        ],
      };
    }
    if (action === 'logs' && method === 'GET') {
      return {
        machineId: machine.id,
        state: machine.state,
        cursor: 4821,
        console:
          '[    0.000000] Linux version 6.18.60-instabox-drm\n' +
          '[    1.204511] systemd[1]: Detected virtualization microvm.\n' +
          '[    2.841220] instabox-agent: boot completed, machine ready\n',
        operations: [],
      };
    }
    if (action === 'metrics' && method === 'GET') {
      return { metrics: metrics(machine), disk: { filesystems: [], measuredAt: now() } };
    }
    if (action === 'disk' && method === 'GET') {
      return {
        measuredAt: now(),
        filesystems: [
          {
            mount: '/data',
            sizeBytes: machine.spec.persistentDiskGiB * 1024 ** 3,
            usedBytes: 4.2 * 1024 ** 3,
            availableBytes: (machine.spec.persistentDiskGiB - 4.2) * 1024 ** 3,
            usedPct: 21,
            inodesUsedPct: 3,
            level: 'ok',
          },
          {
            mount: '/',
            sizeBytes: 16 * 1024 ** 3,
            usedBytes: 6.1 * 1024 ** 3,
            availableBytes: 9.9 * 1024 ** 3,
            usedPct: 38,
            inodesUsedPct: 11,
            level: 'ok',
          },
        ],
      };
    }
    if (action === 'ports' && method === 'GET') {
      return { enabled: true, ports: ports.filter((x) => x.machineId === machine.id) };
    }
    if (action === 'ports' && method === 'POST') {
      const port = Number(body.port);
      const existing = ports.find((x) => x.machineId === machine.id && x.port === port);
      if (existing) {
        existing.access = body.access || existing.access;
        return existing;
      }
      const created: PublicPort = {
        id: id('pp_'),
        machineId: machine.id,
        port,
        name: body.name || `Port ${port}`,
        access: body.access || 'public',
        url: `https://${port}-${machine.name}.instabox.sh`,
        protocol: 'http',
        createdAt: now(),
        token: body.access === 'private' ? 'ibp_demotoken' : undefined,
      };
      ports.push(created);
      return created;
    }
    if (action === 'ports' && p.length === 4 && method === 'DELETE') {
      const i = ports.findIndex((x) => x.machineId === machine.id && x.port === Number(p[3]));
      if (i >= 0) ports.splice(i, 1);
      return null;
    }
    if (action === 'ssh-tokens' && method === 'GET') {
      return { tokens: sshTokens.map((t) => ({ ...t, command: undefined, token: undefined })) };
    }
    if (action === 'ssh-tokens' && method === 'POST') {
      const token: SshToken = {
        id: id('cn_'),
        name: body.name || 'token',
        createdAt: now(),
        expiresAt: body.noExpiry ? undefined : new Date(Date.now() + 7 * 86400_000).toISOString(),
        command: 'ssh -p 22 ibssh_demo@sbx-1.example.com',
        host: 'sbx-1.example.com',
        port: 22,
        token: 'ibssh_demotoken',
      };
      sshTokens.unshift(token);
      return token;
    }
    if (action === 'ssh-tokens' && p.length === 4 && method === 'DELETE') {
      const i = sshTokens.findIndex((t) => t.id === p[3]);
      if (i >= 0) sshTokens.splice(i, 1);
      return null;
    }
    if (action === 'snapshots' && method === 'GET') {
      return { snapshots: snapshots.filter((s) => s.sourceMachineId === machine.id) };
    }
    if (action === 'snapshots' && method === 'POST') {
      const snapshot: Snapshot = {
        id: id('sn_'),
        name: body.name || `snap-${Math.random().toString(16).slice(2, 8)}`,
        status: 'pending',
        createdAt: now(),
        orgId: machine.orgId,
        sourceMachineId: machine.id,
        rootSizeBytes: 16 * 1024 ** 3,
        dataSizeBytes: machine.spec.persistentDiskGiB * 1024 ** 3,
        guestUser: machine.guestUser,
        description: body.description,
      };
      snapshots.unshift(snapshot);
      setTimeout(() => {
        snapshot.status = 'ready';
      }, 2500);
      return snapshot;
    }
    if (action === 'desktop' && method === 'POST') {
      const action2 = body.action || 'status';
      const state: DesktopState = {
        installed: true,
        installing: false,
        running: machine.state === 'running',
        failed: false,
        kind: 'x11',
        controller: 'agent',
        yours: false,
        agentPausable: true,
      };
      if (action2 === 'start') {
        state.running = true;
        state.controller = 'human';
        state.yours = true;
      }
      if (action2 === 'takeover') {
        state.controller = 'human';
        state.yours = true;
      }
      if (action2 === 'handback') {
        state.controller = 'agent';
        state.yours = false;
      }
      return state;
    }
    if (action === 'desktop' && p[3] === 'stream' && method === 'POST') {
      return {
        url: `https://dashboard.instabox.sh/desktop/${machine.id}#token=demo`,
        expiresAt: new Date(Date.now() + 3600_000).toISOString(),
      };
    }
    if (action === 'connection-info' && method === 'GET') {
      return {
        machineId: machine.id,
        host: 'sbx-1.example.com',
        port: 22,
        username: machine.id,
        capabilities: ['pty', 'exec', 'port-forwarding'],
        hostTrust: { type: 'ca', publicKey: 'ssh-ed25519 AAAA...demo', principals: ['instabox'] },
      };
    }
    if (action === 'history' && method === 'GET') {
      return {
        commands: [
          {
            id: id('ex_'),
            machineId: machine.id,
            command: 'npm run build',
            cwd: '/data/home/project',
            startedAt: ago(40),
            endedAt: ago(39),
            durationMs: 12400,
            exitCode: 0,
            status: 'exited',
            stdoutBytes: 0,
            stderrBytes: 0,
            outputTruncated: false,
            streamed: false,
            timedOut: false,
            truncated: false,
            userId: 1,
          },
        ],
      };
    }
  }

  // --- snapshots ---
  if (p[0] === 'snapshots' && method === 'GET') return { snapshots };
  if (p[0] === 'snapshots' && p.length === 2 && method === 'GET') {
    const snap = snapshots.find((s) => s.id === p[1]);
    if (!snap) fail(404, 'not_found', 'Snapshot nicht gefunden.');
    return snap;
  }
  if (p[0] === 'snapshots' && p.length === 2 && method === 'DELETE') {
    const i = snapshots.findIndex((s) => s.id === p[1]);
    if (i >= 0) snapshots.splice(i, 1);
    return null;
  }

  // --- ports / operations ---
  if (p[0] === 'ports' && method === 'GET') return { enabled: true, ports };
  if (p[0] === 'operations' && p.length === 2 && method === 'GET') {
    const op = operations.get(p[1]);
    if (!op) fail(404, 'not_found', 'Operation nicht gefunden.');
    return op;
  }

  // --- access ---
  if (p[0] === 'machines' && p.length === 3 && p[2] === 'access') {
    return {
      url: `wss://api.instabox.sh/v1/machines/${p[1]}/vnc`,
      protocol: 'vnc',
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    };
  }

  fail(404, 'not_found', `Demo-API kennt ${method} ${path} nicht.`);
}
