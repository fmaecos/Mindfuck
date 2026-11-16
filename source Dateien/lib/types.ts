export type MachineState =
  | 'creating' | 'starting' | 'running' | 'stopping' | 'stopped'
  | 'suspending' | 'suspended' | 'resuming' | 'deleting' | 'deleted' | 'error';

export type MachineSpec = {
  vcpus: number;
  memMiB: number;
  persistentDiskGiB: number;
  rootDiskGiB?: number;
};

export type Machine = {
  id: string;
  name: string;
  state: MachineState;
  desiredState: 'running' | 'stopped';
  spec: MachineSpec;
  template: { id: string; version: string; digest?: string };
  snapshot?: { id: string } | null;
  orgId: string;
  guestUser: string;
  createdAt: string;
  updatedAt: string;
  readyAt?: string;
  runStartedAt?: string | null;
  revision: number;
  operationId: string | null;
  metadata?: Record<string, string>;
  autoSuspendAfterSeconds: number | null;
  maxRunMinutes?: number;
  oomKills?: number;
  lastError?: ApiErrorBody | null;
  runtime?: { ready?: boolean; processesPreserved?: boolean };
  storage?: { mountPath?: string; sizeGiB?: number; synced?: boolean; snapshotSeq?: number };
  envNames?: string[];
  free?: boolean;
  cooldownUntil?: string | null;
  cooldownReason?: string | null;
};

export type ApiErrorBody = {
  code: string;
  message: string;
  requestId?: string;
  retryable?: boolean;
  operationId?: string | null;
  hint?: string;
  docs_url?: string;
  requiredScopes?: string[];
  retryAfterSeconds?: number;
};

export type Operation = {
  id: string;
  type: string;
  state: 'queued' | 'running' | 'succeeded' | 'failed';
  phase?: string;
  createdAt: string;
  updatedAt: string;
  machineId?: string;
  error?: ApiErrorBody | null;
  trigger?: string;
};

export type TemplateVersion = {
  id: string;
  version: string;
  description?: string;
  defaultSpec: MachineSpec;
  creatable?: boolean;
  hidden?: boolean;
  default?: boolean;
  latest?: boolean;
  preboot?: boolean;
  digest?: string;
  arch?: string;
};

export type Snapshot = {
  id: string;
  name: string;
  status: 'pending' | 'ready' | 'failed';
  createdAt: string;
  orgId: string;
  sourceMachineId: string;
  rootSizeBytes: number;
  dataSizeBytes?: number;
  guestUser?: string;
  description?: string;
  error?: string;
  visibility?: string;
  template?: { id: string; version: string };
};

export type PublicPort = {
  id: string;
  machineId: string;
  port: number;
  name: string;
  access: 'public' | 'private';
  url: string;
  protocol?: 'http' | 'tcp';
  createdAt: string;
  token?: string;
  tokenUrl?: string;
  address?: string;
};

export type SshToken = {
  id: string;
  name: string;
  createdAt: string;
  expiresAt?: string;
  revokedAt?: string;
  command?: string;
  host?: string;
  port?: number;
  token?: string;
  moshCommand?: string;
};

export type ConnectionInfo = {
  machineId: string;
  host: string;
  port: number;
  username: string;
  capabilities: string[];
  hostTrust?: { type: string; publicKey: string; principals: string[] };
};

export type DesktopState = {
  installed: boolean;
  installing: boolean;
  running: boolean;
  failed: boolean;
  kind?: 'x11' | 'wayland' | 'vm';
  controller?: 'agent' | 'human';
  yours?: boolean;
  agentPausable?: boolean;
  hint?: string;
  log?: string;
  controlError?: string;
};

export type ApiKeyInfo = {
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
  createdAt: string;
  expiresAt: string | null;
  lastUsedAt: string | null;
  orgId?: string;
  createdByLogin?: string;
};

export type SessionInfo = {
  id: string;
  kind: 'cli' | 'browser';
  createdAt: string;
  lastUsedAt: string;
  expiresAt: string;
  current: boolean;
};

export type Org = {
  id: string;
  name: string;
  kind: 'personal' | 'workspace';
  tier: 'free' | 'pro' | 'builder' | 'team' | 'enterprise';
  role?: 'owner' | 'admin' | 'member';
  limits?: {
    maxMachines: number;
    maxRunning: number;
    maxSnapshots: number;
    maxStoredGiB: number;
    maxDiskGiB?: number;
    maxMembers: number;
    alwaysOn: boolean;
  };
  usage?: {
    costUSD: number;
    machines: number;
    running: number;
    snapshots: number;
    allocatedDiskGiB: number;
    remainingUSD: number;
    allowanceUSD: number;
    creditsUSD: number;
    periodStart: string;
    periodEnd: string;
  };
  allowedSpecs?: MachineSpec[];
  billing?: { status?: string; tier?: string; periodEnd?: string; cancelAtPeriodEnd?: boolean };
};

export type Me = {
  userId: number;
  login: string;
  name?: string;
  email?: string;
  avatarUrl?: string;
  admin?: boolean;
  orgId?: string;
  allowedSpecs?: MachineSpec[];
  idleChoicesSeconds?: number[];
  alwaysOnAllowed?: boolean;
  inviteRequired?: boolean;
  activated?: boolean;
  machineMetrics?: boolean;
  webhooksEnabled?: boolean;
  workspaces?: { id: string; name: string; kind: string; tier: string }[];
};

export type Usage = {
  machines: number;
  snapshots: number;
  storedBytes: number;
  logicalBytes: number;
  computedAt: string | null;
  limits: {
    maxMachines: number;
    maxSnapshots: number;
    maxStoredGiB: number;
    machineSpec?: MachineSpec;
    machineSpecs?: MachineSpec[];
    unlimited?: string[];
  };
  cost?: {
    costUSD: number;
    vcpuUSD: number;
    memUSD: number;
    storageUSD: number;
    egressUSD: number;
    allowanceUSD: number;
    remainingUSD: number;
    creditsUSD: number;
    running: number;
    machines: number;
    snapshots: number;
    allocatedDiskGiB: number;
    periodStart: string;
    periodEnd: string;
  };
  org?: { id: string; name: string; tier: string };
};

export type OrgMember = {
  userId: number;
  login: string;
  email?: string;
  role: 'owner' | 'admin' | 'member';
  createdAt: string;
};

export type OrgInvite = {
  id: string;
  email?: string;
  role: 'admin' | 'member';
  createdAt: string;
  expiresAt: string;
  redeemedAt?: string;
  revokedAt?: string;
};

export type SecretInfo = {
  id: string;
  name: string;
  size: number;
  createdAt: string;
  updatedAt: string;
  version: number;
  delivery: 'proxy' | 'env';
  hosts?: string[];
};

export type WebhookInfo = {
  id: string;
  url: string;
  description: string;
  enabled: boolean;
  events: string[];
  createdAt: string;
  disabledReason?: string;
};

export type ExecResult = {
  stdout: string;
  stderr: string;
  exitCode: number;
  timedOut?: boolean;
  truncated?: boolean;
  signal?: string;
  oomKilled?: boolean;
  diskWarning?: { level: string; message: string; mount: string; usedPct: number };
};

export type ProcessInfo = {
  pid: number;
  ppid: number;
  user: string;
  cpuPercent: number;
  memPercent: number;
  elapsedSeconds: number;
  command: string;
};

export type MachineMetric = {
  timestamp: string;
  cpuUsedPct: number;
  cpuCount: number;
  memUsed: number;
  memTotal: number;
  netInBytesPerSec?: number;
  netOutBytesPerSec?: number;
  diskUsed?: number;
  diskTotal: number;
};

export type FileEntry = {
  name: string;
  type: 'dir' | 'file' | 'symlink' | 'other';
  size: number;
  modTime: string;
  mode: string;
  target?: string;
};

export type FilesPayload = {
  path: string;
  type: 'dir' | 'file' | 'other';
  mode: string;
  size: number;
  modTime: string;
  entries?: FileEntry[];
  content?: string;
  binary?: boolean;
  truncated?: boolean;
};
