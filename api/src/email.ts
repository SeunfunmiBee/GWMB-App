import type { Env } from './env';

const SENDER_NAME = 'Girls Who Mean Business';

export const emailConfigured = (env: Env) => Boolean(env.EMAIL && env.NOTIFICATION_FROM_EMAIL);

// Transactional email through Cloudflare Email Sending (the `EMAIL` send_email binding).
export async function sendEmail(env: Env, to: string, subject: string, text: string, html?: string) {
  // Only local dev may print emails (they contain sign-in codes). Everywhere else, fail closed.
  if (env.ENVIRONMENT === 'development') {
    console.warn(`[dev email] to=${to} subject=${subject}
${text}`);
    return;
  }
  if (!emailConfigured(env)) throw new Error('Email is not configured.');
  await env.EMAIL!.send({ from: { email: env.NOTIFICATION_FROM_EMAIL!, name: SENDER_NAME }, to, subject, text, ...(html ? { html } : {}) });
}

export interface EmailContent {
  title: string;
  body: string; // plain text; blank lines start new paragraphs
  code?: string; // one-time code, shown large
  action?: { label: string; url: string }; // https links only
  footnote?: string;
}

export const escapeHtml = (value: string) => value.replace(/[&<>'"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#039;', '"': '&quot;' })[ch]!);

// Brand colours mirror src/theme in the app. Table layout + inline styles, because Outlook and Gmail ignore most CSS.
const C = { pink: '#E62B7F', pinkDeep: '#A81455', pinkSoft: '#FCEBF3', ink: '#111011', muted: '#746E72', line: '#E9E5E7', canvas: '#FAF9FA' };
const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

export function renderEmail(env: Pick<Env, 'BETTER_AUTH_URL'>, { title, body, code, action, footnote }: EmailContent) {
  const logo = `${env.BETTER_AUTH_URL.replace(/\/$/, '')}/email-logo.png`;
  const paragraphs = body.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean)
    .map((p) => `<p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:${C.muted}">${escapeHtml(p).replace(/\n/g, '<br>')}</p>`).join('');
  const codeBlock = code ? `<tr><td style="padding:8px 0 24px"><div style="background:${C.pinkSoft};border-radius:16px;padding:22px 12px;text-align:center;font-family:'SF Mono',Menlo,Consolas,monospace;font-size:34px;font-weight:700;letter-spacing:10px;color:${C.pinkDeep}">${escapeHtml(code)}</div></td></tr>` : '';
  const button = action && /^https:\/\//i.test(action.url) ? `<tr><td style="padding:8px 0 24px"><a href="${escapeHtml(action.url)}" style="display:inline-block;background:${C.pinkDeep};color:#ffffff;text-decoration:none;font-weight:600;font-size:16px;padding:14px 28px;border-radius:999px">${escapeHtml(action.label)}</a></td></tr>` : '';
  const note = footnote ? `<tr><td style="border-top:1px solid ${C.line};padding-top:20px;font-size:13px;line-height:1.6;color:${C.muted}">${escapeHtml(footnote)}</td></tr>` : '';
  const preheader = code ? `Your code is ${code}` : body.slice(0, 120);

  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${escapeHtml(title)}</title></head>
<body style="margin:0;padding:0;background:${C.canvas};font-family:${FONT};color:${C.ink}">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${escapeHtml(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.canvas}"><tr><td align="center" style="padding:40px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px">
<tr><td style="padding:0 4px 24px"><table role="presentation" cellpadding="0" cellspacing="0"><tr>
<td><img src="${logo}" width="40" height="40" alt="GWMB" style="display:block;border-radius:12px"></td>
<td style="padding-left:12px;font-size:15px;font-weight:700;color:${C.ink}">Girls Who Mean Business</td></tr></table></td></tr>
<tr><td style="background:#ffffff;border:1px solid ${C.line};border-radius:24px;overflow:hidden">
<div style="height:6px;background:${C.pink};background-image:linear-gradient(90deg,${C.pink},${C.pinkDeep})"></div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="padding:36px 36px 28px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
<tr><td><h1 style="margin:0 0 16px;font-size:26px;line-height:1.25;font-weight:700;letter-spacing:-0.4px;color:${C.ink}">${escapeHtml(title)}</h1>${paragraphs}</td></tr>
${codeBlock}${button}${note}
</table></td></tr></table></td></tr>
<tr><td style="padding:24px 8px 0;text-align:center;font-size:12px;line-height:1.6;color:${C.muted}">Girls Who Mean Business<br>This is an automated message from the GWMB app. Replies to this address are not read.</td></tr>
</table></td></tr></table></body></html>`;
}
