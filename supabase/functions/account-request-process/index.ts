// Deno resolves URL imports at deploy time; the app ESLint resolver does not.
// eslint-disable-next-line import/no-unresolved
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const EXPORT_SCHEMA_VERSION = 2;
const PAGE_SIZE = 500;
const STORAGE_REMOVE_BATCH_SIZE = 100;

type OwnedTable = {
  key: string;
  table: string;
  column: string;
};

type StorageFile = {
  bucket: string;
  path: string;
  size: number | null;
  content_type: string | null;
  created_at: string | null;
  updated_at: string | null;
};

const ownedTables: OwnedTable[] = [
  { key: 'profiles', table: 'profiles', column: 'id' },
  { key: 'memberships', table: 'memberships', column: 'user_id' },
  { key: 'membership_records', table: 'membership_records', column: 'linked_user_id' },
  { key: 'membership_applications', table: 'membership_applications', column: 'user_id' },
  { key: 'membership_verification_requests', table: 'membership_verification_requests', column: 'user_id' },
  { key: 'marketplace_journeys', table: 'marketplace_journeys', column: 'user_id' },
  { key: 'marketplace_readiness_profiles', table: 'marketplace_readiness_profiles', column: 'user_id' },
  { key: 'marketplace_recommendation_feedback', table: 'marketplace_recommendation_feedback', column: 'user_id' },
  { key: 'marketplace_recommendation_runs', table: 'marketplace_recommendation_runs', column: 'user_id' },
  { key: 'marketplace_activity', table: 'marketplace_activity', column: 'user_id' },
  { key: 'course_progress', table: 'course_progress', column: 'user_id' },
  { key: 'event_registrations', table: 'event_registrations', column: 'user_id' },
  { key: 'mentorship_registrations', table: 'mentorship_registrations', column: 'user_id' },
  { key: 'mentorship_applications', table: 'mentorship_applications', column: 'user_id' },
  { key: 'mentorship_industry_interests', table: 'mentorship_industry_interests', column: 'user_id' },
  { key: 'clique_memberships', table: 'clique_memberships', column: 'user_id' },
  { key: 'clique_session_seats', table: 'clique_session_seats', column: 'user_id' },
  { key: 'community_preferences', table: 'community_preferences', column: 'user_id' },
  { key: 'local_activity_attendance', table: 'local_activity_attendance', column: 'user_id' },
  { key: 'local_attendance_requests', table: 'local_attendance_requests', column: 'user_id' },
  { key: 'membership_participation_status', table: 'membership_participation_status', column: 'user_id' },
  { key: 'saved_opportunities', table: 'saved_opportunities', column: 'user_id' },
  { key: 'opportunity_applications', table: 'opportunity_applications', column: 'user_id' },
  { key: 'application_profiles', table: 'application_profiles', column: 'user_id' },
  { key: 'application_reminders', table: 'application_reminders', column: 'user_id' },
  { key: 'cv_records', table: 'cv_records', column: 'user_id' },
  { key: 'advanced_program_claims', table: 'advanced_program_claims', column: 'user_id' },
  { key: 'career_review_submissions', table: 'career_review_submissions', column: 'user_id' },
  { key: 'career_practice_responses', table: 'career_practice_responses', column: 'user_id' },
  { key: 'career_saved_resources', table: 'career_saved_resources', column: 'user_id' },
  { key: 'volunteer_applications', table: 'volunteer_applications', column: 'user_id' },
  { key: 'notification_preferences', table: 'notification_preferences', column: 'user_id' },
  { key: 'push_devices', table: 'push_devices', column: 'user_id' },
  { key: 'user_notifications', table: 'user_notifications', column: 'user_id' },
  { key: 'notification_outbox', table: 'notification_outbox', column: 'user_id' },
  { key: 'support_requests', table: 'support_requests', column: 'user_id' },
  { key: 'app_error_logs', table: 'app_error_logs', column: 'user_id' },
  { key: 'user_action_rate_limits', table: 'user_action_rate_limits', column: 'actor_user_id' },
  { key: 'beta_testers', table: 'beta_testers', column: 'user_id' },
  { key: 'app_admins', table: 'app_admins', column: 'user_id' },
  { key: 'chapter_admins', table: 'chapter_admins', column: 'user_id' },
  { key: 'account_requests', table: 'account_requests', column: 'user_id' },
  { key: 'admin_audit_activity', table: 'admin_audit_logs', column: 'actor_user_id' },
];

const ownedStorageBuckets = ['avatars', 'private-cvs', 'privacy-exports'] as const;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  const authorization = req.headers.get('authorization') ?? '';
  const jwt = authorization.replace(/^Bearer\s+/i, '');
  const url = Deno.env.get('SUPABASE_URL')!;
  const anon = Deno.env.get('SUPABASE_ANON_KEY')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const caller = createClient(url, anon, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false },
  });
  const service = createClient(url, serviceKey, { auth: { persistSession: false } });
  const { data: { user } } = await caller.auth.getUser(jwt);
  if (!user) return json({ error: 'Sign in required.' }, 401);

  const body = await req.json().catch(() => ({})) as { action?: string; requestId?: string };
  if (!body.requestId) return json({ error: 'Request ID is required.' }, 400);

  const { data: request, error } = await service
    .from('account_requests')
    .select('*')
    .eq('id', body.requestId)
    .maybeSingle();
  if (error || !request) return json({ error: 'Account request was not found.' }, 404);

  if (body.action === 'download') {
    if (request.user_id !== user.id || request.request_type !== 'data_export' || request.status !== 'completed') {
      return json({ error: 'This export is not available.' }, 403);
    }
    const details = parseDetails(request.details);
    const path = request.export_path ?? details.path;
    if (!path) return json({ error: 'The export file is not ready.' }, 409);
    const { data, error: signError } = await service.storage
      .from('privacy-exports')
      .createSignedUrl(path, 60 * 10);
    if (signError) return json({ error: signError.message }, 500);
    return json({ url: data.signedUrl });
  }

  const { data: isAdmin } = await caller.rpc('is_app_admin');
  if (isAdmin !== true) return json({ error: 'Admin access required.' }, 403);
  if (!['submitted', 'in_review'].includes(request.status)) {
    return json({ error: 'This request has already been processed.' }, 409);
  }
  if (!request.user_id) return json({ error: 'The account is no longer available.' }, 409);

  const { error: claimError } = await service.from('account_requests').update({
    status: 'in_review',
    processing_started_at: new Date().toISOString(),
    processing_error: null,
  }).eq('id', request.id);
  if (claimError) return json({ error: claimError.message }, 500);

  if (request.request_type === 'data_export') {
    try {
      const bundle = await createExportBundle(service, request.user_id, request.email);
      const path = `${request.user_id}/${request.id}.json`;
      const file = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' });
      const { error: uploadError } = await service.storage
        .from('privacy-exports')
        .upload(path, file, { contentType: 'application/json', upsert: true });
      if (uploadError) throw new Error(`privacy-exports: ${uploadError.message}`);

      const { error: completionError } = await service.from('account_requests').update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        processing_error: null,
        export_path: path,
        export_schema_version: EXPORT_SCHEMA_VERSION,
      }).eq('id', request.id);
      if (completionError) throw new Error(`account_requests: ${completionError.message}`);
      return json({ ok: true, type: 'data_export' });
    } catch (exportError) {
      const message = errorMessage(exportError);
      await failRequest(service, request.id, message);
      return json({ error: message }, 500);
    }
  }

  let authDeleted = false;
  try {
    // User-uploaded files are removed first so deleting auth cannot leave private,
    // ownerless objects that the user can no longer discover or remove.
    const storageObjectsRemoved = await removeOwnedStorage(service, request.user_id);

    // These legacy tables previously retained personal text after auth deletion.
    // Explicit cleanup keeps deletion correct before every environment has the
    // hardened cascade constraints from migration 202610300001.
    await deleteOwnedRows(service, 'support_requests', 'user_id', request.user_id);
    await deleteOwnedRows(service, 'app_error_logs', 'user_id', request.user_id);

    // Preserve request-history rows for operational proof, but strip the user's
    // contact details and any old export locations before the auth cascade unlinks them.
    const { error: historyError } = await service.from('account_requests').update({
      email: null,
      details: null,
      export_path: null,
      processing_error: null,
    }).eq('user_id', request.user_id).neq('id', request.id);
    if (historyError) throw new Error(`account_requests: ${historyError.message}`);

    const { error: auditError } = await service.from('admin_audit_logs').insert({
      actor_user_id: user.id,
      action: 'delete_account',
      target_type: 'account_request',
      target_id: request.id,
      metadata: { storage_objects_removed: storageObjectsRemoved },
    });
    if (auditError) throw new Error(`admin_audit_logs: ${auditError.message}`);

    const { error: deleteError } = await service.auth.admin.deleteUser(request.user_id);
    if (deleteError) throw new Error(deleteError.message);
    authDeleted = true;

    const { error: completionError } = await service.from('account_requests').update({
      status: 'completed',
      completed_at: new Date().toISOString(),
      email: null,
      details: null,
      export_path: null,
      processing_error: null,
      storage_objects_removed: storageObjectsRemoved,
    }).eq('id', request.id);
    if (completionError) throw new Error(`account_requests: ${completionError.message}`);
    return json({ ok: true, type: 'account_deletion' });
  } catch (deletionError) {
    const message = errorMessage(deletionError);
    if (!authDeleted) {
      await failRequest(service, request.id, message);
    } else {
      await service.from('admin_audit_logs').insert({
        actor_user_id: user.id,
        action: 'account_deletion_completion_error',
        target_type: 'account_request',
        target_id: request.id,
        metadata: { message: message.slice(0, 500) },
      });
    }
    return json({ error: message }, 500);
  }
});

async function createExportBundle(
  service: ReturnType<typeof createClient>,
  userId: string,
  fallbackEmail: string | null,
) {
  const { data: authResult, error: authError } = await service.auth.admin.getUserById(userId);
  if (authError) throw new Error(`auth.users: ${authError.message}`);
  const account = authResult.user;
  const bundle: Record<string, unknown> = {
    schema_version: EXPORT_SCHEMA_VERSION,
    exported_at: new Date().toISOString(),
    account: {
      id: userId,
      email: account?.email ?? fallbackEmail,
      phone: account?.phone ?? null,
      created_at: account?.created_at ?? null,
      updated_at: account?.updated_at ?? null,
      confirmed_at: account?.confirmed_at ?? null,
      email_confirmed_at: account?.email_confirmed_at ?? null,
      phone_confirmed_at: account?.phone_confirmed_at ?? null,
      last_sign_in_at: account?.last_sign_in_at ?? null,
      app_metadata: account?.app_metadata ?? {},
      user_metadata: account?.user_metadata ?? {},
      identities: (account?.identities ?? []).map((identity) => ({
        id: identity.id,
        provider: identity.provider,
        created_at: identity.created_at,
        updated_at: identity.updated_at,
        identity_data: identity.identity_data,
      })),
    },
    security_material_excluded: [
      'membership_email_challenges.code_hash',
      'google_oauth_states.code_verifier',
    ],
  };

  for (const spec of ownedTables) {
    bundle[spec.key] = await readOwnedRows(service, spec.table, spec.column, userId);
  }

  const outboxRows = bundle.notification_outbox as Record<string, unknown>[];
  const outboxIds = outboxRows.map((row) => String(row.id ?? '')).filter(Boolean);
  bundle.notification_push_deliveries = await readRowsByValues(
    service,
    'notification_push_deliveries',
    'outbox_id',
    outboxIds,
  );

  const storageFiles: StorageFile[] = [];
  for (const bucket of ownedStorageBuckets) {
    storageFiles.push(...await listOwnedStorage(service, bucket, userId));
  }
  bundle.storage_files = storageFiles;
  return bundle;
}

async function readOwnedRows(
  service: ReturnType<typeof createClient>,
  table: string,
  column: string,
  userId: string,
) {
  const rows: Record<string, unknown>[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await service
      .from(table)
      .select('*')
      .eq(column, userId)
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    const page = (data ?? []) as Record<string, unknown>[];
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
  }
  return rows;
}

async function readRowsByValues(
  service: ReturnType<typeof createClient>,
  table: string,
  column: string,
  values: string[],
) {
  if (values.length === 0) return [];
  const rows: Record<string, unknown>[] = [];
  for (let index = 0; index < values.length; index += 100) {
    const chunk = values.slice(index, index + 100);
    const { data, error } = await service.from(table).select('*').in(column, chunk);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...((data ?? []) as Record<string, unknown>[]));
  }
  return rows;
}

async function listOwnedStorage(
  service: ReturnType<typeof createClient>,
  bucket: string,
  userId: string,
) {
  const files: StorageFile[] = [];
  const walk = async (folder: string): Promise<void> => {
    for (let offset = 0; ; offset += PAGE_SIZE) {
      const { data, error } = await service.storage.from(bucket).list(folder, {
        limit: PAGE_SIZE,
        offset,
        sortBy: { column: 'name', order: 'asc' },
      });
      if (error) {
        if (isMissingBucket(error.message)) return;
        throw new Error(`${bucket}/${folder}: ${error.message}`);
      }
      const entries = data ?? [];
      for (const entry of entries) {
        const path = `${folder}/${entry.name}`;
        if (entry.id) {
          const metadata = entry.metadata as Record<string, unknown> | null;
          files.push({
            bucket,
            path,
            size: typeof metadata?.size === 'number' ? metadata.size : null,
            content_type: typeof metadata?.mimetype === 'string' ? metadata.mimetype : null,
            created_at: entry.created_at ?? null,
            updated_at: entry.updated_at ?? null,
          });
        } else {
          await walk(path);
        }
      }
      if (entries.length < PAGE_SIZE) break;
    }
  };
  await walk(userId);
  return files;
}

async function removeOwnedStorage(service: ReturnType<typeof createClient>, userId: string) {
  let removed = 0;
  for (const bucket of ownedStorageBuckets) {
    const files = await listOwnedStorage(service, bucket, userId);
    const paths = files.map((file) => file.path);
    for (let index = 0; index < paths.length; index += STORAGE_REMOVE_BATCH_SIZE) {
      const chunk = paths.slice(index, index + STORAGE_REMOVE_BATCH_SIZE);
      const { error } = await service.storage.from(bucket).remove(chunk);
      if (error) throw new Error(`${bucket}: ${error.message}`);
      removed += chunk.length;
    }
  }
  return removed;
}

async function deleteOwnedRows(
  service: ReturnType<typeof createClient>,
  table: string,
  column: string,
  userId: string,
) {
  const { error } = await service.from(table).delete().eq(column, userId);
  if (error) throw new Error(`${table}: ${error.message}`);
}

async function failRequest(
  service: ReturnType<typeof createClient>,
  requestId: string,
  message: string,
) {
  await service.from('account_requests').update({
    status: 'submitted',
    processing_error: message.slice(0, 2000),
  }).eq('id', requestId);
}

function isMissingBucket(message: string) {
  const normalized = message.toLowerCase();
  return normalized.includes('bucket not found') || normalized.includes('resource not found');
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'The account request could not be processed.';
}

function parseDetails(value: string | null) {
  try {
    return JSON.parse(value ?? '{}') as { path?: string };
  } catch {
    return {};
  }
}

function json(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}
