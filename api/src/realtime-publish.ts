// After a successful write, tell connected clients which views changed (see src/live.ts).
// Writes that notify many users (publishing, broadcasts, admin decisions) are broadcast; a member's own
// actions are sent only to that member's devices.
import type { Context } from 'hono';
import type { AppEnv } from './http';
import { publish } from './live';

type Rule = { prefix: string; broadcast?: string[]; self?: string[] };

const RULES: Rule[] = [
  { prefix: '/v1/admin/content', broadcast: ['content', 'calendar', 'marketplace', 'notifications'] },
  { prefix: '/v1/admin/mentorship', broadcast: ['calendar', 'marketplace', 'notifications'] },
  { prefix: '/v1/admin/chapter-admins', broadcast: ['calendar'] },
  { prefix: '/v1/chapters', broadcast: ['calendar', 'notifications'] },
  { prefix: '/v1/admin/notifications', broadcast: ['notifications'] },
  { prefix: '/v1/admin/', broadcast: ['notifications'] }, // other admin decisions notify the member involved
  { prefix: '/v1/events', self: ['calendar', 'notifications'] },
  { prefix: '/v1/mentorship', self: ['calendar', 'notifications'] },
  { prefix: '/v1/opportunities', self: ['notifications'] },
  { prefix: '/v1/career', self: ['notifications'] },
  { prefix: '/v1/notifications', self: ['notifications'] },
  { prefix: '/v1/community', self: ['calendar'] },
];

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export async function publishChanges(c: Context<AppEnv>, next: () => Promise<void>) {
  await next();
  if (!MUTATING.has(c.req.method) || c.res.status >= 400) return;
  const rule = RULES.find((r) => c.req.path.startsWith(r.prefix));
  if (!rule) return;
  const userId = c.get('userId');
  const work = publish(c.env, {
    broadcast: rule.broadcast,
    users: rule.self && userId ? { ids: [userId], topics: rule.self } : undefined,
  });
  try { c.executionCtx.waitUntil(work); } catch { await work; }
}
