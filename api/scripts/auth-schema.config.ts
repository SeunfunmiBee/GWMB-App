// Used only by `npx @better-auth/cli generate` to emit the auth tables for D1.
import { DatabaseSync } from 'node:sqlite';
import { betterAuth } from 'better-auth';
import { bearer, emailOTP } from 'better-auth/plugins';
import { expo } from '@better-auth/expo';
import { authOptions } from '../src/auth-options';

export const auth = betterAuth({
  ...authOptions,
  database: new DatabaseSync(':memory:'),
  plugins: [expo(), bearer(), emailOTP({ sendVerificationOTP: async () => {}, overrideDefaultEmailVerification: true })],
});
