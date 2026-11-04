import { supabase } from '@/lib/supabase';

export type ApplicationProfile = {
  user_id: string;
  professional_bio: string;
  career_direction: string;
  strengths: string[];
  achievements: string[];
  reusable_motivation: string;
  linkedin_url: string;
  portfolio_url: string;
  preferred_location: string;
  updated_at: string;
  refinement_count: number;
};

export type ApplicationReminder = {
  id: string;
  user_id: string;
  opportunity_id: string;
  label: string;
  days_after_submission: number;
  enabled: boolean;
  scheduled_for: string;
};

const profileKey=(userId:string)=>`gwmb-application-profile:${userId}`;
const reminderKey=(userId:string)=>`gwmb-application-reminders:${userId}`;

function readJson<T>(key:string,fallback:T):T{
  try{const value=globalThis.localStorage?.getItem(key);return value?JSON.parse(value) as T:fallback}catch{return fallback}
}
function writeJson(key:string,value:unknown){try{globalThis.localStorage?.setItem(key,JSON.stringify(value))}catch{/* best effort */}}

export function emptyApplicationProfile(userId:string):ApplicationProfile{return{user_id:userId,professional_bio:'',career_direction:'',strengths:[],achievements:[],reusable_motivation:'',linkedin_url:'',portfolio_url:'',preferred_location:'',updated_at:new Date().toISOString(),refinement_count:0}}

export async function loadApplicationProfile(userId:string){
  const local=readJson<ApplicationProfile>(profileKey(userId),emptyApplicationProfile(userId));
  const{data,error}=await supabase.from('application_profiles').select('*').eq('user_id',userId).maybeSingle();
  if(error||!data)return local;
  const profile=data as ApplicationProfile;writeJson(profileKey(userId),profile);return profile;
}

export async function saveApplicationProfile(profile:ApplicationProfile){
  const next={...profile,updated_at:new Date().toISOString()};writeJson(profileKey(profile.user_id),next);
  const{data,error}=await supabase.from('application_profiles').upsert(next,{onConflict:'user_id'}).select('*').single();
  const saved=!error&&data?data as ApplicationProfile:next;writeJson(profileKey(profile.user_id),saved);return saved;
}

export function buildApplicationSuggestion(profile:ApplicationProfile,opportunity:{title:string;org:string;type:string;summary:string}){
  const direction=profile.career_direction||`a career in ${opportunity.type.toLowerCase()}`;
  const strengths=profile.strengths.slice(0,2).join(' and ')||'curiosity, consistency and a willingness to learn';
  const evidence=profile.achievements[0]?` One experience I am proud of is ${profile.achievements[0].replace(/\.$/,'')}.`:'';
  const foundation=profile.reusable_motivation?` ${profile.reusable_motivation.trim()}`:'';
  return `I am applying for the ${opportunity.title} at ${opportunity.org} because it is a strong next step toward ${direction}. I would bring ${strengths}, and I am excited by the opportunity to ${opportunity.summary.charAt(0).toLowerCase()+opportunity.summary.slice(1)}${evidence}${foundation}`.replace(/\s+/g,' ').trim();
}

export async function refineProfileFromApplication(profile:ApplicationProfile,input:{motivation:string;portfolioUrl?:string}){
  const next={...profile,reusable_motivation:profile.reusable_motivation||input.motivation,portfolio_url:profile.portfolio_url||input.portfolioUrl||'',refinement_count:profile.refinement_count+1,updated_at:new Date().toISOString()};
  return saveApplicationProfile(next);
}

export async function saveApplicationReminders(userId:string,opportunityId:string,submittedAt:string,choices:{label:string;days:number;enabled:boolean}[]){
  const existing=readJson<ApplicationReminder[]>(reminderKey(userId),[]).filter(item=>item.opportunity_id!==opportunityId);
  const base=new Date(submittedAt).getTime();
  const reminders=choices.map((choice,index)=>({id:`${opportunityId}-${choice.days}-${index}`,user_id:userId,opportunity_id:opportunityId,label:choice.label,days_after_submission:choice.days,enabled:choice.enabled,scheduled_for:new Date(base+choice.days*24*60*60*1000).toISOString()}));
  writeJson(reminderKey(userId),[...reminders,...existing]);
  const payload=reminders.map(({id:_,...item})=>item);
  const{data,error}=await supabase.from('application_reminders').upsert(payload,{onConflict:'user_id,opportunity_id,days_after_submission'}).select('*');
  return!error&&data?data as ApplicationReminder[]:reminders;
}
