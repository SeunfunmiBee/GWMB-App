import { supabase } from '@/lib/supabase';
import type { Opportunity } from '@/data/opportunities';

export type ApplicationStatus = 'draft' | 'pending_sync' | 'submitted' | 'under_review' | 'successful' | 'unsuccessful';
export type OpportunityApplication = {
  id: string;
  user_id: string;
  opportunity_id: string;
  portfolio_url: string | null;
  motivation: string;
  status: ApplicationStatus;
  submitted_at: string;
  updated_at: string;
  cv_record_id: string | null;
  cv_snapshot: Record<string, unknown> | null;
  completion_percent?: number;
  opportunity_content_id?: string | null;
  submission_reference?: string | null;
  pending_payload?: PendingApplicationPayload;
  applicant?: { full_name:string|null; city_club:string|null }|null;
};

type PendingApplicationPayload={portfolioUrl:string;motivation:string;cvRecordId?:string|null;cvSnapshot?:Record<string,unknown>|null};
export type OpportunityApplicationContext={opportunity:Opportunity;contentId:string;canApply:boolean;blockedReason:string|null};

const savedKey = (userId?: string | null) => `gwmb-saved-opportunities:${userId ?? 'guest'}`;
const applicationsKey = (userId: string) => `gwmb-opportunity-applications:${userId}`;

function readJson<T>(key: string, fallback: T): T {
  try { const value = globalThis.localStorage?.getItem(key); return value ? JSON.parse(value) as T : fallback; }
  catch { return fallback; }
}
function writeJson(key: string, value: unknown) {
  try { globalThis.localStorage?.setItem(key, JSON.stringify(value)); } catch { /* Device fallback is best effort. */ }
}

const cleanText=(value:unknown,fallback='')=>typeof value==='string'?value:fallback;

export async function loadOpportunityApplicationContext(opportunityId:string):Promise<{context:OpportunityApplicationContext|null;error:string|null}> {
  const{data,error}=await supabase.rpc('get_opportunity_application_context',{p_opportunity_id:opportunityId});
  if(error)return{context:null,error:error.message};
  if(!data||typeof data!=='object')return{context:null,error:'This opportunity is not available for applications.'};
  const record=data as Record<string,unknown>;
  const metadata=record.metadata&&typeof record.metadata==='object'?record.metadata as Record<string,unknown>:{};
  const deadline=cleanText(metadata.deadline);
  const opportunity:Opportunity={
    id:cleanText(record.slug),
    initials:cleanText(metadata.initials,cleanText(record.title).slice(0,2).toUpperCase()),
    title:cleanText(record.title),
    org:cleanText(metadata.organisation,cleanText(record.eyebrow,'GWMB Partner')),
    type:cleanText(metadata.type,'Opportunity'),
    location:cleanText(metadata.location,'Nigeria'),
    deadline:deadline&&deadline!=='Rolling'?`Closes ${new Date(deadline).toLocaleDateString('en-NG',{day:'2-digit',month:'short'})}`:deadline||'Rolling',
    deadlineAt:deadline||undefined,
    source:cleanText(metadata.source,'GWMB Partner'),
    access:record.access_level==='members'?'Members Only':'Open Access',
    summary:cleanText(record.summary),
    aiAssistance:metadata.aiAssistance==='restricted'?'restricted':'allowed',
    aiPolicy:cleanText(metadata.aiPolicy)||undefined,
  };
  return{context:{opportunity,contentId:cleanText(record.id),canApply:record.can_apply===true,blockedReason:cleanText(record.blocked_reason)||null},error:null};
}

export async function loadSavedOpportunityIds(userId?: string | null) {
  const local = readJson<string[]>(savedKey(userId), []);
  if (!userId) return local;
  const { data, error } = await supabase.from('saved_opportunities').select('opportunity_id').eq('user_id', userId);
  if (error) return local;
  const ids = (data ?? []).map((row) => row.opportunity_id as string);
  writeJson(savedKey(userId), ids);
  return ids;
}

export async function setOpportunitySaved(userId: string | null | undefined, opportunityId: string, saved: boolean) {
  const current = readJson<string[]>(savedKey(userId), []);
  const next = saved ? Array.from(new Set([...current, opportunityId])) : current.filter((id) => id !== opportunityId);
  writeJson(savedKey(userId), next);
  if (!userId) return;
  if (saved) await supabase.from('saved_opportunities').upsert({ user_id:userId, opportunity_id:opportunityId }, { onConflict:'user_id,opportunity_id' });
  else await supabase.from('saved_opportunities').delete().eq('user_id', userId).eq('opportunity_id', opportunityId);
}

export async function loadOpportunityApplications(userId: string) {
  await retryPendingOpportunityApplications(userId);
  const local = readJson<OpportunityApplication[]>(applicationsKey(userId), []);
  const { data, error } = await supabase.from('opportunity_applications').select('*').eq('user_id', userId).order('submitted_at', { ascending:false });
  if (error) return { applications:local, cloud:false };
  const cloudApplications = (data ?? []) as OpportunityApplication[];
  const localOnly = local.filter((item) => ['draft','pending_sync'].includes(item.status) && !cloudApplications.some((cloud) => cloud.opportunity_id === item.opportunity_id));
  const applications = [...localOnly, ...cloudApplications];
  writeJson(applicationsKey(userId), applications);
  return { applications, cloud:true };
}

export async function saveOpportunityDraft(input:{userId:string;opportunityId:string;portfolioUrl:string;motivation:string;cvRecordId?:string|null;completionPercent:number}){
  const existing=readJson<OpportunityApplication[]>(applicationsKey(input.userId),[]);
  const now=new Date().toISOString();
  const current=existing.find(item=>item.opportunity_id===input.opportunityId&&item.status==='draft');
  const draft:OpportunityApplication={id:current?.id??`draft-${input.opportunityId}-${Date.now()}`,user_id:input.userId,opportunity_id:input.opportunityId,portfolio_url:input.portfolioUrl||null,motivation:input.motivation,status:'draft',submitted_at:current?.submitted_at??now,updated_at:now,cv_record_id:input.cvRecordId??null,cv_snapshot:null,completion_percent:input.completionPercent};
  writeJson(applicationsKey(input.userId),[draft,...existing.filter(item=>item.id!==current?.id)]);
  const payload={user_id:input.userId,opportunity_id:input.opportunityId,portfolio_url:input.portfolioUrl||null,motivation:input.motivation,status:'draft' as const,submitted_at:current?.submitted_at??now,updated_at:now,cv_record_id:input.cvRecordId??null,cv_snapshot:null,completion_percent:input.completionPercent};
  const{data,error}=await supabase.from('opportunity_applications').upsert(payload,{onConflict:'user_id,opportunity_id'}).select('*').single();
  if(!error&&data){const saved=data as OpportunityApplication;writeJson(applicationsKey(input.userId),[saved,...existing.filter(item=>item.opportunity_id!==input.opportunityId)]);return saved}
  return draft;
}

export async function submitOpportunityApplication(input:{userId:string;opportunityId:string;portfolioUrl:string;motivation:string;cvRecordId?:string|null;cvSnapshot?:Record<string,unknown>|null}) {
  const existing = readJson<OpportunityApplication[]>(applicationsKey(input.userId), []);
  if (existing.some((item) => item.opportunity_id === input.opportunityId && !['draft','pending_sync'].includes(item.status))) return { ok:false as const, duplicate:true as const, pending:false as const, error:null };
  const now = new Date().toISOString();
  let cvSnapshot=input.cvSnapshot??null;
  if(input.cvRecordId){const{data:version}=await supabase.from('cv_records').select('id,name,target_role,opportunity_type,template,original_file_path,generated_file_path,structured_data,updated_at').eq('id',input.cvRecordId).eq('user_id',input.userId).maybeSingle();if(version)cvSnapshot=version as Record<string,unknown>}
  const { data, error } = await supabase.rpc('submit_opportunity_application',{
    p_opportunity_id:input.opportunityId,
    p_portfolio_url:input.portfolioUrl||null,
    p_motivation:input.motivation,
    p_cv_record_id:input.cvRecordId??null,
    p_cv_snapshot:cvSnapshot,
  });
  if (!error && data) {
    const next = [data as OpportunityApplication, ...existing.filter(item=>!(item.opportunity_id===input.opportunityId&&['draft','pending_sync'].includes(item.status)))];
    writeJson(applicationsKey(input.userId), next);
    return { ok:true as const, duplicate:false as const, pending:false as const, application:data as OpportunityApplication, error:null };
  }
  if (error?.code === '23505'||/already applied/i.test(error?.message??'')) return { ok:false as const, duplicate:true as const, pending:false as const, error };
  const retryable=!error?.code||/fetch|network|connection|timeout|offline/i.test(error.message??'');
  if(!retryable)return{ok:false as const,duplicate:false as const,pending:false as const,error};
  const reference=`PENDING-${Date.now().toString(36).toUpperCase()}`;
  const fallback:OpportunityApplication={id:`pending-${Date.now()}`,user_id:input.userId,opportunity_id:input.opportunityId,portfolio_url:input.portfolioUrl||null,motivation:input.motivation,status:'pending_sync',submitted_at:now,updated_at:now,cv_record_id:input.cvRecordId??null,cv_snapshot:cvSnapshot,completion_percent:100,submission_reference:reference,pending_payload:{portfolioUrl:input.portfolioUrl,motivation:input.motivation,cvRecordId:input.cvRecordId,cvSnapshot}};
  writeJson(applicationsKey(input.userId),[fallback,...existing.filter(item=>item.opportunity_id!==input.opportunityId)]);
  return{ok:false as const,duplicate:false as const,pending:true as const,application:fallback,error};
}

export async function retryPendingOpportunityApplications(userId:string){
  const current=readJson<OpportunityApplication[]>(applicationsKey(userId),[]);
  const pending=current.filter(item=>item.status==='pending_sync'&&item.pending_payload);
  if(!pending.length)return current;
  let next=[...current];
  for(const item of pending){
    const payload=item.pending_payload!;
    const{data,error}=await supabase.rpc('submit_opportunity_application',{p_opportunity_id:item.opportunity_id,p_portfolio_url:payload.portfolioUrl||null,p_motivation:payload.motivation,p_cv_record_id:payload.cvRecordId??null,p_cv_snapshot:payload.cvSnapshot??null});
    if(!error&&data)next=[data as OpportunityApplication,...next.filter(value=>value.id!==item.id&&value.opportunity_id!==item.opportunity_id)];
  }
  writeJson(applicationsKey(userId),next);
  return next;
}

export async function loadAdminOpportunityApplications(){
  const{data,error}=await supabase.from('opportunity_applications').select('*,applicant:profiles!opportunity_applications_profile_fkey(full_name,city_club)').order('submitted_at',{ascending:false});
  if(error)throw error;return(data??[]) as OpportunityApplication[];
}

export async function updateOpportunityApplicationStatus(id:string,status:Exclude<ApplicationStatus,'draft'|'pending_sync'>){
  const{data,error}=await supabase.from('opportunity_applications').update({status,updated_at:new Date().toISOString()}).eq('id',id).select('*').single();
  if(error)throw error;return data as OpportunityApplication;
}
