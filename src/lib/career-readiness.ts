import { listPublishedContent, type ContentItem } from "@/lib/admin-content";
import { supabase } from "@/lib/supabase";

export type ReviewType =
  "cv" | "linkedin" | "job_application" | "career_profile";
export type ReviewStatus =
  "submitted" | "under_review" | "selected" | "reviewed" | "not_selected";
export type CareerReviewSubmission = {
  id: string;
  user_id: string;
  review_type: ReviewType;
  cv_record_id: string | null;
  uploaded_file_path: string | null;
  uploaded_file_name: string | null;
  linkedin_url: string | null;
  target_role: string | null;
  company_name: string | null;
  job_description_url: string | null;
  job_description_text: string | null;
  career_field: string | null;
  career_stage: string | null;
  feedback_focus: string | null;
  clinic_event_id: string | null;
  future_clinic_interest: boolean;
  consent_authorized_review: boolean;
  consent_group_review: boolean;
  anonymize_for_session: boolean;
  status: ReviewStatus;
  admin_feedback: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
};
export type PracticeResponse = {
  id: string;
  user_id: string;
  question_id: string;
  response_text: string;
  updated_at: string;
};
export type InterviewQuestion = {
  id: string;
  category: string;
  question: string;
  guidance: string;
  framework?: string;
  careerAreas?: string[];
};

export async function loadInterviewQuestions() {
  const { data, error } = await supabase
    .from("career_practice_questions")
    .select("id,category,question,guidance,framework,career_areas,sort_order")
    .eq("active", true)
    .order("sort_order");
  return {
    questions: (data ?? []).map((item) => ({
      id: item.id,
      category: item.category,
      question: item.question,
      guidance: item.guidance,
      framework: item.framework ?? undefined,
      careerAreas: item.career_areas ?? [],
    })) as InterviewQuestion[],
    error,
  };
}
export async function listAdminInterviewQuestions() {
  const { data, error } = await supabase
    .from("career_practice_questions")
    .select("*")
    .order("sort_order");
  return {
    questions: (data ?? []) as (InterviewQuestion & {
      sort_order: number;
      active: boolean;
      career_areas: string[];
    })[],
    error,
  };
}
export async function saveInterviewQuestion(
  input: InterviewQuestion & { sort_order?: number; active?: boolean },
) {
  return supabase
    .from("career_practice_questions")
    .upsert(
      {
        id: input.id,
        category: input.category,
        question: input.question,
        guidance: input.guidance,
        framework: input.framework ?? null,
        career_areas: input.careerAreas ?? [],
        sort_order: input.sort_order ?? 0,
        active: input.active ?? true,
      },
      { onConflict: "id" },
    )
    .select("*")
    .single();
}
export async function deleteInterviewQuestion(id: string) {
  return supabase.from("career_practice_questions").delete().eq("id", id);
}

function metadata(item: ContentItem) {
  return item.metadata ?? {};
}
export function isCareerReadinessItem(item: ContentItem) {
  const meta = metadata(item);
  return (
    meta.program === "career-support" ||
    meta.program === "career-readiness" ||
    meta.module === "career-readiness" ||
    meta.category === "career-readiness"
  );
}
export async function loadCareerInventory() {
  const [eventsResult, resourcesResult] = await Promise.all([
    listPublishedContent("events"),
    listPublishedContent("resources"),
  ]);
  const events = eventsResult.data
    .filter(isCareerReadinessItem)
    .filter((item) => item.visible !== false);
  const resources = resourcesResult.data
    .filter(isCareerReadinessItem)
    .filter((item) => item.visible !== false);
  const now = Date.now();
  const upcoming = events
    .filter(
      (item) =>
        item.starts_at &&
        new Date(item.starts_at).getTime() + 2 * 60 * 60 * 1000 >= now,
    )
    .sort(
      (a, b) =>
        new Date(a.starts_at!).getTime() - new Date(b.starts_at!).getTime(),
    );
  const replays = events
    .filter(
      (item) =>
        typeof metadata(item).replay_url === "string" &&
        String(metadata(item).replay_url).trim(),
    )
    .sort(
      (a, b) =>
        new Date(b.starts_at ?? b.updated_at).getTime() -
        new Date(a.starts_at ?? a.updated_at).getTime(),
    );
  return {
    upcoming,
    replays,
    resources,
    error: eventsResult.error ?? resourcesResult.error,
  };
}

export async function loadReviewSubmissions(userId: string) {
  const { data, error } = await supabase
    .from("career_review_submissions")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  return { submissions: (data ?? []) as CareerReviewSubmission[], error };
}
export async function createReviewSubmission(
  input: Omit<
    CareerReviewSubmission,
    | "id"
    | "status"
    | "admin_feedback"
    | "reviewed_at"
    | "created_at"
    | "updated_at"
  >,
) {
  return supabase.rpc("submit_career_review", {
    p_review_type: input.review_type,
    p_cv_record_id: input.cv_record_id,
    p_uploaded_file_path: input.uploaded_file_path,
    p_uploaded_file_name: input.uploaded_file_name,
    p_linkedin_url: input.linkedin_url,
    p_target_role: input.target_role,
    p_company_name: input.company_name,
    p_job_description_url: input.job_description_url,
    p_job_description_text: input.job_description_text,
    p_career_field: input.career_field,
    p_career_stage: input.career_stage,
    p_feedback_focus: input.feedback_focus,
    p_clinic_event_id: input.clinic_event_id,
    p_consent_authorized_review: input.consent_authorized_review,
    p_consent_group_review: input.consent_group_review,
    p_anonymize_for_session: input.anonymize_for_session,
  });
}
export async function loadPracticeResponses(userId: string) {
  const { data, error } = await supabase
    .from("career_practice_responses")
    .select("*")
    .eq("user_id", userId);
  return { responses: (data ?? []) as PracticeResponse[], error };
}
export async function savePracticeResponse(
  userId: string,
  questionId: string,
  responseText: string,
) {
  return supabase
    .from("career_practice_responses")
    .upsert(
      {
        user_id: userId,
        question_id: questionId,
        response_text: responseText,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,question_id" },
    )
    .select("*")
    .single();
}
export async function loadSavedCareerResources(userId: string) {
  const { data, error } = await supabase
    .from("career_saved_resources")
    .select("content_id")
    .eq("user_id", userId);
  return { ids: (data ?? []).map((item) => String(item.content_id)), error };
}
export async function toggleSavedCareerResource(
  userId: string,
  contentId: string,
  saved: boolean,
) {
  return saved
    ? supabase
        .from("career_saved_resources")
        .delete()
        .eq("user_id", userId)
        .eq("content_id", contentId)
    : supabase
        .from("career_saved_resources")
        .insert({ user_id: userId, content_id: contentId });
}
export async function listAdminReviewSubmissions(
  options: {
    page?: number;
    pageSize?: number;
    status?: "all" | ReviewStatus;
    query?: string;
  } = {},
) {
  const page = Math.max(0, options.page ?? 0);
  const pageSize = Math.min(100, Math.max(10, options.pageSize ?? 25));
  const from = page * pageSize;
  let request = supabase
    .from("career_review_submissions")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false });
  if (options.status && options.status !== "all")
    request = request.eq("status", options.status);
  const term = (options.query ?? "").replace(/[^a-zA-Z0-9 _-]/g, " ").trim();
  if (term)
    request = request.or(
      `target_role.ilike.%${term}%,career_field.ilike.%${term}%,review_type.ilike.%${term}%`,
    );
  const { data, error, count } = await request.range(from, from + pageSize - 1);
  return {
    submissions: (data ?? []) as CareerReviewSubmission[],
    total: count ?? 0,
    hasMore: from + (data?.length ?? 0) < (count ?? 0),
    error,
  };
}
export async function loadAdminReviewCounts() {
  const statuses: ReviewStatus[] = [
    "submitted",
    "under_review",
    "selected",
    "reviewed",
    "not_selected",
  ];
  const results = await Promise.all(
    statuses.map((status) =>
      supabase
        .from("career_review_submissions")
        .select("id", { count: "exact", head: true })
        .eq("status", status),
    ),
  );
  return {
    counts: statuses.reduce<Record<ReviewStatus, number>>(
      (next, status, index) => ({
        ...next,
        [status]: results[index].count ?? 0,
      }),
      {
        submitted: 0,
        under_review: 0,
        selected: 0,
        reviewed: 0,
        not_selected: 0,
      },
    ),
    error: results.find((result) => result.error)?.error ?? null,
  };
}
export async function updateReviewSubmission(
  id: string,
  change: {
    status?: ReviewStatus;
    admin_feedback?: string;
    clinic_event_id?: string | null;
    anonymize_for_session?: boolean;
  },
) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return supabase
    .from("career_review_submissions")
    .update({
      ...change,
      reviewed_by: change.status === "reviewed" ? user?.id : undefined,
    })
    .eq("id", id)
    .select("*")
    .single();
}
export async function getReviewDocumentUrl(submission: CareerReviewSubmission) {
  if (submission.uploaded_file_path) {
    const { data, error } = await supabase.storage
      .from("private-cvs")
      .createSignedUrl(submission.uploaded_file_path, 60 * 15);
    return { url: data?.signedUrl ?? null, error };
  }
  if (submission.cv_record_id) {
    const { data: cv, error } = await supabase
      .from("cv_records")
      .select("original_file_path,generated_file_path")
      .eq("id", submission.cv_record_id)
      .maybeSingle();
    if (error) return { url: null, error };
    const path = cv?.generated_file_path || cv?.original_file_path;
    if (!path) return { url: null, error: null };
    const signed = await supabase.storage
      .from("private-cvs")
      .createSignedUrl(path, 60 * 15);
    return { url: signed.data?.signedUrl ?? null, error: signed.error };
  }
  return { url: null, error: null };
}
