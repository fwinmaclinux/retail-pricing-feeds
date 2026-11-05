import * as Crypto from 'expo-crypto';
import { config } from '@/config';

/** Error carrying the server's RFC 9457 problem details. */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly body: Record<string, unknown> = {},
  ) {
    super(message);
  }

  get isNetworkError() {
    return this.status === 0;
  }

  /** Field-level messages from a 400 response, keyed by field name. */
  get fieldErrors(): Record<string, string[]> {
    return (this.body.errors as Record<string, string[]>) ?? {};
  }
}

type AuthHooks = { getToken: () => string | null; onUnauthorized: () => void };
let auth: AuthHooks = { getToken: () => null, onUnauthorized: () => {} };

export function configureApiAuth(hooks: AuthHooks) {
  auth = hooks;
}

export function resolveUrl(pathOrUrl: string) {
  return /^https?:\/\//.test(pathOrUrl) ? pathOrUrl : `${config.apiBaseUrl}${pathOrUrl}`;
}

export function authHeaders(): Record<string, string> {
  const token = auth.getToken();
  return {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    // Correlation id: lets support trace one tap through gateway, API and worker logs.
    'X-Request-Id': Crypto.randomUUID(),
  };
}

export interface ApiResponse<T> {
  data: T;
  headers: Headers;
}

export async function api<T>(
  path: string,
  init: { method?: string; body?: unknown; headers?: Record<string, string>; signal?: AbortSignal } = {},
): Promise<ApiResponse<T>> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.requestTimeoutMs);
  init.signal?.addEventListener('abort', () => controller.abort());

  let res: Response;
  try {
    res = await fetch(resolveUrl(path), {
      method: init.method ?? 'GET',
      headers: {
        Accept: 'application/json',
        ...(init.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...authHeaders(),
        ...init.headers,
      },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      signal: controller.signal,
    });
  } catch {
    throw new ApiError(0, 'NETWORK_ERROR', "Can't reach the pricing service. Check your connection and try again.");
  } finally {
    clearTimeout(timeout);
  }

  const text = await res.text();
  const body = text ? safeJson(text) : {};
  if (!res.ok) {
    if (res.status === 401) auth.onUnauthorized();
    throw new ApiError(
      res.status,
      String(body.code ?? 'HTTP_ERROR'),
      String(body.title ?? `Request failed (${res.status})`),
      body,
    );
  }
  return { data: body as T, headers: res.headers };
}

function safeJson(text: string): Record<string, unknown> {
  try {
    return JSON.parse(text);
  } catch {
    return { title: text.slice(0, 200) };
  }
}
