import type { Env } from './env';

// Transactional email through Resend (same provider the Supabase functions used).
export async function sendEmail(env: Env, to: string, subject: string, text: string) {
  if (!env.RESEND_API_KEY || !env.NOTIFICATION_FROM_EMAIL) {
    // Only local dev may print emails (they contain sign-in and reset links). Everywhere else, fail closed.
    if (env.ENVIRONMENT === 'development') {
      console.warn(`[dev email] to=${to} subject=${subject}
${text}`);
      return;
    }
    throw new Error('Email is not configured.');
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({ from: env.NOTIFICATION_FROM_EMAIL, to, subject, text }),
  });
  if (!res.ok) throw new Error(`Email delivery failed (${res.status}).`);
}
