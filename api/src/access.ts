// Shared read rules for member-facing content (content_items SELECT policies, mentorship_sessions SELECT policies).
import type { Env } from './env';
import { isAdmin, isVerifiedMember } from './identity';

export type Level = 'open' | 'account' | 'members' | 'admin';

/** Access levels a caller may read: anon -> open; signed in -> +account; verified member -> +members; admin -> all. */
export async function readableLevels(env: Env, userId: string | undefined): Promise<Level[]> {
  if (!userId) return ['open'];
  const caller = { kind: 'user' as const, id: userId, email: '' };
  if (await isAdmin(env, caller)) return ['open', 'account', 'members', 'admin'];
  return (await isVerifiedMember(env, caller)) ? ['open', 'account', 'members'] : ['open', 'account'];
}

// Fields that must never reach members through content or calendar reads. The meeting link is only
// released by GET /v1/events/:id/meeting inside the join window; admins read full rows via /v1/admin/*.
const PRIVATE_KEYS = ['meeting_url', 'host_url', 'private_booking_url'];

export function publicMetadata(metadata: unknown): Record<string, unknown> {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return {};
  return Object.fromEntries(Object.entries(metadata as Record<string, unknown>).filter(([key]) => !PRIVATE_KEYS.includes(key)));
}

/** A content row as members may see it. */
export function publicContent<T extends { metadata?: unknown }>(row: T): T {
  return { ...row, metadata: publicMetadata(row.metadata) };
}
