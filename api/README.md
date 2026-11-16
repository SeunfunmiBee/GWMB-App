# GWMB API (Cloudflare Workers)

The backend that replaces Supabase: **Better Auth** for accounts, **D1** (SQLite) for data, **R2** for files.
The old `supabase/` folder stays in the repo as the reference implementation until the cutover is confirmed.

| Path | What |
| --- | --- |
| `/api/auth/*` | Better Auth: email + password; email verification and password reset by 6-digit code; sessions (cookie on native, `Authorization: Bearer` on web) |
| `/storage/*` | Files on R2 with the old bucket rules (table below) |
| `/v1/live` | Realtime: WebSocket change notifications (Durable Object `LiveHub`); `POST /v1/live/ticket` for signed-in connections |
| `/v1/me` | The signed-in user's profile, membership, admin and chapter access; `POST /v1/me/push-devices/deactivate` on sign-out |
| `/health` | Liveness check |

## Migration status

| Phase | Status |
| --- | --- |
| 0. Foundation: Worker, Better Auth, D1 identity tables, R2 storage on Better Auth sessions | Done |
| 1. Port the remaining 61 tables to D1 migrations (`0003_app_schema.sql`) + [porting ledger](PORTING_LEDGER.md) | Done |
| 2. App sign-in screens and `AuthProvider` on the Better Auth Expo client; email codes replace email links; `/v1/me` | Done |
| 3. Replace RPCs and direct table access with API endpoints (authorization in code + tests) | Done |
| 4. Move Edge Functions into the Worker; notification dispatch becomes a Cron Trigger | Done |
| 5. Realtime over WebSockets (Durable Object), replacing Supabase realtime | Done |
| 6. Remove `@supabase/supabase-js` from the app | Done |

### Phase 3 areas

Each area: endpoints with the old access rules enforced in code, tests in `api/test/`, then the app module switched to `apiFetch`.

| Area | App modules | Status |
| --- | --- | --- |
| Account & membership | `account.ts`, `/v1/me`, `/v1/membership` | Done |
| Content, courses & events | `admin-content.ts`, `content-runtime.ts`, `course-progress.ts`, `event-store.ts`, `calendar-store.ts`, `advanced-program.ts` | Done |
| Opportunities, CVs & career | `opportunity-store.ts`, `application-profile-store.ts`, `cv-store.ts`, `career-readiness.ts`, `marketplace-*.ts` | Done |
| Mentorship | `mentorship-store.ts`, admin mentorship screens | Done |
| Community & chapters | `clique-store.ts`, `chapter-admin.ts`, `community-location.tsx`, `volunteer.tsx` | Done |
| Notifications | `notification-store.ts`, `use-unread-notifications.ts`, admin notifications | Done |
| Admin operations | `launch-operations.ts`, `approvals.tsx`, `FeatureFlagProvider.tsx` | Done |

### Phase 4: Edge Functions

| Edge Function | Now |
| --- | --- |
| `notification-dispatch` | `src/dispatch.ts`, run every minute by the Cron Trigger and by `POST /v1/admin/notifications/dispatch` ("send now"). Rows are claimed with one `UPDATE ... RETURNING`, so overlapping runs never double-send; new in-app notifications are pushed to the member's open apps over `/v1/live` |
| `account-request-process` | `POST /v1/admin/operations/account-requests/:id/process` (export bundle to R2, or deletion of R2 files + the Better Auth user, whose foreign keys cascade) and `GET /v1/account/requests/:id/export-url` (owner only, 10-minute link) |
| `parse-cv` | `POST /v1/cv-import/file` (PDF via `unpdf`, DOCX via `mammoth`) |
| `parse-profile-url` | `POST /v1/cv-import/url` (public hosts only, every redirect re-checked) |
| `mentor-intake` | `POST /v1/mentor-intake` (`x-mentor-webhook-secret` or an admin session) |
| `google-calendar-*` | `/v1/admin/integrations/google/{status,start,meet}`; Google redirects to `/v1/integrations/google/callback` (one-time state). Stored tokens use the old encryption format, so set the same `GOOGLE_TOKEN_ENCRYPTION_KEY` to keep an existing connection |
| `membership-email-otp` | `/v1/membership` (phase 3) |

Optional secrets: `MENTOR_WEBHOOK_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_TOKEN_ENCRYPTION_KEY`. In Google Cloud,
add `<BETTER_AUTH_URL>/v1/integrations/google/callback` as an authorised redirect URI.

Run the API tests with `npm test` in `api/` (96 tests).

### Realtime

`LiveHub` (a Durable Object using WebSocket hibernation) holds every client socket. After a successful write,
`src/realtime-publish.ts` maps the route to topics (`content`, `calendar`, `marketplace`, `notifications`, `flags`,
and the admin-only `admin`) and
either broadcasts them or sends them only to the acting member's devices. Messages carry only the topic; the app
refetches through the API, so access rules still apply. Signed-in sockets authenticate with a 60-second ticket.
The app keeps one shared socket (`src/lib/live.ts`) with reconnect backoff, a catch-up refresh on reconnect or
foreground, and a 5-minute safety refresh.

Rows go through `src/db.ts`: booleans are stored `0/1`, JSON as text and timestamps as UTC ISO text; `src/db-columns.ts` (generated) says which column is which.

## Conventions (D1)

- IDs are UUID text generated in the Worker (`crypto.randomUUID()`); Better Auth uses `generateId: 'uuid'`, so user IDs are UUIDs too.
- Timestamps are ISO-8601 UTC text, booleans are `0/1`, JSON is text, enums are `CHECK` constraints.
- `updated_at` is maintained by SQLite triggers. Access rules (the old RLS policies) live in Worker code.

## Seed data

`0008_seed_data.sql` holds the reference rows the Supabase migrations seeded (74 content items, marketplace inventory,
practice questions, feature flags, settings, starter mentors and sessions), generated by `scripts/seed-from-pg.py`.

## Regenerating the schema and ledger

`0003_app_schema.sql` and `PORTING_LEDGER.md` are generated from the final Supabase schema. To rebuild them, apply every
`supabase/migrations` file to a throwaway local Postgres (with stand-ins for Supabase's `auth`, `storage`, `cron` and `net`
objects), then run:

```powershell
python api/scripts/pg-to-d1.py > api/migrations/0003_app_schema.sql   # from repo root
$env:PYTHONIOENCODING="utf-8"; python api/scripts/ledger.py > api/PORTING_LEDGER.md
```

Once D1 is the source of truth, stop regenerating and add new numbered migrations instead.

## Storage rules

| Bucket | Read | Write | Limit |
| --- | --- | --- | --- |
| `avatars` | public | owner (`<userId>/…`) | 5 MB, jpeg/png/webp |
| `content-media` | public | app admin | 250 MB |
| `protected-content-media` | signed URL for admins and verified members | app admin | 250 MB |
| `private-cvs` | signed URL for owner or app admin | owner | 10 MB |
| `privacy-exports` | signed URL issued by the API only | service only | 10 MB |

## Local development

```powershell
cd api
npm install
# .dev.vars (git-ignored):
#   BETTER_AUTH_URL=http://localhost:8799
#   BETTER_AUTH_SECRET=<32+ random chars>
#   SIGNING_SECRET=<random>
#   ADMIN_SECRET=<random>
#   ENVIRONMENT=development
npx wrangler d1 migrations apply gwmb --local
npx wrangler dev --port 8799
```

Email goes through Cloudflare Email Sending (the `EMAIL` send_email binding, from `NOTIFICATION_FROM_EMAIL` on the onboarded `notify.girlswhomeanbusiness.org` domain). With `ENVIRONMENT=development`, emails are printed to the dev log instead. In any other environment a missing binding or sender makes email sending fail rather than log the codes.

If you add Better Auth plugins that need tables, regenerate the auth schema into a new migration:
`npx @better-auth/cli generate --config scripts/auth-schema.config.ts --output migrations/<n>_auth.sql`

## Deploy

```powershell
npx wrangler d1 create gwmb            # put the returned database_id into wrangler.jsonc
npx wrangler r2 bucket create gwmb-files
npx wrangler d1 migrations apply gwmb --remote
# secrets.json (git-ignored): BETTER_AUTH_SECRET, SIGNING_SECRET, ADMIN_SECRET
npx wrangler email sending enable notify.<your domain>   # Workers Paid; adds the DNS records on Cloudflare
npx wrangler deploy --secrets-file secrets.json --var BETTER_AUTH_URL:https://api.<your domain> --var WEB_ORIGINS:https://<web app origin>
```

Then set `EXPO_PUBLIC_API_URL` in `.env.local` and in EAS.
