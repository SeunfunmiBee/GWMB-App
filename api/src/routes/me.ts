// The signed-in user's own account. Ports the reads AuthProvider made against Supabase
// (profiles/memberships RLS: owner only), plus `is_app_admin`, `get_my_chapter_admin_access`
// and `deactivate_my_push_devices`.
import { Hono } from 'hono';
import type { Env } from '../env';
import { getCaller, isAdmin } from '../identity';

type Vars = { userId: string };
export const me = new Hono<{ Bindings: Env; Variables: Vars }>();

me.use('*', async (c, next) => {
  const caller = await getCaller(c.req.raw, c.env);
  if (caller.kind !== 'user') return c.json({ error: 'Sign in to continue.' }, 401);
  c.set('userId', caller.id);
  await next();
});

me.get('/', async (c) => {
  const id = c.get('userId');
  const admin = await isAdmin(c.env, { kind: 'user', id, email: '' });
  const [profile, membership, chapters] = await c.env.DB.batch([
    c.env.DB.prepare('select * from profiles where id = ?').bind(id),
    c.env.DB.prepare('select * from memberships where user_id = ?').bind(id),
    c.env.DB.prepare(
      `select c.id as chapter_id, c.name as chapter_name, c.kind as chapter_kind from chapters c
       where c.active = 1 and (? = 1 or exists (select 1 from chapter_admins ca where ca.chapter_id = c.id and ca.user_id = ? and ca.active = 1))
       order by c.name`,
    ).bind(admin ? 1 : 0, id),
  ]);
  return c.json({
    profile: profile.results[0] ?? null,
    membership: membership.results[0] ?? null,
    isAdmin: admin,
    chapterAdminAccess: chapters.results,
  });
});

me.post('/push-devices/deactivate', async (c) => {
  await c.env.DB.prepare('update push_devices set active = 0 where user_id = ?').bind(c.get('userId')).run();
  return c.json({ ok: true });
});
