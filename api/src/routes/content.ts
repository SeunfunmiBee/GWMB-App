// Content items (courses, events, resources, spotlights...).
// Public reads port the content_items SELECT policies; admin writes port the `is_app_admin()` ALL policy,
// `validate_content_publication` (src/content-rules.ts) and `log_content_change` (content_audit_log).
// Notification side effects are SQLite triggers in 0005_notification_triggers.sql.
import { z } from 'zod';
import { validatePublication } from '../content-rules';
import { decode, decodeAll, encode, insertRow, updateRow } from '../db';
import { body, HttpError, nowIso, optionalUser, requireAdmin, requireUser, router } from '../http';
import { publicContent, readableLevels } from '../access';
import type { Env } from '../env';

type ContentRow = Record<string, unknown> & { id: string; status: string; content_type: string; title: string; metadata: Record<string, unknown> };

// ---------- public ----------

export const content = router();
content.use('*', optionalUser);

content.get('/', async (c) => {
  const area = c.req.query('area');
  if (!area) throw new HttpError(400, 'Choose a content area.');
  const levels = await readableLevels(c.env, c.get('userId'));
  const { results } = await c.env.DB.prepare(
    `select * from content_items where area = ? and status = 'published' and visible = 1
       and (publish_at is null or publish_at <= ?) and access_level in (${levels.map(() => '?').join(', ')})
     order by sort_order`,
  ).bind(area, nowIso(), ...levels).all();
  return c.json(decodeAll<{ metadata: unknown }>('content_items', results).map(publicContent));
});

// ---------- admin ----------

export const adminContent = router();
adminContent.use('*', requireUser, requireAdmin);

adminContent.get('/', async (c) => {
  const area = c.req.query('area');
  const stmt = area
    ? c.env.DB.prepare('select * from content_items where area = ? order by sort_order, updated_at desc').bind(area)
    : c.env.DB.prepare('select * from content_items order by sort_order, updated_at desc');
  return c.json(decodeAll('content_items', (await stmt.all()).results));
});

adminContent.get('/:id', async (c) => {
  return c.json(decode('content_items', await c.env.DB.prepare('select * from content_items where id = ?').bind(c.req.param('id')).first()));
});

const contentInput = z.object({
  slug: z.string().trim().min(1, 'Add a slug.').max(160),
  area: z.string().trim().min(1).max(60),
  content_type: z.string().trim().min(1).max(60),
  title: z.string().trim().min(1, 'Add a title.').max(300),
  eyebrow: z.string().max(160).nullable().optional(),
  summary: z.string().max(4000).nullable().optional(),
  body: z.string().max(100_000).nullable().optional(),
  image_url: z.string().max(2048).nullable().optional(),
  route: z.string().max(500).nullable().optional(),
  access_level: z.enum(['open', 'account', 'members', 'admin']),
  status: z.enum(['draft', 'scheduled', 'published', 'archived']),
  featured: z.boolean().optional(),
  visible: z.boolean().optional(),
  sort_order: z.number().int().optional(),
  publish_at: z.string().nullable().optional(),
  starts_at: z.string().nullable().optional(),
  ends_at: z.string().nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

async function logChange(env: Env, contentId: string, action: string, actorId: string, snapshot: unknown) {
  await env.DB.prepare('insert into content_audit_log (content_id, action, actor_id, snapshot) values (?, ?, ?, ?)')
    .bind(contentId, action, actorId, JSON.stringify(snapshot)).run();
}

function checkPublication(item: z.infer<typeof contentInput> | ContentRow) {
  const problem = validatePublication({ ...item, metadata: item.metadata ?? {} } as Parameters<typeof validatePublication>[0]);
  if (problem) throw new HttpError(400, problem);
}

function saveError(error: unknown): never {
  if (error instanceof Error && error.message.includes('UNIQUE') && error.message.includes('slug')) throw new HttpError(409, 'Another item already uses this slug.');
  throw error;
}

adminContent.post('/', async (c) => {
  const input = await body(c, contentInput);
  checkPublication(input);
  const userId = c.get('userId');
  const row = await insertRow<ContentRow>(c.env.DB, 'content_items', { ...input, metadata: input.metadata ?? {}, created_by: userId, updated_by: userId }).catch(saveError);
  await logChange(c.env, row.id, 'insert', userId, row);
  return c.json(row, 201);
});

adminContent.put('/:id', async (c) => {
  const input = await body(c, contentInput.partial());
  const id = c.req.param('id');
  const current = decode<ContentRow>('content_items', await c.env.DB.prepare('select * from content_items where id = ?').bind(id).first());
  if (!current) throw new HttpError(404, 'This content item no longer exists.');
  checkPublication({ ...current, ...input } as ContentRow);
  const userId = c.get('userId');
  const row = await updateRow<ContentRow>(c.env.DB, 'content_items', 'id', id, { ...input, updated_by: userId, updated_at: nowIso() }).catch(saveError);
  await logChange(c.env, id, 'update', userId, row);
  return c.json(row);
});

adminContent.post('/:id/archive', async (c) => {
  const id = c.req.param('id');
  const row = await updateRow(c.env.DB, 'content_items', 'id', id, { status: 'archived', updated_by: c.get('userId'), updated_at: nowIso() });
  if (!row) throw new HttpError(404, 'This content item no longer exists.');
  await logChange(c.env, id, 'update', c.get('userId'), row);
  return c.json(row);
});

// Advanced programme offer for a course (admin only: advanced_program_offers ALL policy).
adminContent.get('/:id/advanced-offer', async (c) => {
  const row = await c.env.DB.prepare('select benefit_code, max_claims, active from advanced_program_offers where content_id = ?').bind(c.req.param('id')).first();
  return c.json(decode('advanced_program_offers', row));
});

adminContent.put('/:id/advanced-offer', async (c) => {
  const input = await body(c, z.object({
    benefit_code: z.string().trim().max(120).nullable(),
    max_claims: z.number().int().positive('Maximum claims must be above zero.').nullable(),
    active: z.boolean(),
  }));
  const data = encode('advanced_program_offers', { ...input, benefit_code: input.benefit_code || null });
  const row = await c.env.DB.prepare(
    `insert into advanced_program_offers (content_id, benefit_code, max_claims, active, updated_by) values (?, ?, ?, ?, ?)
     on conflict (content_id) do update set benefit_code = excluded.benefit_code, max_claims = excluded.max_claims,
       active = excluded.active, updated_by = excluded.updated_by, updated_at = ? returning *`,
  ).bind(c.req.param('id'), data.benefit_code, data.max_claims, data.active, c.get('userId'), nowIso()).first();
  return c.json(decode('advanced_program_offers', row));
});
