import { env, SELF } from 'cloudflare:test';

export const BASE = 'http://api.test';
let counter = 0;

export type TestUser = { id: string; email: string; headers: Record<string, string> };

/** Creates a user with a confirmed email and returns a bearer session for them. */
export async function createUser(options: { email?: string; admin?: boolean; name?: string } = {}): Promise<TestUser> {
  const email = options.email ?? `user${++counter}-${crypto.randomUUID().slice(0, 8)}@example.com`;
  const password = 'test-password-123';
  const signUp = await SELF.fetch(`${BASE}/api/auth/sign-up/email`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password, name: options.name ?? 'Test User' }),
  });
  if (!signUp.ok) throw new Error(`sign-up failed: ${signUp.status} ${await signUp.text()}`);
  await env.DB.prepare('update "user" set emailVerified = 1 where email = ?').bind(email).run();
  const signIn = await SELF.fetch(`${BASE}/api/auth/sign-in/email`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const token = signIn.headers.get('set-auth-token');
  const { user } = (await signIn.json()) as { user: { id: string } };
  if (!token) throw new Error('sign-in returned no token');
  if (options.admin) await env.DB.prepare('insert into app_admins (user_id) values (?)').bind(user.id).run();
  return { id: user.id, email, headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' } };
}

export async function api<T = unknown>(user: TestUser | null, method: string, path: string, payload?: unknown): Promise<{ status: number; body: T }> {
  const res = await SELF.fetch(`${BASE}${path}`, {
    method,
    headers: user ? user.headers : { 'content-type': 'application/json' },
    body: payload === undefined ? undefined : JSON.stringify(payload),
  });
  return { status: res.status, body: (await res.json().catch(() => null)) as T };
}

export async function createRecord(fields: { identifier: string; email: string; chapter?: string | null; status?: string; linkedUserId?: string | null }) {
  const id = crypto.randomUUID();
  await env.DB.prepare('insert into membership_records (id, member_identifier, membership_email, chapter, status, linked_user_id) values (?, ?, ?, ?, ?, ?)')
    .bind(id, fields.identifier, fields.email, fields.chapter ?? null, fields.status ?? 'active', fields.linkedUserId ?? null).run();
  return id;
}

export const membershipOf = (userId: string) =>
  env.DB.prepare('select status, membership_record_id from memberships where user_id = ?').bind(userId).first<{ status: string; membership_record_id: string | null }>();
