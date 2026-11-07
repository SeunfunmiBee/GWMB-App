// Mentor applications and availability updates from external forms or the admin spreadsheet import
// (port of the `mentor-intake` Edge Function). Callers send `x-mentor-webhook-secret` or an admin session.
import type { Context } from 'hono';
import { decode, encode } from '../db';
import { type AppEnv, HttpError, nowIso, router } from '../http';
import { getCaller, isAdmin, timingSafeEqual } from '../identity';

type Payload = Record<string, unknown>;

const MAX_BODY_BYTES = 256 * 1024; // the raw submission is stored for reference

export const mentorIntake = router();

mentorIntake.post('/', async (c) => {
  if (!(await authorised(c))) throw new HttpError(401, 'Valid webhook secret or Admin session required.');
  if (Number(c.req.header('content-length') ?? 0) > MAX_BODY_BYTES) throw new HttpError(413, 'This submission is too large.');
  const raw = (await c.req.json().catch(() => null)) as Payload | null;
  if (!raw || typeof raw !== 'object') throw new HttpError(400, 'Valid JSON is required.');
  const payload = (raw.data && typeof raw.data === 'object' ? raw.data : raw) as Payload;
  const formType = String(raw.form_type ?? payload.form_type ?? 'mentor_application').toLowerCase().slice(0, 60);
  const isAvailability = formType.includes('availability');
  const source = String(raw.source ?? payload.source ?? 'external_form').slice(0, 60);
  const email = str(payload, ['email', 'email_address', 'mentor_email']).trim().toLowerCase();
  if (!email || !email.includes('@') || email.length > 254) throw new HttpError(400, 'A valid mentor email is required.');

  const db = c.env.DB;
  const existing = decode<Payload>('mentor_operations', await db.prepare('select * from mentor_operations where lower(email) = ?').bind(email).first());
  if (isAvailability && !existing) throw new HttpError(404, 'No mentor record matches this email. Submit the mentor application first.');
  const name = str(payload, ['full_name', 'name']);
  const mentorId = (existing?.mentor_id as string | undefined) ?? (await uniqueMentorId(db, name || email.split('@')[0]));

  const types = list(payload, ['mentorship_types', 'mentorship_type', 'types']).map(normalizeType).filter(Boolean);
  for (const [key, type] of [[['discovery_available'], 'discovery'], [['industry_available'], 'industry'], [['one_on_one_available', '1_1_available'], 'one_on_one']] as const) {
    if (bool(payload, [...key], false) && !types.includes(type)) types.push(type);
  }
  const availableDates = list(payload, ['available_dates', 'availability_dates', 'open_dates']);
  const confirmedUntil = date(payload, ['availability_confirmed_until', 'confirmed_until']);
  const due = (confirmedUntil ?? new Date(Date.now() + 90 * 86400_000).toISOString()).slice(0, 10);
  const prev = <T>(key: string, fallback: T) => (existing?.[key] ?? fallback) as T;

  if (!isAvailability) {
    if (!name) throw new HttpError(400, 'Full name is required for a mentor application.');
    await upsert(db, 'mentors', 'id', {
      id: mentorId, full_name: name, photo_url: str(payload, ['headshot', 'photo_url', 'photo']) || null,
      job_title: str(payload, ['current_role', 'role', 'job_title']) || 'Mentor', organisation: str(payload, ['organisation', 'organization', 'company']) || 'Independent',
      bio: str(payload, ['short_bio', 'bio']) || 'Mentor profile awaiting Admin review.', industry: str(payload, ['primary_career_field', 'primary_field', 'industry']) || 'General',
      subfields: list(payload, ['sub_fields', 'subfields', 'specific_fields']), expertise: list(payload, ['areas_of_expertise', 'expertise']),
      guidance_topics: list(payload, ['mentoring_topics', 'topics', 'guidance_topics']), mentorship_types: types.length ? types : ['discovery'],
      active: false, publish_public_profile: false,
    });
  }

  const days = list(payload, ['preferred_days', 'days']);
  const times = list(payload, ['preferred_times', 'times']);
  const operation = {
    mentor_id: mentorId, email,
    phone: str(payload, ['phone', 'phone_number']) || prev('phone', null), linkedin_url: str(payload, ['linkedin_url', 'linkedin']) || prev('linkedin_url', null),
    source, external_identifier: str(payload, ['external_identifier', 'submission_id', 'entry_id']) || null,
    availability_status: bool(payload, ['currently_available', 'available_now'], prev<string>('availability_status', 'active') !== 'unavailable') ? 'active' : 'unavailable',
    preferred_frequency: str(payload, ['preferred_frequency', 'frequency']) || prev('preferred_frequency', null),
    preferred_days: days.length ? days : prev('preferred_days', []), preferred_times: times.length ? times : prev('preferred_times', []),
    general_availability: str(payload, ['general_availability', 'availability']) || prev('general_availability', null),
    next_available_period: str(payload, ['next_available_period', 'next_available_date']) || prev('next_available_period', null),
    discovery_available: bool(payload, ['discovery_available'], prev('discovery_available', types.includes('discovery'))),
    industry_available: bool(payload, ['industry_available'], prev('industry_available', types.includes('industry'))),
    one_on_one_available: bool(payload, ['one_on_one_available', '1_1_available'], prev('one_on_one_available', types.includes('one_on_one'))),
    one_on_one_capacity: num(payload, ['one_on_one_capacity', '1_1_capacity', 'session_capacity']) ?? prev('one_on_one_capacity', 0),
    private_booking_url: str(payload, ['booking_link', 'booking_url']) || prev<string | null>('private_booking_url', null),
    available_dates: availableDates.length ? availableDates : prev('available_dates', []),
    recording_consent: bool(payload, ['recording_consent', 'consent_to_record'], prev('recording_consent', false)),
    limitations: str(payload, ['limitations', 'notes']) || prev('limitations', null), intake_payload: payload,
    availability_last_confirmed_at: isAvailability ? nowIso() : prev('availability_last_confirmed_at', null),
    availability_confirmed_until: confirmedUntil ?? prev('availability_confirmed_until', null),
    availability_confirmation_due: confirmedUntil ? due : prev('availability_confirmation_due', due),
    submitted_at: date(payload, ['submission_date', 'submitted_at']) ?? nowIso(),
  };
  await upsert(db, 'mentor_operations', 'mentor_id', operation);
  if (operation.private_booking_url) {
    await db.prepare('insert into mentorship_booking_links (mentor_id, booking_url) values (?, ?) on conflict (mentor_id) do update set booking_url = excluded.booking_url, updated_at = ?')
      .bind(mentorId, operation.private_booking_url, nowIso()).run();
  }
  if (isAvailability) {
    const sub = encode('mentor_availability_submissions', {
      mentor_id: mentorId, source, preferred_days: operation.preferred_days, preferred_times: operation.preferred_times, general_availability: operation.general_availability,
      available_dates: availableDates, discovery_available: operation.discovery_available, industry_available: operation.industry_available,
      one_on_one_available: operation.one_on_one_available, one_on_one_capacity: operation.one_on_one_capacity, confirmed_until: confirmedUntil, raw_payload: payload,
    });
    const cols = Object.keys(sub);
    await db.prepare(`insert into mentor_availability_submissions (${cols.join(', ')}) values (${cols.map(() => '?').join(', ')})`).bind(...cols.map((k) => sub[k])).run();
  }
  await db.prepare(
    `insert into mentorship_operations_tasks (dedupe_key, mentor_id, kind, title, detail, priority, status) values (?, ?, ?, ?, ?, 'normal', 'open')
     on conflict (dedupe_key) do update set kind = excluded.kind, title = excluded.title, detail = excluded.detail, status = 'open'`,
  ).bind(`mentor:${mentorId}:${isAvailability ? 'availability-review' : 'review'}`, mentorId, isAvailability ? 'availability_review' : 'mentor_review',
    isAvailability ? 'Review mentor availability update' : 'Review new mentor submission', name || email).run();
  return c.json({ ok: true, mentor_id: mentorId, action: existing ? 'updated' : 'created', form_type: formType });
});

async function authorised(c: Context<AppEnv>) {
  const supplied = c.req.header('x-mentor-webhook-secret');
  if (supplied && c.env.MENTOR_WEBHOOK_SECRET && timingSafeEqual(supplied, c.env.MENTOR_WEBHOOK_SECRET)) return true;
  return isAdmin(c.env, await getCaller(c.req.raw, c.env));
}

/** `insert ... on conflict (key) do update` for every given column. */
async function upsert(db: D1Database, table: string, key: string, values: Payload) {
  const data = encode(table, values);
  const cols = Object.keys(data);
  const updates = cols.filter((col) => col !== key).map((col) => `${col} = excluded.${col}`);
  await db.prepare(`insert into ${table} (${cols.join(', ')}) values (${cols.map(() => '?').join(', ')}) on conflict (${key}) do update set ${updates.join(', ')}`)
    .bind(...cols.map((col) => data[col])).run();
}

async function uniqueMentorId(db: D1Database, name: string) {
  const base = slug(name) || 'mentor';
  const taken = await db.prepare('select 1 from mentors where id = ?').bind(base).first();
  return taken ? `${base}-${crypto.randomUUID().slice(0, 6)}` : base;
}

const slug = (value: string) => value.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 60);

function str(payload: Payload, keys: string[]) {
  for (const key of keys) {
    const value = payload[key];
    if (value !== undefined && value !== null) return String(value).slice(0, 5000);
  }
  return '';
}

function list(payload: Payload, keys: string[]) {
  for (const key of keys) {
    const value = payload[key];
    if (Array.isArray(value)) return value.map((v) => String(v).trim()).filter(Boolean).slice(0, 100);
    if (typeof value === 'string') return value.split(/[,;\n|]/).map((v) => v.trim()).filter(Boolean).slice(0, 100);
  }
  return [];
}

function num(payload: Payload, keys: string[]) {
  const value = str(payload, keys);
  if (!value) return null;
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : null;
}

function bool(payload: Payload, keys: string[], fallback: boolean) {
  const value = str(payload, keys).toLowerCase();
  return value ? ['yes', 'true', '1', 'on', 'available'].includes(value) : fallback;
}

function date(payload: Payload, keys: string[]) {
  const value = str(payload, keys);
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function normalizeType(value: string) {
  const normal = value.toLowerCase().replace(/[-\s:]+/g, '_');
  if (normal.includes('one') || normal.includes('1_1')) return 'one_on_one';
  if (normal.includes('discover')) return 'discovery';
  if (normal.includes('industry')) return 'industry';
  return '';
}
