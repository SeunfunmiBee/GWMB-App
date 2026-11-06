import { apiFetch } from '@/lib/auth';

export type ChapterAccess={chapter_id:string;chapter_name:string;chapter_kind:'city'|'campus'};
export type LocalActivity={id:string;chapter_id:string;kind:'event'|'project';title:string;description:string|null;starts_at:string;venue:string;status:'draft'|'published'|'completed'|'cancelled';members_only:boolean};
export type RosterMember={user_id:string;full_name:string|null;email:string;member_identifier:string;attendance_status:'attended'|'absent'|null;attendance_request_status:'pending'|'confirmed'|'rejected'|null;confirmed_at:string|null};
export type AttendanceRecord={id:string;activity_id:string;title:string;kind:'event'|'project';chapter_name:string;starts_at:string;venue:string;status:'attended'|'absent';confirmed_at:string};
export type LiveActivity={id:string;title:string;kind:'event'|'project';chapter_name:string;starts_at:string;venue:string;request_status:'pending'|'confirmed'|'rejected'|null};
export type ParticipationSummary={state:'good'|'review'|'downgraded'|'reapplied';attended_count:number;eligible_count:number;participation_percentage:number;review_started_at:string|null;downgraded_at:string|null};

const json = (body: unknown) => ({ method: 'POST', body: JSON.stringify(body) });

export async function loadChapterAccess(){return(await apiFetch<{chapterAdminAccess:ChapterAccess[]}>('/v1/me')).chapterAdminAccess??[]}
export async function loadLocalActivities(chapterId:string){return apiFetch<LocalActivity[]>(`/v1/chapters/${chapterId}/activities`)}
export async function createLocalActivity(input:{chapterId:string;kind:'event'|'project';title:string;description:string;startsAt:string;venue:string}){return(await apiFetch<{id:string}>(`/v1/chapters/${input.chapterId}/activities`,json({kind:input.kind,title:input.title,description:input.description,startsAt:input.startsAt,venue:input.venue}))).id}
export async function loadActivityRoster(activityId:string){return apiFetch<RosterMember[]>(`/v1/chapters/activities/${activityId}/roster`)}
export async function confirmAttendance(activityId:string,userId:string,attended:boolean){await apiFetch(`/v1/chapters/activities/${activityId}/attendance`,json({userId,attended}))}
export async function loadMyAttendance(){return apiFetch<AttendanceRecord[]>('/v1/community/attendance')}
export async function loadMyLiveActivities(){return apiFetch<LiveActivity[]>('/v1/community/live-activities')}
export async function requestLiveAttendance(activityId:string){await apiFetch(`/v1/community/activities/${activityId}/attendance-request`,{method:'POST'})}
export async function loadMyParticipation(){return apiFetch<ParticipationSummary>('/v1/community/participation')}
export async function completeLocalActivity(activityId:string){await apiFetch(`/v1/chapters/activities/${activityId}/complete`,{method:'POST'})}
