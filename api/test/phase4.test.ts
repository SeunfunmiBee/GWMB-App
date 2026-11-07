import { env, SELF } from 'cloudflare:test';
import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { api, BASE, createUser } from './helpers';

const past = () => new Date(Date.now() - 60_000).toISOString();

describe('notification dispatch (cron + admin send-now)', () => {
  it('delivers due in-app rows, honours preferences, and skips email without a provider', async () => {
    const admin = await createUser({ admin: true });
    const user = await createUser();
    const muted = await createUser();
    await env.DB.prepare('insert into notification_preferences (user_id, events_enabled) values (?, 0)').bind(muted.id).run();
    const queue = (userId: string, channel: string, key: string) =>
      env.DB.prepare('insert into notification_outbox (user_id, channel, template_key, payload, scheduled_for) values (?, ?, ?, ?, ?) returning id')
        .bind(userId, channel, key, JSON.stringify({ title: 'Hello', body: 'World', route: '/events' }), past()).first<{ id: string }>();
    const inApp = await queue(user.id, 'in_app', 'admin_broadcast');
    const disabled = await queue(muted.id, 'in_app', 'event_reminder');
    const email = await queue(user.id, 'email', 'admin_broadcast');
    const later = await env.DB.prepare("insert into notification_outbox (user_id, channel, template_key, scheduled_for) values (?, 'in_app', 'x', ?) returning id")
      .bind(user.id, new Date(Date.now() + 3600_000).toISOString()).first<{ id: string }>();

    expect((await api(user, 'POST', '/v1/admin/notifications/dispatch')).status).toBe(403);
    const run = await api<{ sent: number; skipped: number }>(admin, 'POST', '/v1/admin/notifications/dispatch');
    expect(run.status).toBe(200);

    const status = async (id: string) => (await env.DB.prepare('select status, error_message from notification_outbox where id = ?').bind(id).first<{ status: string; error_message: string | null }>())!;
    expect((await status(inApp!.id)).status).toBe('sent');
    expect(await status(disabled!.id)).toMatchObject({ status: 'skipped', error_message: 'Disabled in notification preferences' });
    expect(await status(email!.id)).toMatchObject({ status: 'skipped', error_message: 'Email provider is not configured' });
    expect((await status(later!.id)).status).toBe('pending');
    const inbox = await api<{ title: string; route: string }[]>(user, 'GET', '/v1/notifications');
    expect(inbox.body.some((n) => n.title === 'Hello' && n.route === '/events')).toBe(true);

    // A second run finds nothing new for these rows.
    await api(admin, 'POST', '/v1/admin/notifications/dispatch');
    expect((await env.DB.prepare('select count(*) as n from user_notifications where user_id = ? and title = ?').bind(user.id, 'Hello').first<{ n: number }>())?.n).toBe(1);
  });

  it('turns undeliverable mentor reminders into admin tasks', async () => {
    const admin = await createUser({ admin: true });
    const mentorId = `mentor-${crypto.randomUUID().slice(0, 8)}`;
    await env.DB.prepare("insert into mentors (id, full_name, job_title, organisation, bio, industry) values (?, 'M', 'J', 'O', 'B', 'I')").bind(mentorId).run();
    const row = await env.DB.prepare("insert into mentor_communication_outbox (mentor_id, recipient_email, template_key, payload, scheduled_for) values (?, 'x@mentor.pending', 'mentor_24h', ?, ?) returning id")
      .bind(mentorId, JSON.stringify({ title: 'Career chat' }), past()).first<{ id: string }>();
    await api(admin, 'POST', '/v1/admin/notifications/dispatch');
    expect((await env.DB.prepare('select status from mentor_communication_outbox where id = ?').bind(row!.id).first<{ status: string }>())?.status).toBe('skipped');
    const task = await env.DB.prepare('select kind, priority, detail from mentorship_operations_tasks where dedupe_key = ?').bind(`mentor-message:${row!.id}`).first();
    expect(task).toEqual({ kind: 'manual_mentor_reminder', priority: 'high', detail: 'Career chat' });
  });
});

describe('account requests processing', () => {
  it('builds a data export only the owner can download', async () => {
    const admin = await createUser({ admin: true });
    const user = await createUser();
    const other = await createUser();
    const { body: request } = await api<{ id: string }>(user, 'POST', '/v1/account/requests', { type: 'data_export' });
    await env.FILES.put(`avatars/${user.id}/me.png`, 'png');
    expect((await api(user, 'POST', `/v1/admin/operations/account-requests/${request.id}/process`)).status).toBe(403);
    expect((await api(admin, 'POST', `/v1/admin/operations/account-requests/${request.id}/process`)).body).toEqual({ ok: true, type: 'data_export' });
    expect((await api(admin, 'POST', `/v1/admin/operations/account-requests/${request.id}/process`)).status).toBe(409);

    expect((await api(other, 'GET', `/v1/account/requests/${request.id}/export-url`)).status).toBe(403);
    const { body } = await api<{ url: string }>(user, 'GET', `/v1/account/requests/${request.id}/export-url`);
    const file = await SELF.fetch(body.url);
    const bundle = (await file.json()) as { account: { email: string }; profiles: unknown[]; account_requests: unknown[]; storage_files: { path: string }[] };
    expect(bundle.account.email).toBe(user.email);
    expect(bundle.profiles).toHaveLength(1);
    expect(bundle.storage_files.map((f) => f.path)).toContain(`${user.id}/me.png`);
  });

  it('deletes the account, its files and personal text, keeping an anonymous record', async () => {
    const admin = await createUser({ admin: true });
    const user = await createUser();
    await api(user, 'POST', '/v1/account/support', { type: 'problem', subject: 'Help me', message: 'Something is not working right.' });
    await env.FILES.put(`private-cvs/${user.id}/cv.pdf`, 'pdf');
    await env.FILES.put(`avatars/${user.id}/a.png`, 'png');
    const { body: request } = await api<{ id: string }>(user, 'POST', '/v1/account/requests', { type: 'account_deletion' });
    expect((await api(admin, 'POST', `/v1/admin/operations/account-requests/${request.id}/process`)).body).toEqual({ ok: true, type: 'account_deletion' });

    expect(await env.DB.prepare('select 1 from "user" where id = ?').bind(user.id).first()).toBeNull();
    expect(await env.DB.prepare('select 1 from support_requests where user_id = ?').bind(user.id).first()).toBeNull();
    expect(await env.FILES.head(`private-cvs/${user.id}/cv.pdf`)).toBeNull();
    const record = await env.DB.prepare('select status, email, user_id, storage_objects_removed from account_requests where id = ?').bind(request.id).first();
    expect(record).toEqual({ status: 'completed', email: null, user_id: null, storage_objects_removed: 2 });
    expect((await api(user, 'GET', '/v1/me')).status).toBe(401); // the session went with the user
  });
});

describe('mentor intake', () => {
  const application = (email: string) => ({ source: 'admin_excel', form_type: 'mentor_application', data: { full_name: 'Ada Obi', email, primary_career_field: 'Finance', mentorship_types: 'Discovery, 1:1', one_on_one_capacity: '3' } });

  it('needs the webhook secret or an admin session', async () => {
    const user = await createUser();
    expect((await api(null, 'POST', '/v1/mentor-intake', application('a@example.com'))).status).toBe(401);
    expect((await api(user, 'POST', '/v1/mentor-intake', application('a@example.com'))).status).toBe(401);
    const res = await SELF.fetch(`${BASE}/v1/mentor-intake`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-mentor-webhook-secret': 'wrong' }, body: '{}' });
    expect(res.status).toBe(401);
  });

  it('creates an inactive mentor from an application, then records availability', async () => {
    const admin = await createUser({ admin: true });
    const email = `mentor-${crypto.randomUUID().slice(0, 6)}@example.com`;
    expect((await api(admin, 'POST', '/v1/mentor-intake', { form_type: 'mentor_availability', data: { email } })).status).toBe(404);
    const created = await SELF.fetch(`${BASE}/v1/mentor-intake`, {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-mentor-webhook-secret': 'test-mentor-hook' }, body: JSON.stringify(application(email)),
    });
    const result = (await created.json()) as { mentor_id: string; action: string };
    expect(result.action).toBe('created');
    const mentor = await env.DB.prepare('select active, mentorship_types from mentors where id = ?').bind(result.mentor_id).first();
    expect(mentor).toEqual({ active: 0, mentorship_types: '["discovery","one_on_one"]' });

    const update = await api<{ action: string }>(admin, 'POST', '/v1/mentor-intake', { form_type: 'mentor_availability', data: { email: email.toUpperCase(), preferred_days: 'Mon; Wed', confirmed_until: '2027-03-01' } });
    expect(update.body.action).toBe('updated');
    const ops = await env.DB.prepare('select preferred_days, one_on_one_capacity, availability_confirmation_due from mentor_operations where mentor_id = ?').bind(result.mentor_id).first();
    expect(ops).toEqual({ preferred_days: '["Mon","Wed"]', one_on_one_capacity: 3, availability_confirmation_due: '2027-03-01' });
    const tasks = await env.DB.prepare('select kind from mentorship_operations_tasks where mentor_id = ? order by kind').bind(result.mentor_id).all();
    expect(tasks.results.map((t) => t.kind)).toEqual(['availability_review', 'mentor_review']);
  });
});

describe('CV import', () => {
  const upload = async (user: Awaited<ReturnType<typeof createUser>>, file: File) => {
    const form = new FormData();
    form.append('file', file);
    const res = await SELF.fetch(`${BASE}/v1/cv-import/file`, { method: 'POST', headers: { authorization: user.headers.authorization }, body: form });
    return { status: res.status, body: (await res.json()) as { text: string; complete: boolean; error?: string } };
  };
  const paragraph = 'Ada Obi, Senior Financial Analyst at Example Bank with eight years of experience in risk and treasury.';

  it('reads text from a DOCX file', async () => {
    const user = await createUser();
    const zip = new JSZip();
    zip.file('[Content_Types].xml', '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
    zip.file('_rels/.rels', '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
    zip.file('word/document.xml', `<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>${paragraph}</w:t></w:r></w:p></w:body></w:document>`);
    const bytes = await zip.generateAsync({ type: 'uint8array' });
    const result = await upload(user, new File([bytes], 'cv.docx', { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }));
    expect(result.body).toEqual({ text: paragraph, complete: true });
  });

  it('reads text from a PDF and rejects other types', async () => {
    const user = await createUser();
    const result = await upload(user, new File([minimalPdf(paragraph)], 'cv.pdf', { type: 'application/pdf' }));
    expect(result.body.complete).toBe(true);
    expect(result.body.text).toContain('Senior Financial Analyst');
    expect((await upload(user, new File(['x'], 'cv.txt', { type: 'text/plain' }))).status).toBe(415);
  });

  it('refuses private hosts and LinkedIn URLs', async () => {
    const user = await createUser();
    expect((await api(user, 'POST', '/v1/cv-import/url', { url: 'http://127.0.0.1/admin' })).status).toBe(400);
    expect((await api(user, 'POST', '/v1/cv-import/url', { url: 'http://localhost:8787' })).status).toBe(400);
    const linkedin = await api<{ linkedinPdfRequired: boolean }>(user, 'POST', '/v1/cv-import/url', { url: 'https://www.linkedin.com/in/someone' });
    expect(linkedin).toEqual({ status: 422, body: expect.objectContaining({ linkedinPdfRequired: true }) });
    expect((await api(null, 'POST', '/v1/cv-import/url', { url: 'https://example.com' })).status).toBe(401);
  });
});

describe('Google Calendar integration', () => {
  it('reports configuration, refuses to start without credentials, and rejects unknown states', async () => {
    const admin = await createUser({ admin: true });
    const user = await createUser();
    expect((await api(user, 'GET', '/v1/admin/integrations/google/status')).status).toBe(403);
    expect((await api(admin, 'GET', '/v1/admin/integrations/google/status')).body).toMatchObject({ connected: false, configured: false });
    expect((await api(admin, 'POST', '/v1/admin/integrations/google/start')).status).toBe(503);
    const page = await SELF.fetch(`${BASE}/v1/integrations/google/callback?code=abc&state=forged`);
    expect(await page.text()).toContain('This link expired');
  });

  it('asks for a connection before creating a Meet link', async () => {
    const admin = await createUser({ admin: true });
    const id = crypto.randomUUID();
    await env.DB.prepare("insert into content_items (id, slug, area, content_type, title, starts_at) values (?, ?, 'events', 'webinar', 'Talk', ?)").bind(id, `talk-${id}`, new Date().toISOString()).run();
    expect((await api(admin, 'POST', '/v1/admin/integrations/google/meet', { contentId: id })).status).toBe(409);
  });
});

/** A one-page PDF with a single line of Helvetica text, with a correct cross-reference table. */
function minimalPdf(text: string) {
  const stream = `BT /F1 10 Tf 20 700 Td (${text}) Tj ET`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let out = '%PDF-1.4\n';
  const offsets = objects.map((body, i) => {
    const offset = out.length;
    out += `${i + 1} 0 obj\n${body}\nendobj\n`;
    return offset;
  });
  const xref = out.length;
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new TextEncoder().encode(out);
}
