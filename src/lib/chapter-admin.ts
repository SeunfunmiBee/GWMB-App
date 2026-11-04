import { supabase } from '@/lib/supabase';

export type ChapterAccess={chapter_id:string;chapter_name:string;chapter_kind:'city'|'campus'};
export type LocalActivity={id:string;chapter_id:string;kind:'event'|'project';title:string;description:string|null;starts_at:string;venue:string;status:'draft'|'published'|'completed'|'cancelled';members_only:boolean};
export type RosterMember={user_id:string;full_name:string|null;email:string;member_identifier:string;attendance_status:'attended'|'absent'|null;attendance_request_status:'pending'|'confirmed'|'rejected'|null;confirmed_at:string|null};
export type AttendanceRecord={id:string;activity_id:string;title:string;kind:'event'|'project';chapter_name:string;starts_at:string;venue:string;status:'attended'|'absent';confirmed_at:string};
export type LiveActivity={id:string;title:string;kind:'event'|'project';chapter_name:string;starts_at:string;venue:string;request_status:'pending'|'confirmed'|'rejected'|null};
export type ParticipationSummary={state:'good'|'review'|'downgraded'|'reapplied';attended_count:number;eligible_count:number;participation_percentage:number;review_started_at:string|null;downgraded_at:string|null};

export async function loadChapterAccess(){const{data,error}=await supabase.rpc('get_my_chapter_admin_access');if(error)throw error;return(data??[]) as ChapterAccess[]}
export async function loadLocalActivities(chapterId:string){const{data,error}=await supabase.from('local_activities').select('id,chapter_id,kind,title,description,starts_at,venue,status,members_only').eq('chapter_id',chapterId).order('starts_at',{ascending:false});if(error)throw error;return(data??[]) as LocalActivity[]}
export async function createLocalActivity(input:{chapterId:string;kind:'event'|'project';title:string;description:string;startsAt:string;venue:string}){const{data,error}=await supabase.rpc('create_local_activity',{p_chapter_id:input.chapterId,p_kind:input.kind,p_title:input.title,p_description:input.description,p_starts_at:input.startsAt,p_venue:input.venue});if(error)throw error;return data as string}
export async function loadActivityRoster(activityId:string){const{data,error}=await supabase.rpc('get_chapter_activity_roster',{p_activity_id:activityId});if(error)throw error;return(data??[]) as RosterMember[]}
export async function confirmAttendance(activityId:string,userId:string,attended:boolean){const{error}=await supabase.rpc('confirm_local_attendance',{p_activity_id:activityId,p_user_id:userId,p_attended:attended,p_note:null});if(error)throw error}
export async function loadMyAttendance(){const{data,error}=await supabase.rpc('get_my_confirmed_attendance');if(error)throw error;return(data??[]) as AttendanceRecord[]}
export async function loadMyLiveActivities(){const{data,error}=await supabase.rpc('get_my_live_local_activities');if(error)throw error;return(data??[]) as LiveActivity[]}
export async function requestLiveAttendance(activityId:string){const{error}=await supabase.rpc('request_live_attendance',{p_activity_id:activityId});if(error)throw error}
export async function loadMyParticipation(){const{data,error}=await supabase.rpc('get_my_participation_summary');if(error)throw error;const row=Array.isArray(data)?data[0]:data;return(row??{state:'good',attended_count:0,eligible_count:0,participation_percentage:100,review_started_at:null,downgraded_at:null}) as ParticipationSummary}
export async function completeLocalActivity(activityId:string){const{error}=await supabase.rpc('complete_local_activity',{p_activity_id:activityId});if(error)throw error}
