import {
  demoMentors,
  demoMentorshipSessions,
  type Mentor,
  type MentorStatus,
  type MentorshipSession,
  type MentorshipType,
} from "@/data/mentorship";
import { supabase } from "@/lib/supabase";

const publicSessionColumns =
  "id,title,mentorship_type,industry,subfield,description,starts_at,registration_deadline,capacity,access_level,replay_url,resources,eligibility,status,timezone,recording_allowed,published_at,completed_at,cancelled_at,audience_type,audience_fields,audience_subfields,selected_user_ids,notification_channels,distribution_surfaces,feature_level,mentor_confirmed_at,attendance_recorded_at,replay_expected,created_at,updated_at";
const ADMIN_NETWORK_LIMIT = 500;

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
  const { data, error } = await supabase
    .from("mentors")
    .select(
      "id,full_name,photo_url,job_title,organisation,bio,industry,subfields,expertise,guidance_topics,mentorship_types,active,publish_public_profile",
    )
    .eq("active", true)
    .eq("publish_public_profile", true)
    .order("full_name");
  return {
    mentors: error || !data?.length ? demoMentors : (data as Mentor[]),
    cloud: !error,
  };
}

export async function loadMentor(id: string) {
  const { data, error } = await supabase
    .from("mentors")
    .select(
      "id,full_name,photo_url,job_title,organisation,bio,industry,subfields,expertise,guidance_topics,mentorship_types,active,publish_public_profile",
    )
    .eq("id", id)
    .eq("publish_public_profile", true)
    .maybeSingle();
  return {
    mentor:
      error || !data
        ? (demoMentors.find((item) => item.id === id) ?? demoMentors[0])
        : (data as Mentor),
    cloud: !error,
  };
}

export async function loadMentorshipSessions() {
  const { data, error } = await supabase
    .from("mentorship_sessions")
    .select(
      `${publicSessionColumns},mentorship_session_mentors(mentor:mentors(id,full_name,photo_url,job_title,organisation,bio,industry,expertise,guidance_topics,mentorship_types,active))`,
    )
    .in("status", ["published", "upcoming", "live", "completed"])
    .order("starts_at");
  if (error || !data?.length)
    return { sessions: demoMentorshipSessions, cloud: false };
  const sessions = data.map((row: Record<string, unknown>) => ({
    ...row,
    mentors: (
      (row.mentorship_session_mentors as { mentor: Mentor }[] | undefined) ?? []
    ).map((item) => item.mentor),
  })) as MentorshipSession[];
  return { sessions, cloud: true };
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
  const { data, error } = await supabase
    .from("mentorship_registrations")
    .select("*")
    .eq("user_id", userId)
    .order("registered_at", { ascending: false });
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
  const { data, error } = await supabase.rpc(
    "register_for_mentorship_session",
    { p_session_id: sessionId },
  );
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
  return supabase
    .from("mentorship_registrations")
    .update({ status: "cancelled" })
    .eq("user_id", userId)
    .eq("session_id", sessionId);
}

export async function loadIndustryInterests(userId: string) {
  const local = readLocal<MentorshipInterest[]>(interestsKey(userId), []);
  const { data, error } = await supabase
    .from("mentorship_industry_interests")
    .select("industry,subfield,notifications_enabled")
    .eq("user_id", userId);
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
  const result = await supabase
    .from("mentorship_industry_interests")
    .upsert(
      { user_id: userId, ...interest },
      { onConflict: "user_id,industry,subfield" },
    );
  return result.error?.message.includes("subfield")
    ? supabase
        .from("mentorship_industry_interests")
        .upsert(
          { user_id: userId, industry, notifications_enabled: true },
          { onConflict: "user_id,industry" },
        )
    : result;
}

export async function loadMentorshipApplications(userId: string) {
  const { data, error } = await supabase
    .from("mentorship_applications")
    .select(
      "*,requested_mentor:mentors!mentorship_applications_requested_mentor_id_fkey(*),assigned_mentor:mentors!mentorship_applications_assigned_mentor_id_fkey(*)",
    )
    .eq("user_id", userId)
    .order("submitted_at", { ascending: false });
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
  const { data, error } = await supabase.rpc("submit_mentorship_application", {
    p_requested_mentor_id: input.requested_mentor_id,
    p_recommend_for_me: input.recommend_for_me,
    p_industry: input.industry,
    p_guidance_request: input.guidance_request,
    p_desired_outcome: input.desired_outcome,
    p_career_stage: input.career_stage,
    p_supporting_information: input.supporting_information,
  });
  return { application: data as MentorshipApplication | null, error };
}

export async function getApprovedBookingLink(applicationId: string) {
  const { data, error } = await supabase.rpc(
    "get_approved_mentorship_booking",
    { p_application_id: applicationId },
  );
  return {
    bookingUrl:
      (data?.[0] as { booking_url?: string } | undefined)?.booking_url ?? null,
    error,
  };
}

export async function isMentorshipAdmin() {
  const { data, error } = await supabase.rpc("is_app_admin");
  return { isAdmin: Boolean(data), error };
}
export async function loadAdminMentorship() {
  await supabase.rpc("refresh_mentorship_operations_tasks");
  const [
    applications,
    mentors,
    operations,
    sessions,
    sessionMentors,
    registrations,
    tasks,
  ] = await Promise.all([
    supabase
      .from("mentorship_applications")
      .select("*")
      .order("submitted_at", { ascending: false })
      .limit(ADMIN_NETWORK_LIMIT),
    supabase
      .from("mentors")
      .select("*")
      .order("full_name")
      .limit(ADMIN_NETWORK_LIMIT),
    supabase
      .from("mentor_operations")
      .select("*")
      .order("submitted_at", { ascending: false })
      .limit(ADMIN_NETWORK_LIMIT),
    supabase.rpc("admin_list_mentorship_sessions").limit(ADMIN_NETWORK_LIMIT),
    supabase
      .from("mentorship_session_mentors")
      .select("*")
      .limit(ADMIN_NETWORK_LIMIT * 2),
    supabase
      .from("mentorship_registrations")
      .select("*")
      .order("registered_at", { ascending: false })
      .limit(ADMIN_NETWORK_LIMIT * 2),
    supabase
      .from("mentorship_operations_tasks")
      .select("*")
      .eq("status", "open")
      .order("due_at", { ascending: true })
      .limit(100),
  ]);
  const sessionRows = (sessions.data ?? []) as MentorshipSession[];
  const links = (sessionMentors.data ?? []) as {
    session_id: string;
    mentor_id: string;
  }[];
  const appRows = (applications.data ?? []) as MentorshipApplication[];
  const opsRows = (operations.data ?? []) as MentorOperations[];
  const mentorRows = (mentors.data ?? []).map((mentor) => {
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
  const taskRows = ((tasks.data ?? []) as MentorshipOperationsTask[]).sort(
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
    registrations: (registrations.data ?? []) as MentorshipRegistration[],
    tasks: taskRows,
    error:
      applications.error ??
      mentors.error ??
      operations.error ??
      sessions.error ??
      sessionMentors.error ??
      registrations.error ??
      tasks.error,
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
  return supabase.from("mentorship_applications").update(patch).eq("id", id);
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
  const { booking_url, ...mentor } = input;
  const result = await supabase
    .from("mentors")
    .upsert(mentor, { onConflict: "id" });
  if (!result.error && booking_url)
    await supabase
      .from("mentorship_booking_links")
      .upsert(
        { mentor_id: input.id, booking_url },
        { onConflict: "mentor_id" },
      );
  return result;
}
export async function saveMentorOperations(
  input: Partial<MentorOperations> & { mentor_id: string; email: string },
) {
  const result = await supabase
    .from("mentor_operations")
    .upsert(input, { onConflict: "mentor_id" });
  if (!result.error && input.private_booking_url)
    await supabase
      .from("mentorship_booking_links")
      .upsert(
        { mentor_id: input.mentor_id, booking_url: input.private_booking_url },
        { onConflict: "mentor_id" },
      );
  return result;
}
export async function setMentorStatus(mentorId: string, status: MentorStatus) {
  const result = await supabase
    .from("mentor_operations")
    .update({ status })
    .eq("mentor_id", mentorId);
  if (!result.error)
    await supabase
      .from("mentors")
      .update({ active: status === "active" || status === "confirmed" })
      .eq("id", mentorId);
  return result;
}
export async function setMentorPublished(mentorId: string, published: boolean) {
  return supabase
    .from("mentors")
    .update(
      published
        ? { publish_public_profile: true, active: true }
        : { publish_public_profile: false },
    )
    .eq("id", mentorId);
}
export async function saveMentorshipSession(
  input: MentorshipSession & { mentor_id?: string },
) {
  const { mentor_id, mentors: _, registration_count: __, ...session } = input;
  const lifecycle = {
    ...session,
    published_at:
      session.status === "published" || session.status === "upcoming"
        ? session.published_at || new Date().toISOString()
        : session.published_at,
    completed_at:
      session.status === "completed"
        ? session.completed_at || new Date().toISOString()
        : session.completed_at,
    cancelled_at:
      session.status === "cancelled" ? new Date().toISOString() : undefined,
  };
  const result = await supabase
    .from("mentorship_sessions")
    .upsert(lifecycle, { onConflict: "id" });
  if (!result.error && mentor_id)
    await supabase
      .from("mentorship_session_mentors")
      .upsert(
        { session_id: input.id, mentor_id },
        { onConflict: "session_id,mentor_id" },
      );
  return result;
}
export async function updateMentorshipAttendance(
  id: string,
  attendance_status: "attended" | "absent",
) {
  const result = await supabase
    .from("mentorship_registrations")
    .update({ attendance_status })
    .eq("id", id);
  return result;
}
export async function completeMentorshipTask(id: string) {
  return supabase
    .from("mentorship_operations_tasks")
    .update({ status: "completed", completed_at: new Date().toISOString() })
    .eq("id", id);
}
export async function importMentorSubmission(
  data: Record<string, unknown>,
  formType: "mentor_application" | "mentor_availability" = "mentor_application",
) {
  return supabase.functions.invoke("mentor-intake", {
    body: { source: "admin_excel", form_type: formType, data },
  });
}
