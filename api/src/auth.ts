import { expo } from '@better-auth/expo';
import { betterAuth } from 'better-auth';
import { bearer, emailOTP } from 'better-auth/plugins';
import { authOptions } from './auth-options';
import { sendEmail } from './email';
import type { Env } from './env';

const OTP_SUBJECTS = {
  'email-verification': 'Your GWMB verification code',
  'forget-password': 'Your GWMB password reset code',
  'sign-in': 'Your GWMB sign-in code',
  'change-email': 'Confirm your new GWMB email',
} as const;

export function createAuth(env: Env) {
  return betterAuth({
    ...authOptions,
    database: env.DB,
    baseURL: env.BETTER_AUTH_URL,
    secret: env.BETTER_AUTH_SECRET,
    trustedOrigins: [`${env.APP_SCHEME}://`, 'exp://', ...webOrigins(env)],
    // Email is confirmed with a 6-digit code typed in the app (works the same on iOS, Android and web).
    emailAndPassword: { enabled: true, requireEmailVerification: true, minPasswordLength: 8 },
    emailVerification: { sendOnSignUp: true, sendOnSignIn: true, autoSignInAfterVerification: true },
    databaseHooks: {
      user: {
        create: {
          // Replaces the Supabase `handle_new_user` trigger.
          after: async (user) => {
            const meta = parseMetadata((user as typeof user & { metadata?: string | null }).metadata);
            const fullName = text(meta.full_name) || [text(meta.first_name), text(meta.last_name)].filter(Boolean).join(' ') || user.name?.trim() || null;
            await env.DB.batch([
              env.DB.prepare('insert or ignore into profiles (id, full_name) values (?, ?)').bind(user.id, fullName),
              env.DB.prepare("insert or ignore into memberships (user_id, status) values (?, 'non_member')").bind(user.id),
            ]);
          },
        },
      },
    },
    plugins: [
      expo(),
      bearer(),
      emailOTP({
        overrideDefaultEmailVerification: true,
        otpLength: 6,
        expiresIn: 10 * 60,
        allowedAttempts: 5,
        sendVerificationOTP: async ({ email, otp, type }) => {
          await sendEmail(env, email, OTP_SUBJECTS[type], `Your code is ${otp}. It expires in 10 minutes.\n\nIf you did not request this, you can ignore this email.`);
        },
      }),
    ],
  });
}

export function webOrigins(env: Env) {
  return env.WEB_ORIGINS.split(',').map((origin) => origin.trim()).filter(Boolean);
}

export function parseMetadata(raw: string | null | undefined): Record<string, unknown> {
  try {
    const value = JSON.parse(raw || '{}');
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  } catch {
    return {};
  }
}

function text(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}
