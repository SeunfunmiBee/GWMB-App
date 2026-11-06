// Sign-in on the GWMB API Worker (Better Auth). Native keeps the session cookie in SecureStore;
// web uses a bearer token in localStorage (avoids third-party cookie issues across domains).
import { expoClient } from '@better-auth/expo/client';
import { emailOTPClient, inferAdditionalFields } from 'better-auth/client/plugins';
import { createAuthClient } from 'better-auth/react';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const apiUrl = process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, '');
if (!apiUrl) throw new Error('The API is not configured. Set EXPO_PUBLIC_API_URL in .env.local.');
export const API_URL = apiUrl;

const isWeb = Platform.OS === 'web';
const WEB_TOKEN_KEY = 'gwmb.auth.token';

function readWebToken() {
  try { return localStorage.getItem(WEB_TOKEN_KEY) ?? ''; } catch { return ''; }
}
function writeWebToken(token: string | null) {
  try { if (token) localStorage.setItem(WEB_TOKEN_KEY, token); else localStorage.removeItem(WEB_TOKEN_KEY); } catch { /* storage unavailable */ }
}

export const authClient = createAuthClient({
  baseURL: API_URL,
  plugins: [
    inferAdditionalFields({ user: { metadata: { type: 'string', required: false } } }),
    emailOTPClient(),
    ...(isWeb ? [] : [expoClient({ scheme: 'gwmb', storagePrefix: 'gwmb', storage: SecureStore })]),
  ],
  fetchOptions: isWeb
    ? {
        auth: { type: 'Bearer', token: readWebToken },
        onSuccess: (ctx) => {
          const token = ctx.response.headers.get('set-auth-token');
          if (token) writeWebToken(token);
        },
      }
    : undefined,
});

/** The user shape the app used with Supabase: `id`, `email` and editable `user_metadata`. */
export type AppUser = { id: string; email: string; user_metadata: Record<string, unknown> };
export type AppSession = { user: AppUser };

export function toAppUser(user: { id: string; email: string; metadata?: string | null }): AppUser {
  let meta: Record<string, unknown> = {};
  try {
    const parsed = JSON.parse(user.metadata || '{}');
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) meta = parsed;
  } catch { /* keep empty */ }
  return { id: user.id, email: user.email, user_metadata: meta };
}

type Result<T = null> = { data: T; error: string | null };
const NOT_VERIFIED = 'EMAIL_NOT_VERIFIED';

function message(error: { message?: string; code?: string } | null | undefined, fallback: string) {
  return error ? error.message || fallback : null;
}

export async function signUp(input: { email: string; password: string; name: string; metadata: Record<string, unknown> }): Promise<Result> {
  const { error } = await authClient.signUp.email({
    email: input.email.trim().toLowerCase(),
    password: input.password,
    name: input.name,
    metadata: JSON.stringify(input.metadata),
  });
  if (error?.code === 'USER_ALREADY_EXISTS' || error?.code === 'USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL') {
    return { data: null, error: 'An app account already exists for this email. Sign in instead.' };
  }
  return { data: null, error: message(error, 'Your account could not be created.') };
}

/** `needsVerification` means the password was right but the email is unconfirmed (a new code was sent). */
export async function signIn(email: string, password: string): Promise<Result<{ user: AppUser | null; needsVerification: boolean }>> {
  const { data, error } = await authClient.signIn.email({ email: email.trim().toLowerCase(), password });
  if (error?.code === NOT_VERIFIED) return { data: { user: null, needsVerification: true }, error: null };
  if (error || !data) return { data: { user: null, needsVerification: false }, error: message(error, 'Email or password is incorrect.') };
  return { data: { user: toAppUser(data.user), needsVerification: false }, error: null };
}

export async function sendVerificationCode(email: string): Promise<Result> {
  const { error } = await authClient.emailOtp.sendVerificationOtp({ email: email.trim().toLowerCase(), type: 'email-verification' });
  return { data: null, error: message(error, 'The code could not be sent.') };
}

/** Confirms the email with the 6-digit code and signs the user in. */
export async function verifyEmail(email: string, code: string): Promise<Result<AppUser | null>> {
  const { data, error } = await authClient.emailOtp.verifyEmail({ email: email.trim().toLowerCase(), otp: code.trim() });
  if (error || !data) return { data: null, error: message(error, 'That code is not valid.') };
  await authClient.getSession({ query: { disableCookieCache: true } });
  return { data: toAppUser(data.user), error: null };
}

export async function requestPasswordReset(email: string): Promise<Result> {
  const { error } = await authClient.emailOtp.requestPasswordReset({ email: email.trim().toLowerCase() });
  return { data: null, error: message(error, 'The reset code could not be sent.') };
}

export async function resetPassword(email: string, code: string, password: string): Promise<Result> {
  const { error } = await authClient.emailOtp.resetPassword({ email: email.trim().toLowerCase(), otp: code.trim(), password });
  return { data: null, error: message(error, 'The password could not be reset.') };
}

export async function changePassword(currentPassword: string, newPassword: string): Promise<Result> {
  const { error } = await authClient.changePassword({ currentPassword, newPassword, revokeOtherSessions: true });
  return { data: null, error: message(error, 'The password could not be changed.') };
}

/** The signed-in user, in the same `{ data: { user } }` shape as Supabase `auth.getUser()`. */
export async function getUser(): Promise<{ data: { user: AppUser | null } }> {
  const { data } = await authClient.getSession();
  return { data: { user: data?.user ? toAppUser(data.user) : null } };
}

/** Merges keys into the user's editable metadata (Supabase `updateUser({ data })`). */
export async function updateMetadata(patch: Record<string, unknown>): Promise<Result> {
  const { data: session } = await authClient.getSession();
  if (!session) return { data: null, error: 'Sign in to continue.' };
  const current = toAppUser(session.user).user_metadata;
  const { error } = await authClient.updateUser({ metadata: JSON.stringify({ ...current, ...patch }) });
  return { data: null, error: message(error, 'Your account could not be updated.') };
}

export async function signOut(): Promise<Result> {
  const { error } = await authClient.signOut();
  if (isWeb) writeWebToken(null);
  return { data: null, error: message(error, 'Sign out failed.') };
}

/** Headers that authenticate a request to the API Worker. */
export async function authHeaders(): Promise<Record<string, string>> {
  if (isWeb) {
    const token = readWebToken();
    return token ? { authorization: `Bearer ${token}` } : {};
  }
  const cookie = (authClient as unknown as { getCookie: () => string }).getCookie();
  return cookie ? { cookie } : {};
}

/** `apiFetch` with the Supabase-style `{ data, error }` result the data modules already expect. */
export async function apiCall<T>(path: string, init: RequestInit = {}): Promise<{ data: T | null; error: Error | null }> {
  try {
    return { data: await apiFetch<T>(path, init), error: null };
  } catch (error) {
    return { data: null, error: error instanceof Error ? error : new Error(String(error)) };
  }
}

/** JSON request to the API Worker as the signed-in user. Throws with the server's message on failure. */
export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = { ...(await authHeaders()), ...(init.body && !(init.body instanceof FormData) ? { 'content-type': 'application/json' } : {}), ...(init.headers as Record<string, string> | undefined) };
  const res = await fetch(`${API_URL}${path}`, { ...init, headers, credentials: 'omit' });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(typeof body?.error === 'string' ? body.error : `Request failed (${res.status}).`);
  return body as T;
}
