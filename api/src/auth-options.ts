import type { BetterAuthOptions } from 'better-auth';

// Options shared by the Worker and the schema generator (no runtime bindings here).
export const authOptions = {
  advanced: { database: { generateId: 'uuid' } },
  user: {
    additionalFields: {
      // JSON object the user may edit, mirroring Supabase `user_metadata`
      // (full_name, first_name, last_name, membership_intent, membership_email, member_identifier, chapter, city).
      // Never use it for authorization.
      metadata: { type: 'string', required: false, defaultValue: '{}' },
    },
  },
} satisfies Partial<BetterAuthOptions>;
