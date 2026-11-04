import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders={
  'Access-Control-Allow-Origin':'*',
  'Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type, x-mentor-webhook-secret',
};

Deno.serve(async(req)=>{
  if(req.method==='OPTIONS')return new Response('ok',{headers:corsHeaders});
  if(req.method!=='POST')return json({error:'POST required.'},405);
  const service=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false}});
  const authorised=await isAuthorised(req);
  if(!authorised)return json({error:'Valid webhook secret or Admin session required.'},401);
  let body:Record<string,unknown>;
  try{body=await req.json()}catch{return json({error:'Valid JSON is required.'},400)}
  const payload=(body.data&&typeof body.data==='object'?body.data:body) as Record<string,unknown>;
  const formType=String(body.form_type??payload.form_type??'mentor_application').toLowerCase();
  const source=String(body.source??payload.source??'external_form');
  const email=stringValue(payload,['email','email_address','mentor_email']).trim().toLowerCase();
  if(!email||!email.includes('@'))return json({error:'A valid mentor email is required.'},400);

  const{data:existingOps}=await service.from('mentor_operations').select('*').ilike('email',email).maybeSingle();
  if(formType.includes('availability')&&!existingOps)return json({error:'No mentor record matches this email. Submit the mentor application first.'},404);
  const mentorId=existingOps?.mentor_id??await uniqueMentorId(service,stringValue(payload,['full_name','name'])||email.split('@')[0]);
  const mentorshipTypes=arrayValue(payload,['mentorship_types','mentorship_type','types']).map(normalizeType).filter(Boolean);
  if(booleanValue(payload,['discovery_available'],false)&&!mentorshipTypes.includes('discovery'))mentorshipTypes.push('discovery');
  if(booleanValue(payload,['industry_available'],false)&&!mentorshipTypes.includes('industry'))mentorshipTypes.push('industry');
  if(booleanValue(payload,['one_on_one_available','1_1_available'],false)&&!mentorshipTypes.includes('one_on_one'))mentorshipTypes.push('one_on_one');
  const availableDates=arrayValue(payload,['available_dates','availability_dates','open_dates']);
  const confirmedUntil=dateValue(payload,['availability_confirmed_until','confirmed_until']);
  const due=confirmedUntil?addDays(confirmedUntil,0):addDays(new Date().toISOString(),90);
  const oneCapacity=numberValue(payload,['one_on_one_capacity','1_1_capacity','session_capacity']);

  if(!formType.includes('availability')){
    const fullName=stringValue(payload,['full_name','name']);
    if(!fullName)return json({error:'Full name is required for a mentor application.'},400);
    const mentor={
      id:mentorId,full_name:fullName,photo_url:stringValue(payload,['headshot','photo_url','photo'])||null,
      job_title:stringValue(payload,['current_role','role','job_title'])||'Mentor',organisation:stringValue(payload,['organisation','organization','company'])||'Independent',
      bio:stringValue(payload,['short_bio','bio'])||'Mentor profile awaiting Admin review.',industry:stringValue(payload,['primary_career_field','primary_field','industry'])||'General',
      subfields:arrayValue(payload,['sub_fields','subfields','specific_fields']),expertise:arrayValue(payload,['areas_of_expertise','expertise']),
      guidance_topics:arrayValue(payload,['mentoring_topics','topics','guidance_topics']),mentorship_types:mentorshipTypes.length?mentorshipTypes:['discovery'],
      active:false,publish_public_profile:false,
    };
    const{error}=await service.from('mentors').upsert(mentor,{onConflict:'id'});if(error)return json({error:error.message},500);
  }

  const operation={
    mentor_id:mentorId,email,phone:stringValue(payload,['phone','phone_number'])||existingOps?.phone||null,linkedin_url:stringValue(payload,['linkedin_url','linkedin'])||existingOps?.linkedin_url||null,
    source,external_identifier:stringValue(payload,['external_identifier','submission_id','entry_id'])||null,
    availability_status:booleanValue(payload,['currently_available','available_now'],existingOps?.availability_status!=='unavailable')?'active':'unavailable',
    preferred_frequency:stringValue(payload,['preferred_frequency','frequency'])||existingOps?.preferred_frequency||null,preferred_days:arrayValue(payload,['preferred_days','days']).length?arrayValue(payload,['preferred_days','days']):(existingOps?.preferred_days??[]),preferred_times:arrayValue(payload,['preferred_times','times']).length?arrayValue(payload,['preferred_times','times']):(existingOps?.preferred_times??[]),
    general_availability:stringValue(payload,['general_availability','availability'])||existingOps?.general_availability||null,
    next_available_period:stringValue(payload,['next_available_period','next_available_date'])||existingOps?.next_available_period||null,
    discovery_available:booleanValue(payload,['discovery_available'],existingOps?.discovery_available??mentorshipTypes.includes('discovery')),
    industry_available:booleanValue(payload,['industry_available'],existingOps?.industry_available??mentorshipTypes.includes('industry')),
    one_on_one_available:booleanValue(payload,['one_on_one_available','1_1_available'],existingOps?.one_on_one_available??mentorshipTypes.includes('one_on_one')),
    one_on_one_capacity:oneCapacity??existingOps?.one_on_one_capacity??0,private_booking_url:stringValue(payload,['booking_link','booking_url'])||existingOps?.private_booking_url||null,available_dates:availableDates.length?availableDates:(existingOps?.available_dates??[]),
    recording_consent:booleanValue(payload,['recording_consent','consent_to_record'],existingOps?.recording_consent??false),limitations:stringValue(payload,['limitations','notes'])||existingOps?.limitations||null,intake_payload:payload,
    availability_last_confirmed_at:formType.includes('availability')?new Date().toISOString():existingOps?.availability_last_confirmed_at??null,availability_confirmed_until:confirmedUntil??existingOps?.availability_confirmed_until??null,availability_confirmation_due:confirmedUntil?due:existingOps?.availability_confirmation_due??due,
    submitted_at:dateValue(payload,['submission_date','submitted_at'])??new Date().toISOString(),
  };
  const{error:opsError}=await service.from('mentor_operations').upsert(operation,{onConflict:'mentor_id'});if(opsError)return json({error:opsError.message},500);
  if(operation.private_booking_url)await service.from('mentorship_booking_links').upsert({mentor_id:mentorId,booking_url:operation.private_booking_url},{onConflict:'mentor_id'});
  if(formType.includes('availability'))await service.from('mentor_availability_submissions').insert({mentor_id:mentorId,source,preferred_days:operation.preferred_days,preferred_times:operation.preferred_times,general_availability:operation.general_availability,available_dates:availableDates,discovery_available:operation.discovery_available,industry_available:operation.industry_available,one_on_one_available:operation.one_on_one_available,one_on_one_capacity:operation.one_on_one_capacity,confirmed_until:confirmedUntil,raw_payload:payload});
  await service.from('mentorship_operations_tasks').upsert({dedupe_key:`mentor:${mentorId}:${formType.includes('availability')?'availability-review':'review'}`,mentor_id:mentorId,kind:formType.includes('availability')?'availability_review':'mentor_review',title:formType.includes('availability')?'Review mentor availability update':'Review new mentor submission',detail:stringValue(payload,['full_name','name'])||email,priority:'normal',status:'open'},{onConflict:'dedupe_key'});
  return json({ok:true,mentor_id:mentorId,action:existingOps?'updated':'created',form_type:formType});
});

async function isAuthorised(req:Request){
  const configured=Deno.env.get('MENTOR_WEBHOOK_SECRET');
  const supplied=req.headers.get('x-mentor-webhook-secret');
  if(configured&&supplied===configured)return true;
  const authorization=req.headers.get('authorization')??'';if(!authorization)return false;
  const anon=Deno.env.get('SUPABASE_ANON_KEY')!;const caller=createClient(Deno.env.get('SUPABASE_URL')!,anon,{global:{headers:{Authorization:authorization}},auth:{persistSession:false}});
  const{data}=await caller.rpc('is_app_admin');return data===true;
}
async function uniqueMentorId(client:ReturnType<typeof createClient>,name:string){const base=slug(name)||'mentor';const{data}=await client.from('mentors').select('id').eq('id',base).maybeSingle();return data?`${base}-${crypto.randomUUID().slice(0,6)}`:base}
function slug(value:string){return value.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g,'-').replace(/(^-|-$)/g,'')}
function stringValue(payload:Record<string,unknown>,keys:string[]){for(const key of keys){const value=payload[key];if(value!==undefined&&value!==null)return String(value)}return''}
function arrayValue(payload:Record<string,unknown>,keys:string[]){for(const key of keys){const value=payload[key];if(Array.isArray(value))return value.map(String).map(v=>v.trim()).filter(Boolean);if(typeof value==='string')return value.split(/[,;\n|]/).map(v=>v.trim()).filter(Boolean)}return[]}
function numberValue(payload:Record<string,unknown>,keys:string[]){const value=stringValue(payload,keys);if(!value)return null;const number=Number(value);return Number.isFinite(number)?Math.max(0,Math.floor(number)):null}
function booleanValue(payload:Record<string,unknown>,keys:string[],fallback:boolean){const value=stringValue(payload,keys).toLowerCase();if(!value)return fallback;return ['yes','true','1','on','available'].includes(value)}
function dateValue(payload:Record<string,unknown>,keys:string[]){const value=stringValue(payload,keys);if(!value)return null;const date=new Date(value);return Number.isNaN(date.getTime())?null:date.toISOString()}
function addDays(value:string,days:number){const date=new Date(value);date.setDate(date.getDate()+days);return date.toISOString().slice(0,10)}
function normalizeType(value:string){const normal=value.toLowerCase().replace(/[-\s]+/g,'_');if(normal.includes('one')||normal.includes('1_1'))return'one_on_one';if(normal.includes('discover'))return'discovery';if(normal.includes('industry'))return'industry';return''}
function json(value:unknown,status=200){return new Response(JSON.stringify(value),{status,headers:{...corsHeaders,'Content-Type':'application/json'}})}
