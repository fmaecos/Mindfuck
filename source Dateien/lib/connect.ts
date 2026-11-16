import { ApiClient } from './api';
import { ApiError } from './errors';

export type AccessDescriptor = {
  url: string;
  protocols: string[];
  expiresAt?: string;
  token?: string;
};

/**
 * Asks the API for a short-lived connection ticket.
 * Falls back to the plain API endpoint when the server has no /access route.
 */
export async function requestAccess(
  client: ApiClient,
  machineId: string,
  kind: 'vnc' | 'terminal',
  query?: Record<string, string | number>
): Promise<AccessDescriptor> {
  if (client.demo) {
    return { url: `demo://${kind}/${machineId}`, protocols: [] };
  }
  try {
    const result = await client.post<any>(`/v1/machines/${machineId}/access`, { kind });
    const protocols: string[] = [];
    if (result?.protocol) protocols.push(String(result.protocol));
    if (result?.token) protocols.push(`instabox-access-token.${result.token}`);
    let url = String(result?.url || '');
    if (query && Object.keys(query).length) {
      const params = Object.entries(query)
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
        .join('&');
      url += (url.includes('?') ? '&' : '?') + params;
    }
    return { url, protocols, expiresAt: result?.expiresAt, token: result?.token };
  } catch (e) {
    if (
      e instanceof ApiError &&
      (e.status === 404 || e.status === 405 || e.status === 400 || e.status === 501)
    ) {
      const suffix = kind === 'vnc' ? 'vnc' : 'terminal';
      const params = query
        ? Object.entries(query)
            .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
            .join('&')
        : '';
      const base = `${client.baseUrl}/v1/machines/${machineId}/${suffix}${params ? `?${params}` : ''}`;
      return { url: base, protocols: [] };
    }
    throw e;
  }
}

export function toWebSocketUrl(url: string): string {
  if (url.startsWith('ws://') || url.startsWith('wss://')) return url;
  if (url.startsWith('https://')) return `wss://${url.slice('https://'.length)}`;
  if (url.startsWith('http://')) return `ws://${url.slice('http://'.length)}`;
  return url;
}
