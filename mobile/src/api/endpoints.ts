import { api, ApiError, authHeaders, resolveUrl } from './client';
import type {
  AuditEntry,
  CreateFeedResponse,
  Feed,
  FeedRowError,
  Page,
  PriceRecord,
  SearchCriteria,
  Store,
  UploadInstructions,
  User,
} from './types';

export const authApi = {
  personas: async () => (await api<{ items: User[] }>('/api/v1/auth/personas')).data.items,
  devLogin: async (userId: string) =>
    (await api<{ accessToken: string; user: User }>('/api/v1/auth/dev-login', { method: 'POST', body: { userId } })).data,
};

export const storesApi = {
  list: async () => (await api<{ items: Store[] }>('/api/v1/stores')).data.items,
};

export const pricesApi = {
  search: async (criteria: SearchCriteria, cursor: string | null, signal?: AbortSignal) => {
    const [sort, order] = criteria.sort.split(':');
    const params = new URLSearchParams({ sort: sort!, order: order!, limit: '25' });
    for (const key of ['q', 'storeId', 'countryCode', 'minPrice', 'maxPrice', 'dateFrom', 'dateTo'] as const) {
      const value = criteria[key]?.trim();
      if (value) params.set(key, value);
    }
    if (cursor) params.set('cursor', cursor);
    return (await api<Page<PriceRecord>>(`/api/v1/prices?${params}`, { signal })).data;
  },
  get: async (id: string) => (await api<PriceRecord>(`/api/v1/prices/${id}`)).data,
  /** Sends the version the user edited as If-Match; the server answers 412 if it is stale. */
  update: async (id: string, version: number, changes: { price?: string; productName?: string; reason: string }) =>
    (
      await api<PriceRecord>(`/api/v1/prices/${id}`, {
        method: 'PATCH',
        body: changes,
        headers: { 'If-Match': `"${version}"` },
      })
    ).data,
  history: async (id: string) => (await api<{ items: AuditEntry[] }>(`/api/v1/prices/${id}/history`)).data.items,
};

export const feedsApi = {
  create: async (input: { fileName: string; sizeBytes: number; checksumSha256: string }) =>
    (await api<CreateFeedResponse>('/api/v1/feeds', { method: 'POST', body: input })).data,
  list: async () => (await api<{ items: Feed[] }>('/api/v1/feeds')).data.items,
  get: async (feedId: string) => (await api<{ feed: Feed }>(`/api/v1/feeds/${feedId}`)).data.feed,
  errors: async (feedId: string) => (await api<{ items: FeedRowError[] }>(`/api/v1/feeds/${feedId}/errors`)).data.items,
};

/**
 * Sends the file body to the upload URL with progress events. XMLHttpRequest is used instead
 * of fetch because fetch exposes no upload progress in React Native.
 * Production: the URL is a pre-signed S3 PUT and large files go through a native background
 * upload session so the transfer survives the app being backgrounded.
 */
export function uploadFeedContent(
  upload: UploadInstructions,
  body: string,
  onProgress: (fraction: number) => void,
): { promise: Promise<Feed>; cancel: () => void } {
  const xhr = new XMLHttpRequest();
  const promise = new Promise<Feed>((resolve, reject) => {
    xhr.open(upload.method, resolveUrl(upload.url));
    const headers = { ...upload.headers, ...authHeaders() };
    Object.entries(headers).forEach(([k, v]) => xhr.setRequestHeader(k, v));
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && e.total > 0) onProgress(e.loaded / e.total);
    };
    xhr.onload = () => {
      let parsed: Record<string, unknown> = {};
      try {
        parsed = JSON.parse(xhr.responseText || '{}');
      } catch {
        /* non-JSON body */
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress(1);
        resolve(parsed.feed as Feed);
      } else {
        reject(new ApiError(xhr.status, String(parsed.code ?? 'UPLOAD_FAILED'), String(parsed.title ?? 'Upload failed'), parsed));
      }
    };
    xhr.onerror = () => reject(new ApiError(0, 'NETWORK_ERROR', 'The upload was interrupted. Check your connection and retry.'));
    xhr.onabort = () => reject(new ApiError(0, 'CANCELLED', 'Upload cancelled'));
    xhr.send(body);
  });
  return { promise, cancel: () => xhr.abort() };
}
