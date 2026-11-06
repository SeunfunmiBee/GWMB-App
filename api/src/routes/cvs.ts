// CV records: cv_records RLS (owner, or app admin) and `set_primary_cv` (202610150004).
import { z } from 'zod';
import { decode, decodeAll, encode } from '../db';
import { body, HttpError, nowIso, requireAdmin, requireUser, router } from '../http';
import { isAdmin } from '../identity';

export const cvs = router();
cvs.use('*', requireUser);

cvs.get('/', async (c) => {
  const { results } = await c.env.DB.prepare('select * from cv_records where user_id = ? order by updated_at desc').bind(c.get('userId')).all();
  return c.json(decodeAll('cv_records', results));
});

const cvInput = z.object({
  id: z.string().max(64).optional(),
  source: z.enum(['built', 'uploaded']),
  name: z.string().trim().min(1).max(200),
  target_role: z.string().max(200).nullable(),
  opportunity_type: z.string().max(100).nullable(),
  template: z.enum(['classic', 'modern']),
  structured_data: z.record(z.string(), z.unknown()),
  analysis: z.record(z.string(), z.unknown()),
  status: z.enum(['draft', 'ready', 'reviewed']),
  original_file_name: z.string().max(260).nullable(),
  original_file_path: z.string().max(1024).nullable(),
  extracted_text: z.string().max(200_000).nullable(),
  last_reviewed_at: z.string().nullable().optional(),
});

/** Files must live in the caller's own folder of the private-cvs bucket. */
function ownPath(userId: string, path: string | null | undefined) {
  if (path && !path.startsWith(`${userId}/`)) throw new HttpError(400, 'The uploaded document does not belong to this account');
}

cvs.put('/', async (c) => {
  const input = await body(c, cvInput);
  const userId = c.get('userId');
  ownPath(userId, input.original_file_path);
  const { id, ...fields } = input;
  const data = encode('cv_records', { ...fields, updated_at: nowIso() });
  const cols = Object.keys(data);
  if (id) {
    const row = await c.env.DB.prepare(`update cv_records set ${cols.map((col) => `${col} = ?`).join(', ')} where id = ? and user_id = ? returning *`)
      .bind(...cols.map((col) => data[col]), id, userId).first();
    if (!row) throw new HttpError(404, 'This CV no longer exists.');
    return c.json(decode('cv_records', row));
  }
  const row = await c.env.DB.prepare(`insert into cv_records (user_id, ${cols.join(', ')}) values (?, ${cols.map(() => '?').join(', ')}) returning *`)
    .bind(userId, ...cols.map((col) => data[col])).first();
  return c.json(decode('cv_records', row), 201);
});

cvs.post('/:id/primary', async (c) => {
  const userId = c.get('userId');
  const id = c.req.param('id');
  const [, updated] = await c.env.DB.batch([
    c.env.DB.prepare('update cv_records set is_primary = 0 where user_id = ? and id <> ?').bind(userId, id),
    c.env.DB.prepare('update cv_records set is_primary = 1, updated_at = ? where id = ? and user_id = ?').bind(nowIso(), id, userId),
  ]);
  if (!updated.meta.changes) throw new HttpError(404, 'This CV no longer exists.');
  return c.json({ ok: true });
});

cvs.patch('/:id/generated-file', async (c) => {
  const { path } = await body(c, z.object({ path: z.string().max(1024) }));
  const userId = c.get('userId');
  ownPath(userId, path);
  const row = await c.env.DB.prepare('update cv_records set generated_file_path = ?, updated_at = ? where id = ? and user_id = ? returning id').bind(path, nowIso(), c.req.param('id'), userId).first();
  if (!row) throw new HttpError(404, 'This CV no longer exists.');
  return c.json({ ok: true });
});

/** File paths for one CV, for the owner or an admin reviewing it. */
cvs.get('/:id/files', async (c) => {
  const row = await c.env.DB.prepare('select user_id, original_file_path, generated_file_path from cv_records where id = ?').bind(c.req.param('id'))
    .first<{ user_id: string; original_file_path: string | null; generated_file_path: string | null }>();
  if (!row || (row.user_id !== c.get('userId') && !(await isAdmin(c.env, { kind: 'user', id: c.get('userId'), email: '' })))) return c.json(null);
  return c.json({ original_file_path: row.original_file_path, generated_file_path: row.generated_file_path });
});

export const adminCvs = router();
adminCvs.use('*', requireUser, requireAdmin);

adminCvs.get('/', async (c) => {
  const offset = Math.max(0, Number(c.req.query('offset') ?? 0) || 0);
  const limit = Math.min(100, Math.max(1, Number(c.req.query('limit') ?? 25) || 25));
  const [rows, count] = await c.env.DB.batch([
    c.env.DB.prepare('select * from cv_records order by updated_at desc limit ? offset ?').bind(limit, offset),
    c.env.DB.prepare('select count(*) as total from cv_records'),
  ]);
  return c.json({ items: decodeAll('cv_records', rows.results as Record<string, unknown>[]), total: (count.results[0] as { total: number }).total });
});
