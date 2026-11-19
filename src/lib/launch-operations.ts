import Constants from 'expo-constants';
import { Platform } from 'react-native';

import { apiFetch } from '@/lib/auth';

export type AccountRequest={id:string;email:string|null;request_type:'data_export'|'account_deletion';status:'submitted'|'in_review'|'completed'|'cancelled';details:string|null;requested_at:string};
export type SupportRequest={id:string;email:string|null;request_type:'support'|'problem'|'feedback';subject:string;message:string;route:string|null;status:'open'|'in_progress'|'resolved'|'closed';created_at:string};
export type ErrorLog={id:string;severity:'warning'|'error'|'fatal';source:string;message:string;context:Record<string,unknown>;resolved:boolean;created_at:string};
export type AuditLog={id:string;action:string;target_type:string;target_id:string|null;metadata:Record<string,unknown>;created_at:string};

const post=(body:unknown)=>({method:'POST',body:JSON.stringify(body)});
const patch=(body:unknown)=>({method:'PATCH',body:JSON.stringify(body)});

export async function loadMyAccountRequests(){return apiFetch<AccountRequest[]>('/v1/account/requests')}
export async function requestAccountAction(type:'data_export'|'account_deletion',details?:string){return(await apiFetch<{id:string}>('/v1/account/requests',post({type,details:details??null}))).id}
export async function cancelAccountDeletion(){await apiFetch('/v1/account/requests/cancel-deletion',{method:'POST'})}
export async function submitSupportRequest(input:{type:'support'|'problem'|'feedback';subject:string;message:string;route?:string}){return(await apiFetch<{id:string}>('/v1/account/support',post({type:input.type,subject:input.subject,message:input.message,route:input.route??null}))).id}
function errorClientId(){try{const key='gwmb-error-client-id';const existing=localStorage.getItem(key);if(existing)return existing;const created=`client-${Date.now()}-${Math.random().toString(36).slice(2)}`;localStorage.setItem(key,created);return created}catch{return'client-unavailable'}}
function safeContext(value:Record<string,unknown>){const blocked=/password|token|secret|authorization|cookie|code|cv|document/i;return Object.fromEntries(Object.entries(value).filter(([key])=>!blocked.test(key)).map(([key,item])=>[key,typeof item==='string'?item.slice(0,1000):item]))}
export async function logAppError(source:string,error:unknown,context:Record<string,unknown>={},severity:'warning'|'error'|'fatal'='error'){const message=error instanceof Error?`${error.name}: ${error.message}`:String(error);const stack=error instanceof Error?error.stack?.slice(0,4000):undefined;try{await apiFetch('/v1/errors',post({source,message,severity,context:{...safeContext(context),...(stack?{stack}:{}),client_id:errorClientId(),platform:Platform.OS,app_version:Constants.expoConfig?.version??'unknown'}}))}catch{/* Error reporting must never crash the app. */}}
export async function loadLaunchOperations(){return apiFetch<{accountRequests:AccountRequest[];supportRequests:SupportRequest[];errors:ErrorLog[];audit:AuditLog[]}>('/v1/admin/operations')}
export async function updateOperationalRequest(table:'account_requests'|'support_requests',id:string,status:string){await apiFetch(`/v1/admin/operations/${table==='account_requests'?'account-requests':'support-requests'}/${id}`,patch({status}))}
export async function processAccountRequest(id:string){return apiFetch<{ok:true;type:'data_export'|'account_deletion'}>(`/v1/admin/operations/account-requests/${id}/process`,{method:'POST'})}
export async function getAccountExportUrl(id:string){return(await apiFetch<{url:string}>(`/v1/account/requests/${id}/export-url`)).url}
export async function resolveError(id:string){await apiFetch(`/v1/admin/operations/errors/${id}/resolve`,{method:'POST'})}
