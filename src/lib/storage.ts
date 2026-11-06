// File storage on Cloudflare R2, served by the API Worker at /storage (see api/).
import { API_URL, authHeaders } from '@/lib/auth';

export type Bucket = 'avatars' | 'content-media' | 'protected-content-media' | 'private-cvs' | 'privacy-exports';

const PART_SIZE = 10 * 1024 * 1024; // multipart chunk; R2 needs equal parts except the last

function baseUrl() {
  return `${API_URL}/storage`;
}

function encodePath(path: string) {
  return path.split('/').map(encodeURIComponent).join('/');
}

async function authHeader(): Promise<Record<string, string>> {
  const headers = await authHeaders();
  if (!Object.keys(headers).length) throw new Error('Your session expired. Sign in again.');
  return headers;
}

async function call<T>(input: string, init: RequestInit): Promise<T> {
  const res = await fetch(input, { ...init, credentials: 'omit' });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(typeof body?.error === 'string' ? body.error : `Storage request failed (${res.status}).`);
  return body as T;
}

export function publicUrl(bucket: 'avatars' | 'content-media', path: string) {
  return `${baseUrl()}/public/${bucket}/${encodePath(path)}`;
}

export async function createSignedUrl(bucket: Bucket, path: string, expiresIn: number) {
  try {
    const { signedUrl } = await call<{ signedUrl: string }>(`${baseUrl()}/sign`, {
      method: 'POST',
      headers: { ...(await authHeader()), 'content-type': 'application/json' },
      body: JSON.stringify({ bucket, path, expiresIn }),
    });
    return { url: signedUrl, error: null };
  } catch (error) {
    return { url: null, error: error instanceof Error ? error : new Error(String(error)) };
  }
}

export type UploadControl = { paused: boolean; cancelled: boolean; resume?: () => void };

export type UploadOptions = {
  contentType: string;
  upsert?: boolean;
  onProgress?: (percent: number) => void;
  control?: UploadControl; // set paused/cancelled from outside; call resume() to continue
};

export async function uploadFile(bucket: Bucket, path: string, body: Blob, options: UploadOptions): Promise<{ path: string }> {
  const headers = { ...(await authHeader()), 'content-type': options.contentType, 'x-upsert': options.upsert ? 'true' : 'false' };
  const objectUrl = `${baseUrl()}/object/${bucket}/${encodePath(path)}`;

  if (body.size <= PART_SIZE) {
    await call(objectUrl, { method: 'PUT', headers, body });
    options.onProgress?.(100);
    return { path };
  }

  const multipartUrl = `${baseUrl()}/multipart/${bucket}/${encodePath(path)}`;
  const { uploadId } = await call<{ uploadId: string }>(`${multipartUrl}?action=create`, { method: 'POST', headers });
  const query = (extra: string) => `${multipartUrl}?uploadId=${encodeURIComponent(uploadId)}&${extra}`;
  const parts: { partNumber: number; etag: string }[] = [];
  const total = Math.ceil(body.size / PART_SIZE);
  try {
    for (let index = 0; index < total; index += 1) {
      await waitWhilePaused(options.control);
      const chunk = body.slice(index * PART_SIZE, Math.min(body.size, (index + 1) * PART_SIZE));
      const fresh = await authHeader(); // long uploads can outlive an access token
      parts.push(await call(query(`action=part&part=${index + 1}`), { method: 'PUT', headers: { ...fresh, 'content-type': 'application/octet-stream' }, body: chunk }));
      options.onProgress?.(Math.round(((index + 1) / total) * 100));
    }
    await call(query('action=complete'), { method: 'POST', headers: { ...(await authHeader()), 'content-type': 'application/json' }, body: JSON.stringify({ parts }) });
    return { path };
  } catch (error) {
    await fetch(query('action=abort'), { method: 'DELETE', headers: await authHeader() }).catch(() => undefined);
    throw error;
  }
}

async function waitWhilePaused(control?: UploadControl) {
  if (control?.cancelled) throw new Error('Upload cancelled.');
  if (!control?.paused) return;
  await new Promise<void>((resolve) => { control.resume = resolve; });
  control.resume = undefined;
  if (control.cancelled) throw new Error('Upload cancelled.');
}
