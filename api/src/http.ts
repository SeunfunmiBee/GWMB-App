// Shared request plumbing for /v1 routes: typed app, auth guards, validation and errors.
import { Hono, type Context } from 'hono';
import type { z } from 'zod';
import type { Env } from './env';
import { getCaller, isAdmin } from './identity';

export type AppEnv = { Bindings: Env; Variables: { userId: string; userEmail: string } };
export const router = () => new Hono<AppEnv>();

export class HttpError extends Error {
  constructor(public status: 400 | 401 | 403 | 404 | 409 | 413 | 415 | 429 | 500 | 502 | 503, message: string) {
    super(message);
  }
}

/** Requires a signed-in user and exposes `userId` / `userEmail` on the context. */
export const requireUser = async (c: Context<AppEnv>, next: () => Promise<void>) => {
  const caller = await getCaller(c.req.raw, c.env);
  if (caller.kind !== 'user') throw new HttpError(401, 'Sign in to continue.');
  c.set('userId', caller.id);
  c.set('userEmail', caller.email);
  await next();
};

/** Public route that also recognises a signed-in caller (sets `userId` when present). */
export const optionalUser = async (c: Context<AppEnv>, next: () => Promise<void>) => {
  const caller = await getCaller(c.req.raw, c.env);
  if (caller.kind === 'user') {
    c.set('userId', caller.id);
    c.set('userEmail', caller.email);
  }
  await next();
};

/** Requires an app admin (the old `is_app_admin()` policy check). Use after `requireUser`. */
export const requireAdmin = async (c: Context<AppEnv>, next: () => Promise<void>) => {
  if (!(await isAdmin(c.env, { kind: 'user', id: c.get('userId'), email: c.get('userEmail') }))) throw new HttpError(403, 'Admin access required.');
  await next();
};

/** Parses and validates the JSON body; responds 400 with the first problem. */
export async function body<T extends z.ZodType>(c: Context<AppEnv>, schema: T): Promise<z.infer<T>> {
  const raw = await c.req.json().catch(() => undefined);
  const parsed = schema.safeParse(raw ?? {});
  if (!parsed.success) throw new HttpError(400, parsed.error.issues[0]?.message ?? 'Invalid request.');
  return parsed.data;
}

export function onError(error: Error, c: Context<AppEnv>) {
  if (error instanceof HttpError) return c.json({ error: error.message }, error.status);
  console.error(error);
  return c.json({ error: 'Something went wrong. Please try again.' }, 500);
}

export const nowIso = () => new Date().toISOString();

/** Records an admin action (replaces the Supabase `audit_admin_change` trigger, which skipped non-admins). */
export async function audit(env: Env, actorUserId: string, action: string, targetType: string, targetId: string | null, metadata: Record<string, unknown> = {}) {
  await env.DB.prepare('insert into admin_audit_logs (actor_user_id, action, target_type, target_id, metadata) values (?, ?, ?, ?, ?)')
    .bind(actorUserId, action, targetType, targetId, JSON.stringify(metadata)).run();
}
