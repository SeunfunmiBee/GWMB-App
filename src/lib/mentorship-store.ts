import {
  demoMentors,
  demoMentorshipSessions,
  type Mentor,
  type MentorStatus,
  type MentorshipSession,
  type MentorshipType,
} from "@/data/mentorship";
import { apiCall } from "@/lib/auth";
import { supabase } from "@/lib/supabase";

export type MentorshipRegistration = {
  id: string;
  user_id: string;
  session_id: string;
  status: "registered" | "waitlisted" | "cancelled";
  attendance_status: "not_recorded" | "attended" | "absent";
  reminder_status: "scheduled" | "sent" | "not_required";
  registered_at: string;
  updated_at: string;
};
export type MentorshipInterest = {
  industry: string;
  subfield: string;
  notifications_enabled: boolean;
};

const registrationsKey = (userId: string) =>
  `gwmb-mentorship-registrations:${userId}`;
const interestsKey = (userId: string) => `gwmb-mentorship-interests:${userId}`;
const readLocal = <T>(key: string, fallback: T): T => {
  try {
    const value = globalThis.localStorage?.getItem(key);
    return value ? (JSON.parse(value) as T) : fallback;
  } catch {
    return fallback;
  }
};
const writeLocal = (key: string, value: unknown) => {
  try {
    globalThis.localStorage?.setItem(key, JSON.stringify(value));
  } catch {
    /* Best-effort offline fallback. */
  }
};
export type MentorshipApplicationStatus =
  | "submitted"
  | "under_review"
  | "more_information_required"
  | "approved"
  | "mentor_assigned"
  | "booking_access_released"
  | "not_approved"
  | "completed";
export type MentorshipApplication = {
  id: string;
  user_id: string;
  requested_mentor_id: string | null;
  assigned_mentor_id: string | null;
  recommend_for_me: boolean;
  industry: string;
  guidance_request: string;
  desired_outcome: string;
  career_stage: string;
  supporting_information: string | null;
  status: MentorshipApplicationStatus;
  admin_comments: string | null;
  preparation_instructions: string | null;
  approved_at: string | null;
  booking_link_released: boolean;
  completed_at: string | null;
  submitted_at: string;
  updated_at: string;
  requested_mentor?: Mentor | null;
  assigned_mentor?: Mentor | null;
};
export type MentorOperations = {
  mentor_id: string;
  email: string;
  phone: string | null;
  linkedin_url: string | null;
  status: MentorStatus;
  source: string;
  external_identifier: string | null;
  availability_status: "active" | "unavailable";
  preferred_frequency: string | null;
  preferred_days: string[];
  preferred_times: string[];
  general_availability: string | null;
  next_available_period: string | null;
  discovery_available: boolean;
  industry_available: boolean;
  one_on_one_available: boolean;
  one_on_one_capacity: number;
  private_booking_url: string | null;
  available_dates: string[];
  recording_consent: boolean;
  limitations: string | null;
  internal_notes: string | null;
  intake_payload: Record<string, unknown>;
  submitted_at: string;
  availability_last_confirmed_at: string | null;
  availability_confirmed_until: string | null;
  availability_confirmation_due: string | null;
  created_at: string;
  updated_at: string;
};
export type AdminMentor = Mentor & {
  operations: MentorOperations | null;
  next_session?: MentorshipSession | null;
  last_session?: MentorshipSession | null;
  assigned_one_on_one?: number;
  completed_one_on_one?: number;
};
export type MentorshipOperationsTask = {
  id: string;
  dedupe_key: string | null;
  mentor_id: string | null;
  session_id: string | null;
  kind: string;
  title: string;
  detail: string | null;
  due_at: string | null;
  priority: "normal" | "high" | "urgent";
  status: "open" | "completed" | "dismissed";
  metadata: Record<string, unknown>;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

export async function loadMentors() {
  const { data, error } = await apiCall<Mentor[]>("/v1/mentorship/mentors");
  return {
    mentors: error || !data?.length ? demoMentors : (data as Mentor[]),
    cloud: !error,
  };
}

export async function loadMentor(id: string) {
  const { data, error } = await apiCall<Mentor | null>(`/v1/mentorship/mentors/${encodeURIComponent(id)}`);
  return {
    mentor:
      error || !data
        ? (demoMentors.find((item) => item.id === id) ?? demoMentors[0])
        : (data as Mentor),
    cloud: !error,
  };
}

export async function loadMentorshipSessions() {
  const { data, error } = await apiCall<MentorshipSession[]>("/v1/mentorship/sessions");
  if (error || !data?.length)
    return { sessions: demoMentorshipSessions, cloud: false };
  return { sessions: data, cloud: true };
}

export async function loadMentorshipSession(id: string) {
  const result = await loadMentorshipSessions();
  return {
    session:
      result.sessions.find((item) => item.id === id) ??
      demoMentorshipSessions[0],
    cloud: result.cloud,
  };
}

export async function loadMentorshipRegistrations(userId: string) {
  const { data, error } = await apiCall<MentorshipRegistration[]>("/v1/mentorship/registrations");
  const local = readLocal<MentorshipRegistration[]>(
    registrationsKey(userId),
    [],
  );
  const cloud = (data ?? []) as MentorshipRegistration[];
  const merged = [
    ...cloud,
    ...local.filter(
      (item) => !cloud.some((saved) => saved.session_id === item.session_id),
    ),
  ];
  return { registrations: merged, cloud: !error };
}

export async function registerForMentorshipSession(
  userId: string,
  sessionId: string,
  status: "registered" | "waitlisted" = "registered",
) {
  // Capacity and access are decided atomically by the database. The legacy
  // arguments remain in the public helper signature so existing screens do not
  // need to predict whether a confirmed seat or waitlist place will be issued.
  void status;
  const { data, error } = await apiCall<MentorshipRegistration>(`/v1/mentorship/sessions/${encodeURIComponent(sessionId)}/register`, { method: "POST" });
  const now = new Date().toISOString();
  const registration = (data as MentorshipRegistration | null) ?? {
    id: `local-${sessionId}`,
    user_id: userId,
    session_id: sessionId,
    status: "registered",
    attendance_status: "not_recorded",
    reminder_status: "scheduled",
    registered_at: now,
    updated_at: now,
  };
  const local = readLocal<MentorshipRegistration[]>(
    registrationsKey(userId),
    [],
  ).filter((item) => item.session_id !== sessionId);
  if (!error) writeLocal(registrationsKey(userId), [registration, ...local]);
  return { registration, error };
}

export async function cancelMentorshipRegistration(
  userId: string,
  sessionId: string,
) {
  const local = readLocal<MentorshipRegistration[]>(
    registrationsKey(userId),
    [],
  ).map((item) =>
    item.session_id === sessionId
      ? {
          ...item,
          status: "cancelled" as const,
          updated_at: new Date().toISOString(),
        }
      : item,
  );
  writeLocal(registrationsKey(userId), local);
  return apiCall<MentorshipRegistration>(`/v1/mentorship/sessions/${encodeURIComponent(sessionId)}/cancel`, { method: "POST" });
}

export async function loadIndustryInterests(userId: string) {
  const local = readLocal<MentorshipInterest[]>(interestsKey(userId), []);
  const { data, error } = await apiCall<MentorshipInterest[]>("/v1/mentorship/interests");
  return {
    interests: error ? local : ((data ?? local) as MentorshipInterest[]),
    error,
  };
}

export async function saveIndustryInterest(
  userId: string,
  industry: string,
  subfield = "",
) {
  const interest = { industry, subfield, notifications_enabled: true };
  const local = readLocal<MentorshipInterest[]>(
    interestsKey(userId),
    [],
  ).filter(
    (item) => !(item.industry === industry && item.subfield === subfield),
  );
  writeLocal(interestsKey(userId), [interest, ...local]);
  return apiCall("/v1/mentorship/interests", { method: "PUT", body: JSON.stringify(interest) });
}

export async function loadMentorshipApplications(userId: string) {
  const { data, error } = await apiCall<MentorshipApplication[]>("/v1/mentorship/applications");
  const applications = (data ?? []).map((row) =>
    row.status === "booking_access_released"
      ? { ...row, status: "approved" }
      : row,
  ) as MentorshipApplication[];
  return { applications, cloud: !error };
}

export async function submitMentorshipApplication(
  input: Omit<
    MentorshipApplication,
    | "id"
    | "status"
    | "admin_comments"
    | "preparation_instructions"
    | "approved_at"
    | "booking_link_released"
    | "completed_at"
    | "submitted_at"
    | "updated_at"
    | "requested_mentor"
    | "assigned_mentor"
  >,
) {
  const { data, error } = await apiCall<MentorshipApplication>("/v1/mentorship/applications", {
    method: "POST",
    body: JSON.stringify({
      requested_mentor_id: input.requested_mentor_id,
      recommend_for_me: input.recommend_for_me,
      industry: input.industry,
      guidance_request: input.guidance_request,
      desired_outcome: input.desired_outcome,
      career_stage: input.career_stage,
      supporting_information: input.supporting_information,
    }),
  });
  return { application: data as MentorshipApplication | null, error };
}

export async function getApprovedBookingLink(applicationId: string) {
  const { data, error } = await apiCall<{ booking_url: string | null }>(`/v1/mentorship/applications/${applicationId}/booking`);
  return { bookingUrl: data?.booking_url ?? null, error };
}

export async function isMentorshipAdmin() {
  const { data, error } = await apiCall<{ isAdmin: boolean }>("/v1/me");
  return { isAdmin: data?.isAdmin === true, error };
}
export async function loadAdminMentorship() {
  const { data: admin, error } = await apiCall<{
    applications: MentorshipApplication[];
    mentors: Mentor[];
    operations: MentorOperations[];
    sessions: MentorshipSession[];
    sessionMentors: { session_id: string; mentor_id: string }[];
    registrations: MentorshipRegistration[];
    tasks: MentorshipOperationsTask[];
  }>("/v1/admin/mentorship");
  const sessionRows = admin?.sessions ?? [];
  const links = admin?.sessionMentors ?? [];
  const appRows = admin?.applications ?? [];
  const opsRows = admin?.operations ?? [];
  const mentorRows = (admin?.mentors ?? []).map((mentor) => {
    const item = mentor as Mentor;
    const mentorSessions = sessionRows.filter((session) =>
      links.some(
        (link) => link.mentor_id === item.id && link.session_id === session.id,
      ),
    );
    return {
      ...item,
      operations: opsRows.find((op) => op.mentor_id === item.id) ?? null,
      next_session:
        mentorSessions
          .filter(
            (session) =>
              !["completed", "cancelled"].includes(session.status) &&
              new Date(session.starts_at).getTime() >= Date.now(),
          )
          .sort(
            (a, b) =>
              new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime(),
          )[0] ?? null,
      last_session:
        mentorSessions
          .filter(
            (session) =>
              session.status === "completed" ||
              new Date(session.starts_at).getTime() < Date.now(),
          )
          .sort(
            (a, b) =>
              new Date(b.starts_at).getTime() - new Date(a.starts_at).getTime(),
          )[0] ?? null,
      assigned_one_on_one: appRows.filter(
        (application) =>
          application.assigned_mentor_id === item.id &&
          !["completed", "not_approved"].includes(application.status),
      ).length,
      completed_one_on_one: appRows.filter(
        (application) =>
          application.assigned_mentor_id === item.id &&
          application.status === "completed",
      ).length,
    } satisfies AdminMentor;
  });
  const priority = { urgent: 0, high: 1, normal: 2 };
  const taskRows = [...(admin?.tasks ?? [])].sort(
    (a, b) =>
      priority[a.priority] - priority[b.priority] ||
      (a.due_at ? new Date(a.due_at).getTime() : Number.MAX_SAFE_INTEGER) -
        (b.due_at ? new Date(b.due_at).getTime() : Number.MAX_SAFE_INTEGER),
  );
  return {
    applications: appRows,
    mentors: mentorRows,
    sessions: sessionRows,
    sessionMentors: links,
    registrations: admin?.registrations ?? [],
    tasks: taskRows,
    error,
  };
}
export async function updateMentorshipApplication(
  id: string,
  patch: {
    status?: MentorshipApplicationStatus;
    assigned_mentor_id?: string | null;
    admin_comments?: string | null;
    preparation_instructions?: string | null;
    booking_link_released?: boolean;
    approved_at?: string | null;
    completed_at?: string | null;
  },
) {
  return apiCall(`/v1/admin/mentorship/applications/${id}`, { method: "PATCH", body: JSON.stringify(patch) });
}
export async function saveMentor(input: {
  id: string;
  full_name: string;
  photo_url?: string | null;
  job_title: string;
  organisation: string;
  bio: string;
  industry: string;
  subfields?: string[];
  expertise: string[];
  guidance_topics: string[];
  mentorship_types: MentorshipType[];
  active: boolean;
  publish_public_profile?: boolean;
  booking_url?: string;
}) {
  return apiCall("/v1/admin/mentorship/mentors", { method: "PUT", body: JSON.stringify(input) });
}
export async function saveMentorOperations(
  input: Partial<MentorOperations> & { mentor_id: string; email: string },
) {
  const { mentor_id, ...operations } = input;
  return apiCall(`/v1/admin/mentorship/mentors/${encodeURIComponent(mentor_id)}/operations`, { method: "PUT", body: JSON.stringify(operations) });
}
export async function setMentorStatus(mentorId: string, status: MentorStatus) {
  return apiCall(`/v1/admin/mentorship/mentors/${encodeURIComponent(mentorId)}/status`, { method: "POST", body: JSON.stringify({ status }) });
}
export async function setMentorPublished(mentorId: string, published: boolean) {
  return apiCall(`/v1/admin/mentorship/mentors/${encodeURIComponent(mentorId)}/publish`, { method: "POST", body: JSON.stringify({ published }) });
}
export async function saveMentorshipSession(
  input: MentorshipSession & { mentor_id?: string },
) {
  // Lifecycle timestamps are stamped by the API.
  const { mentors: _, registration_count: __, ...session } = input;
  return apiCall<MentorshipSession>("/v1/admin/mentorship/sessions", { method: "PUT", body: JSON.stringify(session) });
}
export async function updateMentorshipAttendance(
  id: string,
  attendance_status: "attended" | "absent",
) {
  return apiCall(`/v1/admin/mentorship/registrations/${id}/attendance`, { method: "PATCH", body: JSON.stringify({ attendance_status }) });
}
export async function completeMentorshipTask(id: string) {
  return apiCall(`/v1/admin/mentorship/tasks/${id}/complete`, { method: "POST" });
}
export async function importMentorSubmission(
  data: Record<string, unknown>,
  formType: "mentor_application" | "mentor_availability" = "mentor_application",
) {
  return supabase.functions.invoke("mentor-intake", {
    body: { source: "admin_excel", form_type: formType, data },
  });
}
