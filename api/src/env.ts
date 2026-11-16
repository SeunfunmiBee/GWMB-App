import type { LiveHub } from './live';

export interface Env {
  DB: D1Database;
  LIVE: DurableObjectNamespace<LiveHub>;
  FILES: R2Bucket;
  BETTER_AUTH_URL: string; // public URL of this Worker, e.g. https://gwmb-api.<subdomain>.workers.dev
  BETTER_AUTH_SECRET: string;
  WEB_ORIGINS: string; // comma-separated web app origins allowed to call the API with cookies
  APP_SCHEME: string; // deep-link scheme of the mobile app, e.g. "gwmb"
  ENVIRONMENT?: string; // 'development' only in .dev.vars
  EMAIL?: SendEmail; // Cloudflare Email Sending binding
  NOTIFICATION_FROM_EMAIL?: string; // sender address on the onboarded sending domain
  SIGNING_SECRET: string; // HMAC key for signed file URLs
  ADMIN_SECRET: string; // service access for scripts and scheduled jobs
  MENTOR_WEBHOOK_SECRET?: string; // external mentor forms send it as x-mentor-webhook-secret
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  GOOGLE_TOKEN_ENCRYPTION_KEY?: string; // 32+ characters; encrypts the stored Google refresh token
}
