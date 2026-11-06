// Calendar feeds: `get_my_calendar_feed` and `get_admin_calendar_feed` (202610210004).
import { publicMetadata, readableLevels } from '../access';
import { isoTime } from '../db';
import { requireAdmin, requireUser, router } from '../http';
import type { Env } from '../env';

type Json = Record<string, unknown>;
type FeedItem = {
  source_type: string; source_id: string; title: string; starts_at: string | null; ends_at: string | null; status: string;
  category: string; access_level: string; location: string; route: string; relevance: 'saved' | 'chapter' | 'recommended' | 'operations'; metadata: Json;
};

const DAY = 86_400_000;
const parse = (text: unknown): Json => { try { const v = JSON.parse(String(text ?? '{}')); return v && typeof v === 'object' ? v : {}; } catch { return {}; } };
const list = (text: unknown): string[] => { const v = (() => { try { return JSON.parse(String(text ?? '[]')); } catch { return []; } })(); return Array.isArray(v) ? v.map(String) : []; };

function range(c: { req: { query: (k: string) => string | undefined } }, backDays: number, aheadDays: number) {
  const from = c.req.query('from') ? isoTime(c.req.query('from'), 'from date') : new Date(Date.now() - backDays * DAY).toISOString();
  const to = c.req.query('to') ? isoTime(c.req.query('to'), 'to date') : new Date(Date.now() + aheadDays * DAY).toISOString();
  return { from, to };
}

export const calendar = router();
calendar.use('*', requireUser);

calendar.get('/', async (c) => {
  const { from, to } = range(c, 7, 180);
  return c.json(await personalFeed(c.env, c.get('userId'), from, to));
});

async function personalFeed(env: Env, userId: string, from: string, to: string): Promise<FeedItem[]> {
  const db = env.DB;
  const levels = await readableLevels(env, userId);
  const inLevels = (column: string) => `${column} in (${levels.map(() => '?').join(', ')})`;
  const now = new Date().toISOString();
  const [journey, saved, orphaned, content, mentorSaved, mentorOpen, interests, local] = await db.batch([
    db.prepare('select interests, primary_goal from marketplace_journeys where user_id = ?').bind(userId),
    db.prepare(`select c.*, r.status as registration_status from event_registrations r join content_items c on c.slug = r.event_id or c.id = r.event_id
                where r.user_id = ? and r.status <> 'cancelled' and c.starts_at between ? and ?`).bind(userId, from, to),
    db.prepare(`select * from event_registrations r where r.user_id = ? and r.status <> 'cancelled' and r.event_starts_at between ? and ?
                and not exists (select 1 from content_items c where c.slug = r.event_id or c.id = r.event_id)`).bind(userId, from, to),
    db.prepare(`select * from content_items c where c.status = 'published' and c.visible = 1 and c.starts_at between ? and ?
                and (c.publish_at is null or c.publish_at <= ?) and ${inLevels('c.access_level')}
                and c.content_type in ('event', 'webinar', 'live_session', 'course')
                and not exists (select 1 from event_registrations r where r.user_id = ? and r.status <> 'cancelled' and (r.event_id = c.slug or r.event_id = c.id))`).bind(from, to, now, ...levels, userId),
    db.prepare(`select m.*, r.status as registration_status from mentorship_registrations r join mentorship_sessions m on m.id = r.session_id
                where r.user_id = ? and r.status <> 'cancelled' and m.starts_at between ? and ?`).bind(userId, from, to),
    db.prepare(`select * from mentorship_sessions m where m.status in ('published', 'upcoming', 'live') and m.starts_at between ? and ?
                and ${inLevels('m.access_level')}
                and not exists (select 1 from mentorship_registrations r where r.user_id = ? and r.session_id = m.id and r.status <> 'cancelled')`).bind(from, to, ...levels, userId),
    db.prepare('select industry from mentorship_industry_interests where user_id = ? and notifications_enabled = 1').bind(userId),
    db.prepare(`select a.*, ch.name as chapter_name, ch.kind as chapter_kind from local_activities a join chapters ch on ch.id = a.chapter_id
                where a.status = 'published' and a.starts_at between ? and ?
                and exists (select 1 from membership_records r where r.linked_user_id = ? and lower(trim(r.chapter)) = lower(trim(ch.name)))`).bind(from, to, userId),
  ]);
  const j = journey.results[0] as Json | undefined;
  const wanted = list(j?.interests).map((i) => i.toLowerCase());
  const followed = (interests.results as Json[]).map((i) => String(i.industry).toLowerCase());
  const matches = (text: string, terms: string[]) => terms.some((t) => t && text.toLowerCase().includes(t));
  const items: FeedItem[] = [];
  const contentItem = (row: Json, relevance: FeedItem['relevance'], extra: Json): FeedItem => {
    const meta = publicMetadata(parse(row.metadata));
    const course = row.area === 'courses' || row.content_type === 'course';
    return {
      source_type: relevance === 'saved' || !course ? 'content_event' : 'content_course', source_id: String(row.id), title: String(row.title),
      starts_at: row.starts_at as string | null, ends_at: row.ends_at as string | null, status: String(row.status), category: String(row.area),
      access_level: String(row.access_level), location: String(meta.location ?? 'Online'), route: String(row.route ?? `/event/${row.slug}`),
      relevance, metadata: { ...meta, ...extra },
    };
  };
  for (const row of saved.results as Json[]) items.push(contentItem(row, 'saved', { registration_status: row.registration_status }));
  for (const r of orphaned.results as Json[]) {
    items.push({ source_type: 'content_event', source_id: String(r.event_id), title: String(r.event_title ?? 'GWMB event'), starts_at: r.event_starts_at as string | null,
      ends_at: null, status: 'published', category: 'events', access_level: 'account', location: 'Online', route: String(r.event_route ?? `/event/${r.event_id}`),
      relevance: 'saved', metadata: { registration_status: r.status } });
  }
  for (const row of content.results as Json[]) {
    const careerAreas = parse(row.metadata).career_areas;
    const relevant = row.featured === 1 || !Array.isArray(careerAreas) || careerAreas.length === 0
      || matches(`${row.title} ${row.summary ?? ''} ${row.metadata ?? ''}`, wanted);
    if (relevant) items.push(contentItem(row, 'recommended', { goal: j?.primary_goal ?? null }));
  }
  const session = (m: Json, relevance: FeedItem['relevance'], extra: Json): FeedItem => ({
    source_type: 'mentorship', source_id: String(m.id), title: String(m.title), starts_at: m.starts_at as string | null, ends_at: null, status: String(m.status),
    category: 'mentorship', access_level: String(m.access_level), location: String(m.timezone ?? 'Africa/Lagos'), route: `/mentorship-session/${m.id}`, relevance,
    metadata: { industry: m.industry, mentorship_type: m.mentorship_type, ...extra },
  });
  for (const m of mentorSaved.results as Json[]) items.push(session(m, 'saved', { registration_status: m.registration_status }));
  for (const m of mentorOpen.results as Json[]) {
    const field = `${m.industry} ${m.subfield ?? ''}`;
    if (m.mentorship_type === 'discovery' || matches(field, wanted) || matches(field, followed)) items.push(session(m, 'recommended', {}));
  }
  for (const a of local.results as Json[]) {
    items.push({ source_type: `local_${a.kind}`, source_id: String(a.id), title: String(a.title), starts_at: a.starts_at as string | null, ends_at: a.ends_at as string | null,
      status: String(a.status), category: String(a.kind), access_level: a.members_only ? 'members' : 'open', location: String(a.venue ?? a.chapter_name), route: '/events',
      relevance: 'chapter', metadata: { chapter_name: a.chapter_name, chapter_kind: a.chapter_kind } });
  }
  // One entry per source: saved beats chapter beats recommended (the SQL used DISTINCT ON).
  const rank = { saved: 1, chapter: 2, recommended: 3, operations: 4 };
  const best = new Map<string, FeedItem>();
  for (const item of items) {
    const key = `${item.source_type}:${item.source_id}`;
    const current = best.get(key);
    if (!current || rank[item.relevance] < rank[current.relevance]) best.set(key, item);
  }
  return [...best.values()].sort((a, b) => (a.source_type + a.source_id).localeCompare(b.source_type + b.source_id));
}

export const adminCalendar = router();
adminCalendar.use('*', requireUser, requireAdmin);

adminCalendar.get('/', async (c) => {
  const { from, to } = range(c, 30, 365);
  const db = c.env.DB;
  const [content, sessions, local] = await db.batch([
    db.prepare("select * from content_items where starts_at between ? and ? and status <> 'archived'").bind(from, to),
    db.prepare("select * from mentorship_sessions where starts_at between ? and ? and status <> 'cancelled'").bind(from, to),
    db.prepare(`select a.*, ch.name as chapter_name, ch.kind as chapter_kind from local_activities a join chapters ch on ch.id = a.chapter_id
                where a.starts_at between ? and ? and a.status <> 'cancelled'`).bind(from, to),
  ]);
  const items: FeedItem[] = [
    ...(content.results as Json[]).map((row): FeedItem => {
      const meta = parse(row.metadata);
      const type = row.area === 'courses' || row.content_type === 'course' ? 'content_course'
        : row.area === 'events' || ['event', 'webinar', 'live_session'].includes(String(row.content_type)) ? 'content_event' : 'content_other';
      return { source_type: type, source_id: String(row.id), title: String(row.title), starts_at: row.starts_at as string, ends_at: row.ends_at as string | null,
        status: String(row.status), category: String(row.area), access_level: String(row.access_level), location: String(meta.location ?? 'Online'),
        route: String(row.route ?? `/admin/builder?type=event&id=${row.id}`), relevance: 'operations', metadata: meta };
    }),
    ...(sessions.results as Json[]).map((m): FeedItem => ({ source_type: 'mentorship', source_id: String(m.id), title: String(m.title), starts_at: m.starts_at as string,
      ends_at: null, status: String(m.status), category: 'mentorship', access_level: String(m.access_level), location: String(m.timezone ?? 'Africa/Lagos'),
      route: `/mentorship-session/${m.id}`, relevance: 'operations', metadata: { industry: m.industry, mentorship_type: m.mentorship_type, subfield: m.subfield } })),
    ...(local.results as Json[]).map((a): FeedItem => ({ source_type: `local_${a.kind}`, source_id: String(a.id), title: String(a.title), starts_at: a.starts_at as string,
      ends_at: a.ends_at as string | null, status: String(a.status), category: String(a.kind), access_level: a.members_only ? 'members' : 'open',
      location: String(a.venue ?? a.chapter_name), route: '/chapter-admin', relevance: 'operations',
      metadata: { chapter_id: a.chapter_id, chapter_name: a.chapter_name, chapter_kind: a.chapter_kind } })),
  ];
  return c.json(items.sort((a, b) => String(a.starts_at).localeCompare(String(b.starts_at))));
});
