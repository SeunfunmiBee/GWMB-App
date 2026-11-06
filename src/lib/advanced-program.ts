import { apiCall } from '@/lib/auth';

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
  const{data,error}=await apiCall<AdvancedProgramClaim|null>(`/v1/courses/${encodeURIComponent(courseSlug)}/advanced-claim`);
  return{claim:(data??null) as AdvancedProgramClaim|null,error};
}

export async function claimAdvancedProgramBenefit(courseSlug:string){
  const{data,error}=await apiCall<AdvancedProgramClaim>(`/v1/courses/${encodeURIComponent(courseSlug)}/advanced-claim`,{method:'POST'});
  return{claim:(data??null) as AdvancedProgramClaim|null,error};
}

export async function loadAdminAdvancedOffer(contentId:string){
  const{data,error}=await apiCall<{benefit_code:string|null;max_claims:number|null;active:boolean}|null>(`/v1/admin/content/${contentId}/advanced-offer`);
  return{offer:data?{benefitCode:data.benefit_code??'',maxClaims:data.max_claims?String(data.max_claims):'',active:data.active!==false}:null,error};
}

export async function saveAdminAdvancedOffer(contentId:string,offer:SecureAdvancedOffer){
  return apiCall(`/v1/admin/content/${contentId}/advanced-offer`,{method:'PUT',body:JSON.stringify({benefit_code:offer.benefitCode.trim()||null,max_claims:offer.maxClaims?Number(offer.maxClaims):null,active:offer.active})});
}
