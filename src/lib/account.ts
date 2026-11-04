import { supabase } from '@/lib/supabase';
import type { MembershipApplication, MembershipDetails, MembershipVerificationRequest, Profile } from '@/types/database';

export async function updateProfile(userId: string, values: Pick<Profile, 'full_name' | 'city_club' | 'avatar_url'>) {
  const { data, error } = await supabase.from('profiles').update(values).eq('id', userId).select('*').single();
  if (error) throw error;
  return data as Profile;
}

export async function uploadAvatar(userId: string, uri: string, mimeType?: string | null) {
  const contentType = mimeType && ['image/jpeg', 'image/png', 'image/webp'].includes(mimeType) ? mimeType : 'image/jpeg';
  const extension = contentType === 'image/png' ? 'png' : contentType === 'image/webp' ? 'webp' : 'jpg';
  const path = `${userId}/profile.${extension}`;
  const arrayBuffer = await fetch(uri).then((response) => response.arrayBuffer());
  if (arrayBuffer.byteLength > 5 * 1024 * 1024) throw new Error('Choose an image smaller than 5 MB.');
  const { error } = await supabase.storage.from('avatars').upload(path, arrayBuffer, { contentType, upsert: true, cacheControl: '3600' });
  if (error) throw error;
  const { data } = supabase.storage.from('avatars').getPublicUrl(path);
  return `${data.publicUrl}?v=${Date.now()}`;
}

export async function loadMembershipApplication(userId: string) {
  const { data, error } = await supabase.from('membership_applications').select('*').eq('user_id', userId).maybeSingle();
  if (error) throw error;
  return data as MembershipApplication | null;
}

export async function submitMembershipApplication(input: { userId: string; fullName: string; email: string; phone: string; city: string; occupation: string; motivation: string }) {
  const { data, error } = await supabase.from('membership_applications').insert({
    user_id: input.userId, full_name: input.fullName, email: input.email, phone: input.phone,
    city: input.city, occupation: input.occupation, motivation: input.motivation, status: 'submitted',
  }).select('*').single();
  if (error) throw error;
  return data as MembershipApplication;
}

export async function loadVerificationRequest(userId: string) {
  const { data, error } = await supabase.from('membership_verification_requests').select('*').eq('user_id', userId).maybeSingle();
  if (error) throw error;
  return data as MembershipVerificationRequest | null;
}

export async function submitVerificationRequest(input: { userId: string; email: string; phone: string; memberIdentifier: string; resubmit: boolean }) {
  const payload = { user_id: input.userId, membership_email: input.email, phone: input.phone, member_identifier: input.memberIdentifier || null, status: 'pending', submitted_at: new Date().toISOString() };
  const query = input.resubmit
    ? supabase.from('membership_verification_requests').update(payload).eq('user_id', input.userId)
    : supabase.from('membership_verification_requests').insert(payload);
  const { data, error } = await query.select('*').single();
  if (error) throw error;
  return data as MembershipVerificationRequest;
}

export type MembershipLinkResult = {
  result: 'verified' | 'inactive' | 'needs_review' | 'email_confirmation_required' | 'already_linked';
  request_status: 'pending' | 'needs_review' | 'approved' | 'rejected';
  message: string;
};

export async function requestMembershipLink(input: { email: string; memberIdentifier: string; chapter: string }) {
  const membershipEmail = input.email.trim().replace(/[.,;:]+$/, '').toLowerCase();
  const { data, error } = await supabase.rpc('submit_membership_link_request', {
    p_membership_email: membershipEmail,
    p_member_identifier: input.memberIdentifier.trim().toUpperCase(),
    p_chapter: input.chapter.trim() || null,
  });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new Error('GWMB could not process this membership request.');
  return row as MembershipLinkResult;
}

export async function loadMyMembershipDetails() {
  const { data, error } = await supabase.rpc('get_my_membership_details');
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return (row ?? null) as MembershipDetails | null;
}

export async function sendMembershipEmailCode() {
  const { data, error } = await supabase.functions.invoke('membership-email-otp', { body:{ action:'send' } });
  if (error) throw new Error((data as { error?:string } | null)?.error ?? error.message);
  if (data?.error) throw new Error(data.error as string);
  return data as { ok:true; message:string };
}

export async function verifyMembershipEmailCode(code: string) {
  const { data, error } = await supabase.functions.invoke('membership-email-otp', { body:{ action:'verify', code } });
  if (error) throw new Error((data as { error?:string } | null)?.error ?? error.message);
  if (data?.error) throw new Error(data.error as string);
  return data as { ok:true; status:'verified'|'inactive'; message:string };
}
