// The signed-in user's own account. Ports the reads AuthProvider made against Supabase
// (profiles/memberships RLS: owner only), `is_app_admin`, `get_my_chapter_admin_access`,
// `deactivate_my_push_devices`, and the owner-only profile update.
import { z } from 'zod';
import { isAdmin } from '../identity';
import { body, requireUser, router } from '../http';

export const me = router();
me.use('*', requireUser);

me.get('/', async (c) => {
  const id = c.get('userId');
  const admin = await isAdmin(c.env, { kind: 'user', id, email: c.get('userEmail') });
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

// Owners may change only these columns (the old column-level grant on profiles).
const profileInput = z.object({
  full_name: z.string().trim().min(2, 'Enter your full name.').max(160).optional(),
  city_club: z.string().trim().max(160).nullable().optional(),
  avatar_url: z.string().trim().url('Avatar must be a link.').max(2048).nullable().optional(),
});

me.patch('/profile', async (c) => {
  const input = await body(c, profileInput);
  const entries = Object.entries(input).filter(([, value]) => value !== undefined);
  if (!entries.length) return c.json(await c.env.DB.prepare('select * from profiles where id = ?').bind(c.get('userId')).first());
  const row = await c.env.DB.prepare(`update profiles set ${entries.map(([key]) => `${key} = ?`).join(', ')} where id = ? returning *`)
    .bind(...entries.map(([, value]) => value ?? null), c.get('userId')).first();
  return c.json(row);
});

me.post('/push-devices/deactivate', async (c) => {
  await c.env.DB.prepare('update push_devices set active = 0 where user_id = ?').bind(c.get('userId')).run();
  return c.json({ ok: true });
});
