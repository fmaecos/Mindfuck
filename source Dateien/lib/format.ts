import { Platform } from 'react-native';

export function formatBytes(bytes?: number): string {
  if (bytes === undefined || bytes === null || Number.isNaN(bytes)) return '–';
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB', 'PB'];
  let value = bytes / 1024;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i++;
  }
  return `${value.toFixed(value >= 100 ? 0 : 1)} ${units[i]}`;
}

export function formatUsd(value?: number): string {
  if (value === undefined || value === null || Number.isNaN(value)) return '–';
  if (value === 0) return '$0.00';
  if (Math.abs(value) < 0.01) return '< $0.01';
  return `$${value.toFixed(2)}`;
}

export function formatDuration(seconds?: number): string {
  if (!seconds && seconds !== 0) return '–';
  if (seconds < 60) return `${Math.round(seconds)} s`;
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  if (m < 60) return `${m} min ${s ? `${s} s` : ''}`.trim();
  const h = Math.floor(m / 60);
  return `${h} h ${m % 60} min`;
}

export function formatRelative(iso?: string | null): string {
  if (!iso) return '–';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '–';
  const diff = Date.now() - then;
  const abs = Math.abs(diff);
  const suffix = diff >= 0 ? 'vor' : 'in';
  if (abs < 45_000) return diff >= 0 ? 'gerade eben' : 'gleich';
  if (abs < 3_600_000) return `${suffix} ${Math.round(abs / 60_000)} min`;
  if (abs < 86_400_000) return `${suffix} ${Math.round(abs / 3_600_000)} h`;
  if (abs < 2_592_000_000) return `${suffix} ${Math.round(abs / 86_400_000)} d`;
  return formatDate(iso);
}

export function formatDate(iso?: string | null): string {
  if (!iso) return '–';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '–';
  return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function formatDateTime(iso?: string | null): string {
  if (!iso) return '–';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '–';
  return d.toLocaleString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatSpec(vcpus?: number, memMiB?: number): string {
  if (!vcpus && !memMiB) return '–';
  return `${vcpus ?? '?'} vCPU · ${formatBytes((memMiB ?? 0) * 1024 * 1024).replace('B', '')}`;
}

export const STATE_LABEL: Record<string, string> = {
  creating: 'wird erstellt',
  starting: 'startet',
  running: 'läuft',
  stopping: 'stoppt',
  stopped: 'gestoppt',
  suspending: 'pausiert',
  suspended: 'pausiert',
  resuming: 'wacht auf',
  deleting: 'wird gelöscht',
  deleted: 'gelöscht',
  error: 'Fehler',
};

export function formatBytesLabel(value?: number): string {
  if (!value) return '–';
  return formatBytes(value);
}

export function isWeb(): boolean {
  return Platform.OS === 'web';
}

export function randomId(): string {
  return (
    Math.random().toString(36).slice(2, 10) +
    Math.random().toString(36).slice(2, 6) +
    Date.now().toString(36)
  );
}
