// Per-user action limits, ported from `enforce_user_action_rate_limit` (202610300002).
// The count is incremented with a conditional upsert, so concurrent requests cannot exceed the limit.
import type { Env } from './env';
import { HttpError } from './http';

export async function enforceRateLimit(env: Env, userId: string, actionKey: string, maxRequests: number, windowSeconds: number) {
  const windowStart = new Date(Math.floor(Date.now() / (windowSeconds * 1000)) * windowSeconds * 1000).toISOString();
  const row = await env.DB.prepare(
    `insert into user_action_rate_limits (actor_user_id, action_key, window_started_at, request_count, updated_at) values (?1, ?2, ?3, 1, ?4)
     on conflict (actor_user_id, action_key, window_started_at) do update set request_count = request_count + 1, updated_at = ?4
       where user_action_rate_limits.request_count < ?5
     returning request_count`,
  ).bind(userId, actionKey.slice(0, 100), windowStart, new Date().toISOString(), maxRequests).first();
  if (!row) throw new HttpError(429, 'Too many attempts. Please wait and try again.');
}
