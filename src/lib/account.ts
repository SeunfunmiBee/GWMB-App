import { apiFetch } from '@/lib/auth';
import { publicUrl, uploadFile } from '@/lib/storage';
import type { MembershipApplication, MembershipDetails, MembershipVerificationRequest, Profile } from '@/types/database';

// Account and membership data from the GWMB API (api/src/routes/me.ts, membership.ts).

export async function updateProfile(_userId: string, values: Pick<Profile, 'full_name' | 'city_club' | 'avatar_url'>) {
  return apiFetch<Profile>('/v1/me/profile', { method: 'PATCH', body: JSON.stringify(values) });
}

export async function uploadAvatar(userId: string, uri: string, mimeType?: string | null) {
  const contentType = mimeType && ['image/jpeg', 'image/png', 'image/webp'].includes(mimeType) ? mimeType : 'image/jpeg';
  const extension = contentType === 'image/png' ? 'png' : contentType === 'image/webp' ? 'webp' : 'jpg';
  const path = `${userId}/profile.${extension}`;
  const blob = await fetch(uri).then((response) => response.blob());
  if (blob.size > 5 * 1024 * 1024) throw new Error('Choose an image smaller than 5 MB.');
  await uploadFile('avatars', path, blob, { contentType, upsert: true });
  return `${publicUrl('avatars', path)}?v=${Date.now()}`;
}

export async function loadMembershipApplication(_userId: string) {
  return apiFetch<MembershipApplication | null>('/v1/membership/application');
}

export async function submitMembershipApplication(input: { userId: string; fullName: string; email: string; phone: string; city: string; occupation: string; motivation: string }) {
  const { userId: _userId, ...application } = input;
  return apiFetch<MembershipApplication>('/v1/membership/application', { method: 'POST', body: JSON.stringify(application) });
}

export async function loadVerificationRequest(_userId: string) {
  return apiFetch<MembershipVerificationRequest | null>('/v1/membership/verification-request');
}

export type MembershipLinkResult = {
  result: 'verified' | 'inactive' | 'needs_review' | 'email_confirmation_required' | 'already_linked';
  request_status: 'pending' | 'needs_review' | 'approved' | 'rejected';
  message: string;
};

export async function requestMembershipLink(input: { email: string; memberIdentifier: string; chapter: string }) {
  return apiFetch<MembershipLinkResult>('/v1/membership/link', {
    method: 'POST',
    body: JSON.stringify({ membershipEmail: input.email, memberIdentifier: input.memberIdentifier.trim().toUpperCase(), chapter: input.chapter.trim() || null }),
  });
}

export async function loadMyMembershipDetails() {
  return apiFetch<MembershipDetails | null>('/v1/membership/details');
}

export async function sendMembershipEmailCode() {
  return apiFetch<{ ok: true; message: string }>('/v1/membership/email-code/send', { method: 'POST' });
}

export async function verifyMembershipEmailCode(code: string) {
  return apiFetch<{ ok: true; status: 'verified' | 'inactive'; message: string }>('/v1/membership/email-code/verify', { method: 'POST', body: JSON.stringify({ code }) });
}
