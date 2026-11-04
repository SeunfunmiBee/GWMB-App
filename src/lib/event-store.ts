import { supabase } from '@/lib/supabase';

export type EventRegistrationStatus = 'registered' | 'waitlisted' | 'cancelled';
export type EventRegistration = {
  id: string;
  user_id: string;
  event_id: string;
  event_title: string | null;
  event_starts_at: string | null;
  event_route: string | null;
  full_name: string;
  email: string;
  learning_goal: string | null;
  status: EventRegistrationStatus;
  registered_at: string;
  updated_at: string;
};

export type EventMeetingAccess={
  meeting_url:string|null;
  starts_at:string;
  available_at:string;
  closes_at:string;
  join_available:boolean;
  unavailable_reason:string|null;
};

const registrationsKey = (userId: string) => `gwmb-event-registrations:${userId}`;

function readJson<T>(key: string, fallback: T): T {
  try { const value = globalThis.localStorage?.getItem(key); return value ? JSON.parse(value) as T : fallback; }
  catch { return fallback; }
}
function writeJson(key: string, value: unknown) {
  try { globalThis.localStorage?.setItem(key, JSON.stringify(value)); } catch { /* Device fallback is best effort. */ }
}

export async function loadEventRegistrations(userId: string) {
  const local = readJson<EventRegistration[]>(registrationsKey(userId), []);
  const { data, error } = await supabase.from('event_registrations').select('*').eq('user_id', userId).order('registered_at', { ascending: false });
  if (error) return { registrations: local, cloud: false };
  const registrations = (data ?? []) as EventRegistration[];
  writeJson(registrationsKey(userId), registrations);
  return { registrations, cloud: true };
}

export async function loadEventRegistration(userId: string, eventId: string) {
  const local = readJson<EventRegistration[]>(registrationsKey(userId), []).find((item) => item.event_id === eventId) ?? null;
  const { data, error } = await supabase.from('event_registrations').select('*').eq('user_id', userId).eq('event_id', eventId).maybeSingle();
  if (error) return { registration: local, cloud: false };
  const registration = data as EventRegistration | null;
  if (registration) {
    const current = readJson<EventRegistration[]>(registrationsKey(userId), []).filter((item) => item.event_id !== eventId);
    writeJson(registrationsKey(userId), [registration, ...current]);
  }
  return { registration, cloud: true };
}

export async function loadRegisteredEventMeeting(eventId:string){
  const{data,error}=await supabase.rpc('get_registered_event_meeting',{p_event_id:eventId});
  const access=Array.isArray(data)?data[0]??null:data??null;
  return{access:access as EventMeetingAccess|null,error};
}

export async function registerForEvent(input: { userId: string; eventId: string; eventTitle?: string; eventStartsAt?: string; eventRoute?: string; fullName: string; email: string; learningGoal: string; status: Exclude<EventRegistrationStatus, 'cancelled'> }) {
  const current = readJson<EventRegistration[]>(registrationsKey(input.userId), []);
  const existing = current.find((item) => item.event_id === input.eventId);
  if (existing && existing.status !== 'cancelled') return { ok: false as const, duplicate: true as const, cloud: true, registration: existing, error: null };
  const { data, error } = await supabase.rpc('register_for_event', {
    p_event_id: input.eventId,
    p_full_name: input.fullName,
    p_email: input.email,
    p_learning_goal: input.learningGoal || null,
  });
  if (error || !data) return { ok: false as const, duplicate: false as const, cloud: false, registration: null, error };
  const registration = data as EventRegistration;
  const next = [registration, ...current.filter((item) => item.event_id !== input.eventId)];
  writeJson(registrationsKey(input.userId), next);
  return { ok: true as const, duplicate: false as const, cloud: true, registration, error: null };
}

export async function cancelEventRegistration(userId: string, eventId: string) {
  const current = readJson<EventRegistration[]>(registrationsKey(userId), []);
  const existing = current.find((item) => item.event_id === eventId);
  if (!existing) return { ok: false as const, cloud: false };
  const updated = { ...existing, status: 'cancelled' as const, updated_at: new Date().toISOString() };
  writeJson(registrationsKey(userId), [updated, ...current.filter((item) => item.event_id !== eventId)]);
  const { error } = await supabase.from('event_registrations').update({ status: 'cancelled' }).eq('user_id', userId).eq('event_id', eventId);
  return { ok: true as const, cloud: !error, registration: updated };
}
