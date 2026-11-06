# GWMB API (Cloudflare Workers)

The backend that replaces Supabase: **Better Auth** for accounts, **D1** (SQLite) for data, **R2** for files.
The old `supabase/` folder stays in the repo as the reference implementation until the cutover is confirmed.

| Path | What |
| --- | --- |
| `/api/auth/*` | Better Auth: email + password; email verification and password reset by 6-digit code; sessions (cookie on native, `Authorization: Bearer` on web) |
| `/storage/*` | Files on R2 with the old bucket rules (table below) |
| `/v1/me` | The signed-in user's profile, membership, admin and chapter access; `POST /v1/me/push-devices/deactivate` on sign-out |
| `/health` | Liveness check |

## Migration status

| Phase | Status |
| --- | --- |
| 0. Foundation: Worker, Better Auth, D1 identity tables, R2 storage on Better Auth sessions | Done |
| 1. Port the remaining 61 tables to D1 migrations (`0003_app_schema.sql`) + [porting ledger](PORTING_LEDGER.md) | Done |
| 2. App sign-in screens and `AuthProvider` on the Better Auth Expo client; email codes replace email links; `/v1/me` | Done |
| 3. Replace RPCs and direct table access with API endpoints (authorization in code + tests) | Next |
| 4. Move Edge Functions into the Worker; notification dispatch becomes a Cron Trigger | |
| 5. Replace realtime subscriptions with polling | |
| 6. Remove `@supabase/supabase-js` from the app | |

### Phase 3 areas

Each area: endpoints with the old access rules enforced in code, tests in `api/test/`, then the app module switched to `apiFetch`.

| Area | App modules | Status |
| --- | --- | --- |
| Account & membership | `account.ts`, `/v1/me`, `/v1/membership` | Done |
| Content, courses & events | `admin-content.ts`, `content-runtime.ts`, `course-progress.ts`, `event-store.ts`, `calendar-store.ts`, `advanced-program.ts` | Done (Google Calendar calls wait for phase 4) |
| Opportunities, CVs & career | `opportunity-store.ts`, `application-profile-store.ts`, `cv-store.ts`, `career-readiness.ts`, `marketplace-*.ts` | Next |
| Mentorship | `mentorship-store.ts`, admin mentorship screens | |
| Community & chapters | `clique-store.ts`, `chapter-admin.ts`, `community-location.tsx`, `volunteer.tsx` | |
| Notifications | `notification-store.ts`, `use-unread-notifications.ts`, admin notifications | |
| Admin operations | `launch-operations.ts`, `approvals.tsx`, `FeatureFlagProvider.tsx`, `local-admins.tsx`, `integrations.tsx` | |

Run the API tests with `npm test` in `api/` (33 tests).

Rows go through `src/db.ts`: booleans are stored `0/1`, JSON as text and timestamps as UTC ISO text; `src/db-columns.ts` (generated) says which column is which.

## Conventions (D1)

- IDs are UUID text generated in the Worker (`crypto.randomUUID()`); Better Auth uses `generateId: 'uuid'`, so user IDs are UUIDs too.
- Timestamps are ISO-8601 UTC text, booleans are `0/1`, JSON is text, enums are `CHECK` constraints.
- `updated_at` is maintained by SQLite triggers. Access rules (the old RLS policies) live in Worker code.

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

With `ENVIRONMENT=development` and no `RESEND_API_KEY`, emails are printed to the dev log. In any other environment a missing Resend config makes email sending fail rather than log the links.

If you add Better Auth plugins that need tables, regenerate the auth schema into a new migration:
`npx @better-auth/cli generate --config scripts/auth-schema.config.ts --output migrations/<n>_auth.sql`

## Deploy

```powershell
npx wrangler d1 create gwmb            # put the returned database_id into wrangler.jsonc
npx wrangler r2 bucket create gwmb-files
npx wrangler d1 migrations apply gwmb --remote
# secrets.json (git-ignored): BETTER_AUTH_SECRET, SIGNING_SECRET, ADMIN_SECRET, RESEND_API_KEY, NOTIFICATION_FROM_EMAIL
npx wrangler deploy --secrets-file secrets.json --var BETTER_AUTH_URL:https://gwmb-api.<subdomain>.workers.dev --var WEB_ORIGINS:https://<web app origin>
```

Then set `EXPO_PUBLIC_API_URL` in `.env.local` and in EAS.
