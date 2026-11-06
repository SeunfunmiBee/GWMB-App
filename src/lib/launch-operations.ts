import { supabase } from '@/lib/supabase';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

export type AccountRequest={id:string;email:string|null;request_type:'data_export'|'account_deletion';status:'submitted'|'in_review'|'completed'|'cancelled';details:string|null;requested_at:string};
export type SupportRequest={id:string;email:string|null;request_type:'support'|'problem'|'feedback';subject:string;message:string;route:string|null;status:'open'|'in_progress'|'resolved'|'closed';created_at:string};
export type ErrorLog={id:string;severity:'warning'|'error'|'fatal';source:string;message:string;context:Record<string,unknown>;resolved:boolean;created_at:string};
export type AuditLog={id:string;action:string;target_type:string;target_id:string|null;metadata:Record<string,unknown>;created_at:string};
export type FeatureFlag={key:string;label:string;description:string|null;enabled:boolean;beta_only:boolean;updated_at:string};

export async function loadMyAccountRequests(){const{data,error}=await supabase.from('account_requests').select('id,request_type,status,details,requested_at').order('requested_at',{ascending:false});if(error)throw error;return(data??[]) as AccountRequest[]}
export async function requestAccountAction(type:'data_export'|'account_deletion',details?:string){const{data,error}=await supabase.rpc('request_account_action',{p_request_type:type,p_details:details??null});if(error)throw error;return data as string}
export async function cancelAccountDeletion(){const{error}=await supabase.rpc('cancel_account_deletion');if(error)throw error}
export async function submitSupportRequest(input:{type:'support'|'problem'|'feedback';subject:string;message:string;route?:string}){const{data,error}=await supabase.rpc('submit_support_request',{p_type:input.type,p_subject:input.subject,p_message:input.message,p_route:input.route??null});if(error)throw error;return data as string}
function errorClientId(){try{const key='gwmb-error-client-id';const existing=localStorage.getItem(key);if(existing)return existing;const created=`client-${Date.now()}-${Math.random().toString(36).slice(2)}`;localStorage.setItem(key,created);return created}catch{return'client-unavailable'}}
function safeContext(value:Record<string,unknown>){const blocked=/password|token|secret|authorization|cookie|code|cv|document/i;return Object.fromEntries(Object.entries(value).filter(([key])=>!blocked.test(key)).map(([key,item])=>[key,typeof item==='string'?item.slice(0,1000):item]))}
const networkFailurePattern=/failed to fetch|network request failed|networkerror|load failed|internet connection appears to be offline/i;
const recentErrorReports=new Map<string,number>();
let errorReportInFlight=false;
let errorReportingBlockedUntil=0;

export function isNetworkFailure(error:unknown){
  let message='';
  try{message=error instanceof Error?`${error.name}: ${error.message}`:typeof error==='string'?error:JSON.stringify(error)??''}catch{message=String(error)}
  return networkFailurePattern.test(message);
}

export async function logAppError(source:string,error:unknown,context:Record<string,unknown>={},severity:'warning'|'error'|'fatal'='error'){
  // A failed network request cannot report itself through that same failed network.
  // Skipping it also prevents the global rejection listener from creating a retry storm.
  if(isNetworkFailure(error)||(typeof navigator!=='undefined'&&navigator.onLine===false))return;
  const message=error instanceof Error?`${error.name}: ${error.message}`:String(error);
  const fingerprint=`${source}:${message}`;
  const now=Date.now();
  if(errorReportInFlight||now<errorReportingBlockedUntil||now-(recentErrorReports.get(fingerprint)??0)<30_000)return;
  recentErrorReports.set(fingerprint,now);
  const stack=error instanceof Error?error.stack?.slice(0,4000):undefined;
  errorReportInFlight=true;
  try{
    const{error:reportError}=await supabase.rpc('log_app_error',{p_source:source,p_message:message,p_severity:severity,p_context:{...safeContext(context),...(stack?{stack}:{}),client_id:errorClientId(),platform:Platform.OS,app_version:Constants.expoConfig?.version??'unknown'}});
    if(reportError&&isNetworkFailure(reportError))errorReportingBlockedUntil=Date.now()+30_000;
  }catch{
    // Error reporting is best-effort and must never become a second app failure.
    errorReportingBlockedUntil=Date.now()+30_000;
  }finally{
    errorReportInFlight=false;
  }
}
export async function loadLaunchOperations(){const[accounts,support,errors,audit,flags,beta]=await Promise.all([
  supabase.from('account_requests').select('*').order('requested_at',{ascending:false}).limit(50),
  supabase.from('support_requests').select('*').order('created_at',{ascending:false}).limit(50),
  supabase.from('app_error_logs').select('*').order('created_at',{ascending:false}).limit(50),
  supabase.from('admin_audit_logs').select('*').order('created_at',{ascending:false}).limit(50),
  supabase.from('feature_flags').select('*').order('label'),
  supabase.from('beta_testers').select('*').order('added_at',{ascending:false}),
]);const error=accounts.error??support.error??errors.error??audit.error??flags.error??beta.error;if(error)throw error;return{accountRequests:(accounts.data??[]) as AccountRequest[],supportRequests:(support.data??[]) as SupportRequest[],errors:(errors.data??[]) as ErrorLog[],audit:(audit.data??[]) as AuditLog[],flags:(flags.data??[]) as FeatureFlag[],betaTesters:beta.data??[]}}
export async function updateFeatureFlag(key:string,patch:Pick<FeatureFlag,'enabled'|'beta_only'>){const{error}=await supabase.from('feature_flags').update({...patch,updated_at:new Date().toISOString()}).eq('key',key);if(error)throw error}
export async function updateOperationalRequest(table:'account_requests'|'support_requests',id:string,status:string){const patch=table==='account_requests'?{status,completed_at:status==='completed'?new Date().toISOString():null}:{status,resolved_at:status==='resolved'?new Date().toISOString():null};const{error}=await supabase.from(table).update(patch).eq('id',id);if(error)throw error}
export async function processAccountRequest(id:string){const{data,error}=await supabase.functions.invoke('account-request-process',{body:{action:'process',requestId:id}});if(error||data?.error)throw new Error(data?.error??error?.message??'Account request could not be processed.');return data as {ok:true;type:'data_export'|'account_deletion'}}
export async function getAccountExportUrl(id:string){const{data,error}=await supabase.functions.invoke('account-request-process',{body:{action:'download',requestId:id}});if(error||data?.error)throw new Error(data?.error??error?.message??'Export could not be downloaded.');return String(data.url)}
export async function resolveError(id:string){const{error}=await supabase.from('app_error_logs').update({resolved:true}).eq('id',id);if(error)throw error}
export async function addBetaTester(email:string,role:'app_user'|'member'|'chapter_admin'|'central_admin',notes?:string){const{error}=await supabase.rpc('add_beta_tester_by_email',{p_email:email,p_role:role,p_notes:notes??null});if(error)throw error}
