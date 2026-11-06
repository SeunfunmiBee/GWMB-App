import { listPublishedContent, type ContentItem } from "@/lib/admin-content";
import { createSignedUrl } from "@/lib/storage";
import { apiCall } from "@/lib/auth";

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

export const interviewQuestions: InterviewQuestion[] = [
  {
    id: "tell-me-about-yourself",
    category: "General Interview Questions",
    question: "Tell me about yourself.",
    guidance:
      "Connect where you are now, the evidence that supports your direction and why this opportunity is the logical next step.",
    framework: "Present → Past → Future",
  },
  {
    id: "why-this-role",
    category: "Career Motivation & Goals",
    question: "Why are you interested in this role?",
    guidance:
      "Show that you understand the work, connect it to your strengths and explain the contribution you hope to make.",
  },
  {
    id: "challenge-overcame",
    category: "Behavioural Questions",
    question: "Tell me about a challenge you overcame.",
    guidance:
      "Choose a real example and make your actions and the result specific.",
    framework: "STAR · Situation → Task → Action → Result",
  },
  {
    id: "worked-in-team",
    category: "Behavioural Questions",
    question: "Describe a time you worked in a team.",
    guidance:
      "Explain your personal contribution, how you worked with others and what the team achieved.",
    framework: "STAR · Situation → Task → Action → Result",
  },
  {
    id: "strengths-weaknesses",
    category: "General Interview Questions",
    question: "What are your strengths and weaknesses?",
    guidance:
      "Support your strength with evidence. Choose an honest development area and show what you are doing about it.",
  },
  {
    id: "why-hire-you",
    category: "Internship & Graduate Interviews",
    question: "Why should we hire you?",
    guidance:
      "Match two or three relevant strengths to what the role needs. Use evidence from projects, volunteering, school or work.",
  },
  {
    id: "limited-experience",
    category: "Internship & Graduate Interviews",
    question: "You have limited experience. What can you bring to this role?",
    guidance:
      "Translate projects, volunteering, leadership and coursework into evidence of useful skills and learning speed.",
  },
  {
    id: "workplace-conflict",
    category: "Workplace Scenarios",
    question: "How would you handle a disagreement with a teammate?",
    guidance:
      "Demonstrate calm communication, curiosity, shared goals and an appropriate path to resolution.",
  },
  {
    id: "product-priorities",
    category: "Role-Specific Questions",
    question: "How would you decide what a product team should build next?",
    guidance:
      "Show how you balance user evidence, business goals, feasibility and expected impact.",
    careerAreas: ["Product", "Product Management"],
  },
];

export async function loadInterviewQuestions() {
  const { data, error } = await apiCall<{ id: string; category: string; question: string; guidance: string; framework: string | null; career_areas: string[] }[]>("/v1/career/public/questions");
  return {
    questions:
      error || !data?.length
        ? interviewQuestions
        : (data.map((item) => ({
            id: item.id,
            category: item.category,
            question: item.question,
            guidance: item.guidance,
            framework: item.framework ?? undefined,
            careerAreas: item.career_areas ?? [],
          })) as InterviewQuestion[]),
    error,
  };
}
export async function listAdminInterviewQuestions() {
  const { data, error } = await apiCall<unknown[]>("/v1/admin/career/questions");
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
  return apiCall("/v1/admin/career/questions", { method: "PUT", body: JSON.stringify({
        id: input.id,
        category: input.category,
        question: input.question,
        guidance: input.guidance,
        framework: input.framework ?? null,
        career_areas: input.careerAreas ?? [],
        sort_order: input.sort_order ?? 0,
        active: input.active ?? true,
      }) });
}
export async function deleteInterviewQuestion(id: string) {
  return apiCall(`/v1/admin/career/questions/${encodeURIComponent(id)}`, { method: "DELETE" });
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
  const { data, error } = await apiCall<CareerReviewSubmission[]>("/v1/career/reviews");
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
  return apiCall<CareerReviewSubmission>("/v1/career/reviews", { method: "POST", body: JSON.stringify(input) });
}
export async function loadPracticeResponses(userId: string) {
  const { data, error } = await apiCall<PracticeResponse[]>("/v1/career/responses");
  return { responses: (data ?? []) as PracticeResponse[], error };
}
export async function savePracticeResponse(
  userId: string,
  questionId: string,
  responseText: string,
) {
  return apiCall<PracticeResponse>(`/v1/career/responses/${encodeURIComponent(questionId)}`, { method: "PUT", body: JSON.stringify({ response_text: responseText }) });
}
export async function loadSavedCareerResources(userId: string) {
  const { data, error } = await apiCall<string[]>("/v1/career/saved-resources");
  return { ids: data ?? [], error };
}
export async function toggleSavedCareerResource(
  userId: string,
  contentId: string,
  saved: boolean,
) {
  return apiCall(`/v1/career/saved-resources/${encodeURIComponent(contentId)}`, { method: saved ? "DELETE" : "PUT" });
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
  const params = new URLSearchParams({ offset: String(from), limit: String(pageSize) });
  if (options.status && options.status !== "all") params.set("status", options.status);
  if (options.query?.trim()) params.set("q", options.query.trim());
  const { data: page_, error } = await apiCall<{ items: CareerReviewSubmission[]; total: number }>(`/v1/admin/career/reviews?${params}`);
  const data = page_?.items ?? [];
  const count = page_?.total ?? 0;
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
  const { data, error } = await apiCall<Record<ReviewStatus, number>>("/v1/admin/career/reviews/counts");
  return {
    counts: statuses.reduce<Record<ReviewStatus, number>>((next, status) => ({ ...next, [status]: data?.[status] ?? 0 }), {} as Record<ReviewStatus, number>),
    error,
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
  return apiCall<CareerReviewSubmission>(`/v1/admin/career/reviews/${id}`, { method: "PATCH", body: JSON.stringify(change) });
}
export async function getReviewDocumentUrl(submission: CareerReviewSubmission) {
  if (submission.uploaded_file_path) {
    return createSignedUrl("private-cvs", submission.uploaded_file_path, 60 * 15);
  }
  if (submission.cv_record_id) {
    const { data: cv, error } = await apiCall<{ original_file_path: string | null; generated_file_path: string | null } | null>(`/v1/cvs/${submission.cv_record_id}/files`);
    if (error) return { url: null, error };
    const path = cv?.generated_file_path || cv?.original_file_path;
    if (!path) return { url: null, error: null };
    return createSignedUrl("private-cvs", path, 60 * 15);
  }
  return { url: null, error: null };
}
