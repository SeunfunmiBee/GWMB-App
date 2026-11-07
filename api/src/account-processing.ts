// Privacy requests: data export bundles and account deletion (port of the `account-request-process` Edge Function).
import { decode, decodeAll } from './db';
import type { Env } from './env';
import { HttpError, nowIso } from './http';
import { listObjects } from './storage';

export const EXPORT_SCHEMA_VERSION = 2;
const CLAIM_TIMEOUT_MS = 5 * 60_000; // a run that died mid-way can be retried after this
const OWNED_BUCKETS = ['avatars', 'private-cvs', 'privacy-exports'] as const;

/** Every table holding a member's rows, and the column that points at them. */
const OWNED_TABLES: [key: string, table: string, column: string][] = [
  ['profiles', 'profiles', 'id'],
  ['memberships', 'memberships', 'user_id'],
  ['membership_records', 'membership_records', 'linked_user_id'],
  ['membership_applications', 'membership_applications', 'user_id'],
  ['membership_verification_requests', 'membership_verification_requests', 'user_id'],
  ['marketplace_journeys', 'marketplace_journeys', 'user_id'],
  ['marketplace_readiness_profiles', 'marketplace_readiness_profiles', 'user_id'],
  ['marketplace_recommendation_feedback', 'marketplace_recommendation_feedback', 'user_id'],
  ['marketplace_recommendation_runs', 'marketplace_recommendation_runs', 'user_id'],
  ['marketplace_activity', 'marketplace_activity', 'user_id'],
  ['course_progress', 'course_progress', 'user_id'],
  ['event_registrations', 'event_registrations', 'user_id'],
  ['mentorship_registrations', 'mentorship_registrations', 'user_id'],
  ['mentorship_applications', 'mentorship_applications', 'user_id'],
  ['mentorship_industry_interests', 'mentorship_industry_interests', 'user_id'],
  ['clique_memberships', 'clique_memberships', 'user_id'],
  ['clique_session_seats', 'clique_session_seats', 'user_id'],
  ['community_preferences', 'community_preferences', 'user_id'],
  ['local_activity_attendance', 'local_activity_attendance', 'user_id'],
  ['local_attendance_requests', 'local_attendance_requests', 'user_id'],
  ['membership_participation_status', 'membership_participation_status', 'user_id'],
  ['saved_opportunities', 'saved_opportunities', 'user_id'],
  ['opportunity_applications', 'opportunity_applications', 'user_id'],
  ['application_profiles', 'application_profiles', 'user_id'],
  ['application_reminders', 'application_reminders', 'user_id'],
  ['cv_records', 'cv_records', 'user_id'],
  ['advanced_program_claims', 'advanced_program_claims', 'user_id'],
  ['career_review_submissions', 'career_review_submissions', 'user_id'],
  ['career_practice_responses', 'career_practice_responses', 'user_id'],
  ['career_saved_resources', 'career_saved_resources', 'user_id'],
  ['volunteer_applications', 'volunteer_applications', 'user_id'],
  ['notification_preferences', 'notification_preferences', 'user_id'],
  ['push_devices', 'push_devices', 'user_id'],
  ['user_notifications', 'user_notifications', 'user_id'],
  ['notification_outbox', 'notification_outbox', 'user_id'],
  ['support_requests', 'support_requests', 'user_id'],
  ['app_error_logs', 'app_error_logs', 'user_id'],
  ['user_action_rate_limits', 'user_action_rate_limits', 'actor_user_id'],
  ['beta_testers', 'beta_testers', 'user_id'],
  ['app_admins', 'app_admins', 'user_id'],
  ['chapter_admins', 'chapter_admins', 'user_id'],
  ['account_requests', 'account_requests', 'user_id'],
  ['admin_audit_activity', 'admin_audit_logs', 'actor_user_id'],
];

type AccountRequest = { id: string; user_id: string | null; email: string | null; request_type: 'data_export' | 'account_deletion'; status: string; export_path: string | null };

export async function loadRequest(env: Env, id: string) {
  const request = await env.DB.prepare('select * from account_requests where id = ?').bind(id).first<AccountRequest>();
  if (!request) throw new HttpError(404, 'Account request was not found.');
  return request;
}

/** Admin action: builds the export or deletes the account. Failures put the request back in the queue with the error. */
export async function processRequest(env: Env, adminId: string, id: string) {
  const request = await loadRequest(env, id);
  if (!['submitted', 'in_review'].includes(request.status)) throw new HttpError(409, 'This request has already been processed.');
  if (!request.user_id) throw new HttpError(409, 'The account is no longer available.');
  // Atomic claim: a second click (or a second admin) while this runs gets a 409 instead of a duplicate run.
  const claimed = await env.DB.prepare(
    "update account_requests set status = 'in_review', processing_started_at = ?, processing_error = null where id = ? and status in ('submitted', 'in_review') and (processing_started_at is null or processing_started_at < ?) returning id",
  ).bind(nowIso(), id, new Date(Date.now() - CLAIM_TIMEOUT_MS).toISOString()).first();
  if (!claimed) throw new HttpError(409, 'This request is already being processed.');
  try {
    if (request.request_type === 'data_export') await exportAccount(env, request, request.user_id);
    else await deleteAccount(env, adminId, request, request.user_id);
    return { ok: true as const, type: request.request_type };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'The account request could not be processed.';
    await env.DB.prepare("update account_requests set status = 'submitted', processing_started_at = null, processing_error = ? where id = ?").bind(message.slice(0, 2000), id).run();
    console.error('account request failed', id, error);
    throw new HttpError(500, 'The account request could not be processed. The error is saved on the request.');
  }
}

async function exportAccount(env: Env, request: AccountRequest, userId: string) {
  const bundle = await exportBundle(env, userId, request.email);
  const path = `${userId}/${request.id}.json`;
  await env.FILES.put(`privacy-exports/${path}`, JSON.stringify(bundle, null, 2), { httpMetadata: { contentType: 'application/json', cacheControl: 'private' } });
  await env.DB.prepare("update account_requests set status = 'completed', completed_at = ?, processing_error = null, export_path = ?, export_schema_version = ? where id = ?")
    .bind(nowIso(), path, EXPORT_SCHEMA_VERSION, request.id).run();
}

async function exportBundle(env: Env, userId: string, fallbackEmail: string | null) {
  const user = await env.DB.prepare('select id, email, name, emailVerified, image, createdAt, updatedAt, metadata from "user" where id = ?').bind(userId).first<Record<string, unknown>>();
  let metadata: unknown = {};
  try { metadata = JSON.parse(String(user?.metadata ?? '{}')); } catch { /* keep {} */ }
  const bundle: Record<string, unknown> = {
    schema_version: EXPORT_SCHEMA_VERSION,
    exported_at: nowIso(),
    account: {
      id: userId,
      email: user?.email ?? fallbackEmail,
      name: user?.name ?? null,
      email_verified: user?.emailVerified === 1 || user?.emailVerified === true,
      image: user?.image ?? null,
      created_at: user?.createdAt ?? null,
      updated_at: user?.updatedAt ?? null,
      user_metadata: metadata,
    },
    security_material_excluded: ['passwords', 'sessions', 'verification codes', 'membership_email_challenges.code_hash'],
  };
  const reads = await env.DB.batch(OWNED_TABLES.map(([, table, column]) => env.DB.prepare(`select * from ${table} where ${column} = ?`).bind(userId)));
  OWNED_TABLES.forEach(([key, table], index) => { bundle[key] = decodeAll(table, (reads[index].results ?? []) as Record<string, unknown>[]); });
  const { results: deliveries } = await env.DB.prepare('select d.* from notification_push_deliveries d join notification_outbox o on o.id = d.outbox_id where o.user_id = ?').bind(userId).all();
  bundle.notification_push_deliveries = deliveries;
  const files = [];
  for (const bucket of OWNED_BUCKETS) {
    for (const object of await listObjects(env, bucket, `${userId}/`)) {
      const uploaded = object.uploaded.toISOString();
      files.push({ bucket, path: object.key.slice(bucket.length + 1), size: object.size, content_type: object.httpMetadata?.contentType ?? null, created_at: uploaded, updated_at: uploaded });
    }
  }
  bundle.storage_files = files;
  return bundle;
}

async function deleteAccount(env: Env, adminId: string, request: AccountRequest, userId: string) {
  // Files go first so a failure cannot leave private files that nobody can find or remove.
  let removed = 0;
  for (const bucket of OWNED_BUCKETS) {
    const keys = (await listObjects(env, bucket, `${userId}/`)).map((object) => object.key);
    for (let i = 0; i < keys.length; i += 1000) await env.FILES.delete(keys.slice(i, i + 1000));
    removed += keys.length;
  }
  // One transaction: remove personal text, keep request history without contact details, record the action,
  // then delete the user. Deleting the Better Auth user cascades to sessions and every owned row.
  const now = nowIso();
  await env.DB.batch([
    env.DB.prepare('delete from support_requests where user_id = ?').bind(userId),
    env.DB.prepare('delete from app_error_logs where user_id = ?').bind(userId),
    env.DB.prepare('update account_requests set email = null, details = null, export_path = null, processing_error = null where user_id = ? and id <> ?').bind(userId, request.id),
    env.DB.prepare('insert into admin_audit_logs (actor_user_id, action, target_type, target_id, metadata) values (?, ?, ?, ?, ?)')
      .bind(adminId, 'delete_account', 'account_request', request.id, JSON.stringify({ storage_objects_removed: removed })),
    env.DB.prepare("update account_requests set status = 'completed', completed_at = ?, email = null, details = null, export_path = null, processing_error = null, storage_objects_removed = ? where id = ?")
      .bind(now, removed, request.id),
    env.DB.prepare('delete from "user" where id = ?').bind(userId),
  ]);
}

/** The member's own completed export, or null when it is not available to them. */
export function exportPathFor(request: AccountRequest & { details?: string | null }, userId: string) {
  if (request.user_id !== userId || request.request_type !== 'data_export' || request.status !== 'completed') return null;
  if (request.export_path) return request.export_path;
  try { return (JSON.parse(request.details ?? '{}') as { path?: string }).path ?? null; } catch { return null; }
}

export const decodeRequest = (row: Record<string, unknown>) => decode('account_requests', row);
