# GWMB – Girls Who Mean Business

Production mobile application for Android and iOS, built with React Native, Expo SDK 57 and TypeScript.

## Identifiers

- Display name: `GWMB – Girls Who Mean Business`
- Android package: `org.girlswhomeanbusiness.app`
- URL scheme: `gwmb://`

## Run locally

```bash
npm install
npm start
```

Use Expo Go for the current foundation. Development builds will be introduced when native-only services are added.

## Backend (Cloudflare)

The app talks to one Cloudflare Worker in `api/`: Better Auth for accounts, D1 for data, R2 for files and a Durable
Object for realtime updates. Copy `.env.example` to `.env.local` and set `EXPO_PUBLIC_API_URL` to the Worker URL.
Server secrets live in the Worker, never in the app. See [api/README.md](api/README.md) for routes, migrations and tests.

Membership verification and opportunity-status decisions stay server-controlled: submitting an application or
verification request places an account into a pending state, and only an admin decision in the API activates verified
membership access.

The old `supabase/` folder is kept as a reference for the previous implementation and is no longer used by the app.

## Android builds

EAS Build is configured in `eas.json` with two Android profiles:

- `preview` produces a signed APK for direct installation and internal testing.
- `production` produces a signed Android App Bundle for Google Play.

The project uses EAS-managed remote build numbers. `EXPO_PUBLIC_API_URL` must be stored in both the EAS `preview` and `production` environments because `.env.local` is intentionally excluded from cloud builds.

```bash
npx eas-cli@latest build --platform android --profile preview
```
