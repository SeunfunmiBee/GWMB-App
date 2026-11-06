// GWMB file storage on Cloudflare R2, mounted at /storage.
// Mirrors the old Supabase Storage buckets and policies: one R2 bucket, object keys are `<bucket>/<path>`.
import type { Env } from './env';
import { type Caller, getCaller, isAdmin, isVerifiedMember, timingSafeEqual } from './identity';

type Op = 'read' | 'write';

const MB = 1024 * 1024;
const PART_SIZE_LIMIT = 95 * MB; // stays under the Workers request body limit
const MEDIA = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const DOCS = ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];

const BUCKETS: Record<string, { public: boolean; maxBytes: number; mime: string[]; can: (op: Op, c: Caller, path: string, env: Env) => Promise<boolean> }> = {
  avatars: {
    public: true, maxBytes: 5 * MB, mime: ['image/jpeg', 'image/png', 'image/webp'],
    can: async (_op, c, path) => isOwner(c, path),
  },
  'content-media': {
    public: true, maxBytes: 250 * MB,
    mime: [...MEDIA, 'video/mp4', 'video/webm', 'video/quicktime', 'video/x-m4v', ...DOCS,
      'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'text/plain', 'text/csv'],
    can: async (_op, c, _path, env) => isAdmin(env, c),
  },
  'protected-content-media': {
    public: false, maxBytes: 250 * MB,
    mime: [...DOCS, 'video/mp4', 'video/quicktime', 'video/webm', 'image/jpeg', 'image/png', 'image/webp'],
    can: async (op, c, _path, env) => (await isAdmin(env, c)) || (op === 'read' && isVerifiedMember(env, c)),
  },
  'private-cvs': {
    public: false, maxBytes: 10 * MB,
    mime: ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'image/jpeg', 'image/png'],
    can: async (op, c, path, env) => isOwner(c, path) || (op === 'read' && isAdmin(env, c)),
  },
  'privacy-exports': {
    public: false, maxBytes: 10 * MB, mime: ['application/json'],
    can: async () => false, // service only
  },
};

export async function handleStorage(req: Request, env: Env): Promise<Response> {
  try {
    return await route(req, env);
  } catch (error) {
    if (error instanceof HttpError) return json({ error: error.message }, error.status);
    console.error(error);
    return json({ error: 'Storage request failed.' }, 500);
  }
}

async function route(req: Request, env: Env): Promise<Response> {
  const url = new URL(req.url);
  const [, , scope, bucketName, ...rest] = url.pathname.split('/'); // /storage/<scope>/<bucket>/<path>
  const path = decodeURIComponent(rest.join('/'));

  // Service-only helpers for Edge Functions (account export / deletion).
  if (scope === 'list' && req.method === 'GET') {
    requireService(await getCaller(req, env));
    const bucket = bucketOrThrow(url.searchParams.get('bucket'));
    const listed = await env.FILES.list({ prefix: `${bucket}/${url.searchParams.get('prefix') ?? ''}`, cursor: url.searchParams.get('cursor') ?? undefined, include: ['httpMetadata'] });
    return json({
      files: listed.objects.map((o) => ({ path: o.key.slice(bucket.length + 1), size: o.size, content_type: o.httpMetadata?.contentType ?? null, uploaded_at: o.uploaded.toISOString() })),
      cursor: listed.truncated ? listed.cursor : null,
    });
  }
  if (scope === 'delete' && req.method === 'POST') {
    requireService(await getCaller(req, env));
    const { bucket, paths } = await req.json<{ bucket: string; paths: string[] }>();
    bucketOrThrow(bucket);
    await env.FILES.delete(paths.map((p) => `${bucket}/${safePath(p)}`));
    return json({ removed: paths.length });
  }
  if (scope === 'sign' && req.method === 'POST') {
    const body = await req.json<{ bucket: string; path: string; expiresIn?: number }>();
    const bucket = bucketOrThrow(body.bucket);
    const p = safePath(body.path);
    await authorize(req, env, bucket, 'read', p);
    const expires = Math.floor(Date.now() / 1000) + Math.min(Math.max(body.expiresIn ?? 900, 30), 7 * 24 * 3600);
    const sig = await hmac(env, `${bucket}/${p}:${expires}`);
    return json({ signedUrl: `${url.origin}/storage/signed/${bucket}/${encodePath(p)}?exp=${expires}&sig=${sig}` });
  }

  const bucket = bucketOrThrow(bucketName);
  const p = safePath(path);
  const key = `${bucket}/${p}`;
  const rule = BUCKETS[bucket];

  if (scope === 'public' && (req.method === 'GET' || req.method === 'HEAD')) {
    if (!rule.public) throw new HttpError(404, 'Not found.');
    return serve(req, env, key, 'public, max-age=3600');
  }
  if (scope === 'signed' && (req.method === 'GET' || req.method === 'HEAD')) {
    const exp = Number(url.searchParams.get('exp'));
    const sig = url.searchParams.get('sig') ?? '';
    if (!exp || exp < Date.now() / 1000 || !timingSafeEqual(sig, await hmac(env, `${bucket}/${p}:${exp}`))) throw new HttpError(403, 'This link has expired.');
    return serve(req, env, key, 'private, max-age=60');
  }
  if (scope === 'object' && req.method === 'PUT') {
    await authorize(req, env, bucket, 'write', p);
    const contentType = checkType(rule, req.headers.get('content-type'));
    const size = Number(req.headers.get('content-length') ?? 0);
    if (size > rule.maxBytes) throw new HttpError(413, 'This file is too large.');
    if (req.headers.get('x-upsert') !== 'true' && (await env.FILES.head(key))) throw new HttpError(409, 'A file already exists at this path.');
    const object = await env.FILES.put(key, req.body, { httpMetadata: { contentType, cacheControl: rule.public ? 'public, max-age=3600' : 'private' } });
    if (object && object.size > rule.maxBytes) { await env.FILES.delete(key); throw new HttpError(413, 'This file is too large.'); }
    return json({ path: p });
  }
  if (scope === 'object' && req.method === 'DELETE') {
    await authorize(req, env, bucket, 'write', p);
    await env.FILES.delete(key);
    return json({ removed: 1 });
  }
  if (scope === 'multipart') return multipart(req, env, url, bucket, p);
  throw new HttpError(404, 'Not found.');
}

// Large uploads: create -> PUT parts (<=95 MB, equal size except the last) -> complete.
async function multipart(req: Request, env: Env, url: URL, bucket: string, p: string): Promise<Response> {
  const rule = BUCKETS[bucket];
  const key = `${bucket}/${p}`;
  await authorize(req, env, bucket, 'write', p);
  const action = url.searchParams.get('action');
  const uploadId = url.searchParams.get('uploadId') ?? '';
  if (action === 'create' && req.method === 'POST') {
    const contentType = checkType(rule, req.headers.get('content-type'));
    if (req.headers.get('x-upsert') !== 'true' && (await env.FILES.head(key))) throw new HttpError(409, 'A file already exists at this path.');
    const upload = await env.FILES.createMultipartUpload(key, { httpMetadata: { contentType, cacheControl: rule.public ? 'public, max-age=3600' : 'private' } });
    return json({ uploadId: upload.uploadId });
  }
  const upload = env.FILES.resumeMultipartUpload(key, uploadId);
  if (action === 'part' && req.method === 'PUT') {
    if (Number(req.headers.get('content-length') ?? 0) > PART_SIZE_LIMIT) throw new HttpError(413, 'Upload part is too large.');
    const part = await upload.uploadPart(Number(url.searchParams.get('part')), req.body!);
    return json(part);
  }
  if (action === 'complete' && req.method === 'POST') {
    const { parts } = await req.json<{ parts: R2UploadedPart[] }>();
    const object = await upload.complete(parts);
    if (object.size > rule.maxBytes) { await env.FILES.delete(key); throw new HttpError(413, 'This file is too large.'); }
    return json({ path: p });
  }
  if (action === 'abort' && req.method === 'DELETE') {
    await upload.abort();
    return json({ aborted: true });
  }
  throw new HttpError(400, 'Unknown multipart action.');
}

async function serve(req: Request, env: Env, key: string, cacheControl: string): Promise<Response> {
  const object = await env.FILES.get(key, { range: req.headers, onlyIf: req.headers });
  if (!object) throw new HttpError(404, 'Not found.');
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('etag', object.httpEtag);
  headers.set('accept-ranges', 'bytes');
  headers.set('cache-control', cacheControl);
  if (!('body' in object)) return new Response(null, { status: 304, headers });
  const range = object.range as { offset?: number; length?: number } | undefined;
  if (range && req.headers.has('range')) {
    const offset = range.offset ?? 0;
    const length = range.length ?? object.size - offset;
    headers.set('content-range', `bytes ${offset}-${offset + length - 1}/${object.size}`);
    headers.set('content-length', String(length));
    return new Response(req.method === 'HEAD' ? null : object.body, { status: 206, headers });
  }
  headers.set('content-length', String(object.size));
  return new Response(req.method === 'HEAD' ? null : object.body, { headers });
}

// ---------- access ----------

async function authorize(req: Request, env: Env, bucket: string, op: Op, path: string) {
  const c = await getCaller(req, env);
  if (c.kind === 'service') return;
  if (c.kind === 'anon') throw new HttpError(401, 'Sign in to continue.');
  if (!(await BUCKETS[bucket].can(op, c, path, env))) throw new HttpError(403, 'You do not have access to this file.');
}

function isOwner(c: Caller, path: string) {
  return c.kind === 'user' && path.split('/')[0] === c.id;
}

// ---------- helpers ----------

class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

function requireService(c: Caller) {
  if (c.kind !== 'service') throw new HttpError(403, 'Service access required.');
}

function bucketOrThrow(name: string | null | undefined) {
  if (!name || !(name in BUCKETS)) throw new HttpError(404, 'Unknown bucket.');
  return name;
}

function safePath(path: string) {
  if (!path || path.length > 1024 || path.startsWith('/') || path.split('/').some((s) => s === '' || s === '.' || s === '..')) throw new HttpError(400, 'Invalid file path.');
  return path;
}

function checkType(rule: (typeof BUCKETS)[string], header: string | null) {
  const type = (header ?? '').split(';')[0].trim().toLowerCase();
  if (!rule.mime.includes(type)) throw new HttpError(415, 'This file type is not allowed.');
  return type;
}

function encodePath(path: string) {
  return path.split('/').map(encodeURIComponent).join('/');
}

async function hmac(env: Env, message: string) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(env.SIGNING_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message)));
  return btoa(String.fromCharCode(...sig)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}
