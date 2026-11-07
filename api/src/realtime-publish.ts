// After a successful write, tell connected clients which views changed (see src/live.ts).
// Writes that notify many users (publishing, broadcasts, admin decisions) are broadcast; a member's own
// actions are sent only to that member's devices.
import type { Context } from 'hono';
import type { AppEnv } from './http';
import { publish } from './live';

type Rule = { prefix: string; broadcast?: string[]; self?: string[] };

// First matching prefix wins, so specific admin routes come before the `/v1/admin/` catch-all.
// `admin` reaches the admin consoles (new requests, applications, errors); members never receive it.
const RULES: Rule[] = [
  { prefix: '/v1/admin/content', broadcast: ['content', 'calendar', 'marketplace', 'notifications'] },
  { prefix: '/v1/admin/mentorship', broadcast: ['calendar', 'marketplace', 'notifications', 'admin'] },
  { prefix: '/v1/admin/chapter-admins', broadcast: ['calendar', 'admin'] },
  { prefix: '/v1/admin/notifications', broadcast: ['notifications', 'admin'] },
  { prefix: '/v1/admin/operations/flags', broadcast: ['flags', 'admin'] },
  { prefix: '/v1/admin/', broadcast: ['notifications', 'admin'] }, // other admin decisions notify the member involved
  { prefix: '/v1/chapters', broadcast: ['calendar', 'notifications'] },
  { prefix: '/v1/events', self: ['calendar', 'notifications'] },
  { prefix: '/v1/mentorship', broadcast: ['admin'], self: ['calendar', 'notifications'] },
  { prefix: '/v1/opportunities', broadcast: ['admin'], self: ['notifications'] },
  { prefix: '/v1/career', broadcast: ['admin'], self: ['notifications'] },
  { prefix: '/v1/membership', broadcast: ['admin'] },
  { prefix: '/v1/account', broadcast: ['admin'] },
  { prefix: '/v1/errors', broadcast: ['admin'] },
  { prefix: '/v1/notifications', self: ['notifications'] },
  { prefix: '/v1/community', broadcast: ['admin'], self: ['calendar'] },
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
