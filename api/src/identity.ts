import { createAuth } from './auth';
import type { Env } from './env';

export type Caller = { kind: 'service' } | { kind: 'user'; id: string; email: string } | { kind: 'anon' };

// Who is calling: a script/job holding ADMIN_SECRET, a signed-in user (cookie or bearer), or nobody.
export async function getCaller(req: Request, env: Env): Promise<Caller> {
  const adminSecret = req.headers.get('x-admin-secret');
  if (adminSecret && timingSafeEqual(adminSecret, env.ADMIN_SECRET)) return { kind: 'service' };
  const session = await createAuth(env).api.getSession({ headers: req.headers });
  return session ? { kind: 'user', id: session.user.id, email: session.user.email } : { kind: 'anon' };
}

export async function isAdmin(env: Env, c: Caller) {
  if (c.kind === 'service') return true;
  if (c.kind !== 'user') return false;
  return Boolean(await env.DB.prepare('select 1 from app_admins where user_id = ?').bind(c.id).first());
}

export async function isVerifiedMember(env: Env, c: Caller) {
  if (c.kind !== 'user') return false;
  return Boolean(await env.DB.prepare("select 1 from memberships where user_id = ? and status = 'verified'").bind(c.id).first());
}

export function timingSafeEqual(a: string, b: string) {
  const x = new TextEncoder().encode(a);
  const y = new TextEncoder().encode(b);
  return x.length === y.length && crypto.subtle.timingSafeEqual(x, y);
}
