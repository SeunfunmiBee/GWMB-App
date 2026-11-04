import { supabase } from '@/lib/supabase';

export type AdvancedProgramClaim={
  claimId:string;
  status:string;
  code:string|null;
  offerType:string;
  offerLabel:string|null;
  claimedAt?:string;
  applicationUrl:string;
};

export type SecureAdvancedOffer={benefitCode:string;maxClaims:string;active:boolean};

export async function loadMyAdvancedProgramClaim(courseSlug:string){
  const{data,error}=await supabase.rpc('get_my_advanced_program_claim',{p_course_slug:courseSlug});
  return{claim:(data??null) as AdvancedProgramClaim|null,error};
}

export async function claimAdvancedProgramBenefit(courseSlug:string){
  const{data,error}=await supabase.rpc('claim_advanced_program_benefit',{p_course_slug:courseSlug});
  return{claim:(data??null) as AdvancedProgramClaim|null,error};
}

export async function loadAdminAdvancedOffer(contentId:string){
  const{data,error}=await supabase.from('advanced_program_offers').select('benefit_code,max_claims,active').eq('content_id',contentId).maybeSingle();
  return{offer:data?{benefitCode:data.benefit_code??'',maxClaims:data.max_claims?String(data.max_claims):'',active:data.active!==false}:null,error};
}

export async function saveAdminAdvancedOffer(contentId:string,offer:SecureAdvancedOffer){
  const{data:auth}=await supabase.auth.getUser();
  return supabase.from('advanced_program_offers').upsert({content_id:contentId,benefit_code:offer.benefitCode.trim()||null,max_claims:offer.maxClaims?Number(offer.maxClaims):null,active:offer.active,updated_by:auth.user?.id??null},{onConflict:'content_id'});
}
