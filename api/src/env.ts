export interface Env {
  DB: D1Database;
  FILES: R2Bucket;
  BETTER_AUTH_URL: string; // public URL of this Worker, e.g. https://gwmb-api.<subdomain>.workers.dev
  BETTER_AUTH_SECRET: string;
  WEB_ORIGINS: string; // comma-separated web app origins allowed to call the API with cookies
  APP_SCHEME: string; // deep-link scheme of the mobile app, e.g. "gwmb"
  ENVIRONMENT?: string; // 'development' only in .dev.vars
  RESEND_API_KEY?: string;
  NOTIFICATION_FROM_EMAIL?: string;
  SIGNING_SECRET: string; // HMAC key for signed file URLs
  ADMIN_SECRET: string; // service access for scripts and scheduled jobs
}
