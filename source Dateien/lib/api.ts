import { ApiError } from './errors';
import { demoRequest } from './demo';

export type Query = Record<string, string | number | boolean | undefined | null>;

export type RequestOptions = {
  query?: Query;
  body?: any;
  /** Send an Idempotency-Key header (required by mutating endpoints). */
  idempotent?: boolean;
  /** Send X-Confirm-Delete with the given value. */
  confirmDelete?: string;
  /** Raw request body (e.g. for file uploads). */
  raw?: string;
  headers?: Record<string, string>;
  timeoutMs?: number;
  signal?: AbortSignal;
};

export type ApiClientOptions = {
  baseUrl: string;
  demo?: boolean;
  /** Returns the Authorization header value, refreshing the token if needed. */
  getAuth?: () => Promise<string | null>;
};

export function randomKey(prefix = 'idem'): string {
  const rand = () => Math.random().toString(36).slice(2, 12);
  return `${prefix}_${Date.now().toString(36)}_${rand()}${rand()}`;
}

export class ApiClient {
  baseUrl: string;
  demo: boolean;
  getAuth?: () => Promise<string | null>;

  constructor(options: ApiClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, '');
    this.demo = !!options.demo;
    this.getAuth = options.getAuth;
  }

  url(path: string, query?: Query): string {
    const clean = path.startsWith('/') ? path : `/${path}`;
    const params: string[] = [];
    if (query) {
      Object.entries(query).forEach(([key, value]) => {
        if (value === undefined || value === null || value === '') return;
        params.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
      });
    }
    const qs = params.length ? `?${params.join('&')}` : '';
    return `${this.baseUrl}${clean}${qs}`;
  }

  async request<T = any>(method: string, path: string, options: RequestOptions = {}): Promise<T> {
    if (this.demo) {
      const query: Record<string, string | undefined> = {};
      Object.entries(options.query || {}).forEach(([k, v]) => {
        if (v !== undefined && v !== null) query[k] = String(v);
      });
      return demoRequest({ method, path, query, body: options.body ?? options.raw }) as T;
    }

    const headers: Record<string, string> = {
      Accept: 'application/json',
      ...(options.headers || {}),
    };
    const auth = this.getAuth ? await this.getAuth() : null;
    if (auth) headers.Authorization = auth;

    let body: string | undefined;
    if (options.raw !== undefined) {
      body = options.raw;
      headers['Content-Type'] = headers['Content-Type'] || 'application/octet-stream';
    } else if (options.body !== undefined) {
      body = JSON.stringify(options.body);
      headers['Content-Type'] = 'application/json';
    }
    if (options.idempotent) headers['Idempotency-Key'] = randomKey();
    if (options.confirmDelete) headers['X-Confirm-Delete'] = options.confirmDelete;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 45_000);
    if (options.signal) {
      options.signal.addEventListener('abort', () => controller.abort());
    }

    let response: Response;
    try {
      response = await fetch(this.url(path, options.query), {
        method,
        headers,
        body,
        signal: controller.signal,
      });
    } catch (e: any) {
      clearTimeout(timeout);
      if (e?.name === 'AbortError') {
        throw new ApiError(0, { code: 'timeout', message: 'Zeitüberschreitung bei der Anfrage.', retryable: true });
      }
      throw new ApiError(0, {
        code: 'network_error',
        message:
          'Keine Verbindung zur InstaBox-API. Im Browser blockiert die CORS-Policy die Anfrage – nutze die App auf iOS/Android oder setze einen eigenen Proxy.',
        retryable: true,
      });
    }
    clearTimeout(timeout);

    const text = await response.text();
    let parsed: any = null;
    if (text) {
      try {
        parsed = JSON.parse(text);
      } catch (e) {
        parsed = { raw: text };
      }
    }

    if (!response.ok) {
      const errorBody = parsed?.error || parsed;
      throw new ApiError(response.status, errorBody, `HTTP ${response.status}`);
    }
    return parsed as T;
  }

  get<T = any>(path: string, query?: Query, options: RequestOptions = {}) {
    return this.request<T>('GET', path, { ...options, query });
  }

  post<T = any>(path: string, body?: any, options: RequestOptions = {}) {
    return this.request<T>('POST', path, { ...options, body });
  }

  patch<T = any>(path: string, body?: any, options: RequestOptions = {}) {
    return this.request<T>('PATCH', path, { ...options, body });
  }

  put<T = any>(path: string, body?: any, options: RequestOptions = {}) {
    return this.request<T>('PUT', path, { ...options, body });
  }

  del<T = any>(path: string, options: RequestOptions = {}) {
    return this.request<T>('DELETE', path, options);
  }
}

export const DEFAULT_BASE_URL = 'https://api.instabox.sh';

export function normalizeBaseUrl(url: string): string {
  let value = (url || '').trim();
  if (!value) return DEFAULT_BASE_URL;
  if (!/^https?:\/\//i.test(value)) value = `https://${value}`;
  return value.replace(/\/+$/, '');
}

/** Waits for an operation to finish. */
export async function waitForOperation(
  client: ApiClient,
  operationId: string,
  onTick?: (op: any) => void,
  timeoutMs = 600_000
): Promise<any> {
  const started = Date.now();
  for (;;) {
    const op = await client.get(`/v1/operations/${operationId}`, { wait: '10s' });
    onTick?.(op);
    if (op?.state === 'succeeded' || op?.state === 'failed') return op;
    if (Date.now() - started > timeoutMs) {
      throw new ApiError(0, { code: 'timeout', message: 'Die Operation hat zu lange gedauert.' });
    }
    await new Promise((resolve) => setTimeout(resolve, 900));
  }
}
