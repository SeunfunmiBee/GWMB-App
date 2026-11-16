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
