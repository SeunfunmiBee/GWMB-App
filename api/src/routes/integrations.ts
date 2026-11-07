// Google Calendar + Meet for admin-scheduled sessions (ports of the google-calendar-* Edge Functions).
// The refresh token is stored encrypted (AES-GCM, key from GOOGLE_TOKEN_ENCRYPTION_KEY) and never leaves the Worker.
import { z } from 'zod';
import type { Env } from '../env';
import { body, HttpError, nowIso, requireAdmin, requireUser, router } from '../http';

const STATE_TTL_MS = 10 * 60_000;
const SCOPES = 'openid email https://www.googleapis.com/auth/calendar.events';

export const adminIntegrations = router();
adminIntegrations.use('*', requireUser, requireAdmin);

adminIntegrations.get('/google/status', async (c) => {
  const row = await c.env.DB.prepare("select connected_email, status, connected_at from admin_integrations where provider = 'google_calendar'")
    .first<{ connected_email: string | null; status: string; connected_at: string | null }>();
  return c.json({ connected: row?.status === 'connected', email: row?.connected_email ?? null, connectedAt: row?.connected_at ?? null, configured: configured(c.env) });
});

adminIntegrations.post('/google/start', async (c) => {
  if (!configured(c.env)) throw new HttpError(503, 'Google Calendar credentials have not been configured yet.');
  const state = crypto.randomUUID();
  await c.env.DB.prepare('insert into google_oauth_states (state_hash, user_id, expires_at) values (?, ?, ?)')
    .bind(await sha256(state), c.get('userId'), new Date(Date.now() + STATE_TTL_MS).toISOString()).run();
  const query = new URLSearchParams({
    client_id: c.env.GOOGLE_CLIENT_ID!, redirect_uri: redirectUri(c.env), response_type: 'code', access_type: 'offline',
    prompt: 'consent', include_granted_scopes: 'true', scope: SCOPES, state,
  });
  return c.json({ url: `https://accounts.google.com/o/oauth2/v2/auth?${query}` });
});

/** Creates the Calendar event with a Meet link for a scheduled content item; the link is stored privately. */
adminIntegrations.post('/google/meet', async (c) => {
  const { contentId } = await body(c, z.object({ contentId: z.string().min(1) }));
  const db = c.env.DB;
  const content = await db.prepare('select id, title, summary, body, starts_at, ends_at from content_items where id = ?').bind(contentId)
    .first<{ id: string; title: string; summary: string | null; body: string | null; starts_at: string | null; ends_at: string | null }>();
  if (!content) throw new HttpError(404, 'This session no longer exists.');
  if (!content.starts_at) throw new HttpError(400, 'Add the session start date and time before creating a Meet link.');
  const integration = await db.prepare("select encrypted_refresh_token from admin_integrations where provider = 'google_calendar' and status = 'connected'")
    .first<{ encrypted_refresh_token: string | null }>();
  if (!integration?.encrypted_refresh_token) throw new HttpError(409, 'Connect Google Calendar first.');
  const userId = c.get('userId');
  const saveMeeting = (fields: Record<string, string | null>) => {
    const cols = ['content_id', 'created_by', ...Object.keys(fields)];
    return db.prepare(`insert into content_meetings (${cols.join(', ')}) values (${cols.map(() => '?').join(', ')})
      on conflict (content_id) do update set ${cols.slice(1).map((col) => `${col} = excluded.${col}`).join(', ')}`)
      .bind(content.id, userId, ...Object.values(fields)).run();
  };
  await saveMeeting({ status: 'creating', error_message: null });
  try {
    const accessToken = await refreshAccessToken(c.env, await decryptToken(c.env, integration.encrypted_refresh_token));
    const start = new Date(content.starts_at);
    const end = content.ends_at ? new Date(content.ends_at) : new Date(start.getTime() + 3600_000);
    const res = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events?conferenceDataVersion=1&sendUpdates=all', {
      method: 'POST',
      headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        summary: content.title,
        description: [content.summary, content.body].filter(Boolean).join('\n\n'),
        start: { dateTime: start.toISOString(), timeZone: 'Africa/Lagos' },
        end: { dateTime: end.toISOString(), timeZone: 'Africa/Lagos' },
        conferenceData: { createRequest: { requestId: crypto.randomUUID(), conferenceSolutionKey: { type: 'hangoutsMeet' } } },
      }),
    });
    const event = (await res.json()) as { id?: string; htmlLink?: string; hangoutLink?: string; error?: { message?: string }; conferenceData?: { entryPoints?: { entryPointType: string; uri: string }[] } };
    if (!res.ok || !event.id) throw new Error(event.error?.message || 'Google Calendar could not create this event.');
    const meetingUrl = event.hangoutLink ?? event.conferenceData?.entryPoints?.find((p) => p.entryPointType === 'video')?.uri ?? null;
    await saveMeeting({ provider: 'google_meet', provider_event_id: event.id, meeting_url: meetingUrl, host_url: event.htmlLink ?? null, status: 'ready', error_message: null });
    return c.json({ meetingUrl, eventId: event.id });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not create Google Meet.';
    await saveMeeting({ status: 'error', error_message: message.slice(0, 1000) });
    throw new HttpError(502, message);
  }
});

/** Google redirects the admin's browser here after consent. Public: the one-time `state` proves who started it. */
export const integrationCallbacks = router();

integrationCallbacks.get('/google/callback', async (c) => {
  const code = c.req.query('code');
  const state = c.req.query('state');
  if (!code || !state) return page('Connection cancelled', 'Return to the GWMB admin dashboard and try again.');
  // Single use: the state row is deleted as it is read.
  const oauthState = await c.env.DB.prepare('delete from google_oauth_states where state_hash = ? and expires_at > ? returning user_id')
    .bind(await sha256(state), nowIso()).first<{ user_id: string }>();
  if (!oauthState) return page('This link expired', 'Return to the GWMB admin dashboard and reconnect Google Calendar.');
  try {
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ code, client_id: c.env.GOOGLE_CLIENT_ID ?? '', client_secret: c.env.GOOGLE_CLIENT_SECRET ?? '', redirect_uri: redirectUri(c.env), grant_type: 'authorization_code' }),
    });
    const tokens = (await tokenRes.json()) as { access_token?: string; refresh_token?: string; scope?: string; error_description?: string };
    if (!tokenRes.ok || !tokens.refresh_token) throw new Error(tokens.error_description || 'Google did not return a refresh token. Reconnect and approve offline access.');
    const info = (await (await fetch('https://openidconnect.googleapis.com/v1/userinfo', { headers: { authorization: `Bearer ${tokens.access_token}` } })).json()) as { email?: string };
    await c.env.DB.prepare(
      `insert into admin_integrations (provider, connected_email, encrypted_refresh_token, scopes, status, last_error, connected_by, connected_at)
       values ('google_calendar', ?, ?, ?, 'connected', null, ?, ?)
       on conflict (provider) do update set connected_email = excluded.connected_email, encrypted_refresh_token = excluded.encrypted_refresh_token,
         scopes = excluded.scopes, status = 'connected', last_error = null, connected_by = excluded.connected_by, connected_at = excluded.connected_at, updated_at = excluded.connected_at`,
    ).bind(info.email ?? null, await encryptToken(c.env, tokens.refresh_token), JSON.stringify(String(tokens.scope ?? '').split(' ').filter(Boolean)), oauthState.user_id, nowIso()).run();
    return page('Google Calendar connected', `GWMB sessions can now create Calendar events and Google Meet links using ${info.email ?? 'this account'}. You can close this page.`, true);
  } catch (error) {
    return page('Could not connect Google Calendar', error instanceof Error ? error.message : 'Please try again.');
  }
});

const configured = (env: Env) => Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET && env.GOOGLE_TOKEN_ENCRYPTION_KEY);
const redirectUri = (env: Env) => `${env.BETTER_AUTH_URL.replace(/\/$/, '')}/v1/integrations/google/callback`;

async function refreshAccessToken(env: Env, refreshToken: string) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: env.GOOGLE_CLIENT_ID ?? '', client_secret: env.GOOGLE_CLIENT_SECRET ?? '', refresh_token: refreshToken, grant_type: 'refresh_token' }),
  });
  const payload = (await res.json()) as { access_token?: string; error_description?: string };
  if (!res.ok || !payload.access_token) throw new Error(payload.error_description || 'Google access token refresh failed.');
  return payload.access_token;
}

async function sha256(value: string) {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));
  return [...digest].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Same format as the Supabase functions (`<iv b64>.<ciphertext b64>`, key = SHA-256 of the secret), so tokens carry over.
async function encryptionKey(env: Env) {
  const raw = env.GOOGLE_TOKEN_ENCRYPTION_KEY;
  if (!raw || raw.length < 32) throw new Error('GOOGLE_TOKEN_ENCRYPTION_KEY must be at least 32 characters.');
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw));
  return crypto.subtle.importKey('raw', hash, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

const toB64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const fromB64 = (value: string) => Uint8Array.from(atob(value), (ch) => ch.charCodeAt(0));

export async function encryptToken(env: Env, value: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await encryptionKey(env), new TextEncoder().encode(value)));
  return `${toB64(iv)}.${toB64(data)}`;
}

export async function decryptToken(env: Env, value: string) {
  const [iv, data] = value.split('.');
  return new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(iv) }, await encryptionKey(env), fromB64(data)));
}

const escapeHtml = (value: string) => value.replace(/[&<>'"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#039;', '"': '&quot;' })[ch]!);

function page(title: string, copy: string, ok = false) {
  return new Response(
    `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${escapeHtml(title)}</title><style>body{font-family:system-ui;background:#f7f5f6;margin:0;display:grid;place-items:center;min-height:100vh;color:#111}.card{max-width:420px;margin:24px;background:#fff;border:1px solid #e7e1e4;border-radius:26px;padding:30px;text-align:center}.icon{width:64px;height:64px;border-radius:22px;background:${ok ? '#e4f7ef' : '#fde7f1'};display:grid;place-items:center;margin:auto;font-size:28px}h1{font-size:25px}p{color:#6d676b;line-height:1.6}</style><div class="card"><div class="icon">${ok ? '✓' : '!'}</div><h1>${escapeHtml(title)}</h1><p>${escapeHtml(copy)}</p></div>`,
    { headers: { 'content-type': 'text/html; charset=utf-8', 'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'", 'x-frame-options': 'DENY' } },
  );
}
