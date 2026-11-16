import type { ApiErrorBody } from './types';

export class ApiError extends Error {
  status: number;
  code: string;
  hint?: string;
  requestId?: string;
  docsUrl?: string;
  retryable: boolean;
  retryAfterSeconds?: number;
  requiredScopes?: string[];
  operationId?: string | null;

  constructor(status: number, body: Partial<ApiErrorBody> | null, fallback?: string) {
    const code = body?.code || (status >= 500 ? 'internal' : 'network_error');
    super(body?.message || fallback || code);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.hint = body?.hint;
    this.requestId = body?.requestId;
    this.docsUrl = body?.docs_url;
    this.retryable = !!body?.retryable;
    this.retryAfterSeconds = body?.retryAfterSeconds;
    this.requiredScopes = body?.requiredScopes;
    this.operationId = body?.operationId;
  }
}

export function errorText(e: unknown): string {
  if (e instanceof ApiError) {
    if (e.hint) return `${e.message} (${e.hint})`;
    return e.message;
  }
  if (e instanceof Error) return e.message;
  return String(e);
}
