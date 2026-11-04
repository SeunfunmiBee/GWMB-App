import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type'};

Deno.serve(async(req)=>{
  if(req.method==='OPTIONS')return new Response('ok',{headers:corsHeaders});
  if(req.method!=='POST')return json({error:'Method not allowed.'},405);
  const url=Deno.env.get('SUPABASE_URL')!;const anonKey=Deno.env.get('SUPABASE_ANON_KEY')!;const serviceKey=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const authorization=req.headers.get('authorization')??'';const jwt=authorization.replace(/^Bearer\s+/i,'');
  const caller=createClient(url,anonKey,{global:{headers:{Authorization:authorization}},auth:{persistSession:false}});
  const service=createClient(url,serviceKey,{auth:{persistSession:false}});
  const{data:{user}}=await caller.auth.getUser(jwt);if(!user)return json({error:'Sign in before verifying membership.'},401);
  const body=await req.json().catch(()=>({})) as {action?:string;code?:string};
  const{data:request,error:requestError}=await service.from('membership_verification_requests').select('membership_email,membership_record_id,status').eq('user_id',user.id).maybeSingle();
  if(requestError||!request?.membership_record_id||request.status!=='pending')return json({error:'No membership email confirmation is waiting for this account.'},400);

  if(body.action==='send'){
    const{data:existing}=await service.from('membership_email_challenges').select('sent_at').eq('user_id',user.id).maybeSingle();
    if(existing&&Date.now()-new Date(existing.sent_at).getTime()<60_000)return json({error:'Wait one minute before requesting another code.'},429);
    const resendKey=Deno.env.get('RESEND_API_KEY');const from=Deno.env.get('NOTIFICATION_FROM_EMAIL');
    if(!resendKey||!from)return json({error:'Membership verification email is not configured yet. Request manual review for now.'},503);
    const code=String(crypto.getRandomValues(new Uint32Array(1))[0]%1_000_000).padStart(6,'0');const codeHash=await hash(`${user.id}:${code}:${serviceKey}`);
    const{error:saveError}=await service.from('membership_email_challenges').upsert({user_id:user.id,membership_record_id:request.membership_record_id,code_hash:codeHash,expires_at:new Date(Date.now()+10*60_000).toISOString(),attempts:0,sent_at:new Date().toISOString()});
    if(saveError)return json({error:'Could not create the verification code.'},500);
    const response=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${resendKey}`,'Content-Type':'application/json'},body:JSON.stringify({from,to:[request.membership_email],subject:'Your GWMB membership verification code',html:emailHtml(code)})});
    if(!response.ok){await service.from('membership_email_challenges').delete().eq('user_id',user.id);return json({error:'The verification email could not be delivered. Check the domain configuration or request manual review.'},502)}
    return json({ok:true,message:'We sent a 6-digit code to your registered membership email.'});
  }

  if(body.action==='verify'){
    const code=String(body.code??'').trim();if(!/^\d{6}$/.test(code))return json({error:'Enter the 6-digit code from your email.'},400);
    const{data:challenge}=await service.from('membership_email_challenges').select('*').eq('user_id',user.id).maybeSingle();
    if(!challenge||new Date(challenge.expires_at).getTime()<Date.now())return json({error:'This code has expired. Request a new code.'},400);
    if(challenge.attempts>=5)return json({error:'Too many attempts. Request a new code.'},429);
    const candidate=await hash(`${user.id}:${code}:${serviceKey}`);
    if(candidate!==challenge.code_hash){await service.from('membership_email_challenges').update({attempts:challenge.attempts+1}).eq('user_id',user.id);return json({error:'That code is not correct.'},400)}
    const{data:record}=await service.from('membership_records').select('linked_user_id,status').eq('id',challenge.membership_record_id).single();
    if(record?.linked_user_id&&record.linked_user_id!==user.id)return json({error:'This Member ID is already linked to another app account.'},409);
    const{error:linkError}=await service.from('membership_records').update({linked_user_id:user.id}).eq('id',challenge.membership_record_id);
    if(linkError)return json({error:linkError.code==='23505'?'This Member ID is already linked to another account.':'Could not link this membership.'},409);
    await service.from('membership_verification_requests').update({status:'approved',review_note:'Membership email ownership verified with a one-time code.'}).eq('user_id',user.id);
    await service.from('membership_email_challenges').delete().eq('user_id',user.id);
    return json({ok:true,status:record?.status==='active'?'verified':'inactive',message:record?.status==='active'?'Membership Verified':'Membership matched but is not currently active.'});
  }
  return json({error:'Choose send or verify.'},400);
});

async function hash(value:string){const bytes=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)));return Array.from(bytes).map(byte=>byte.toString(16).padStart(2,'0')).join('')}
function emailHtml(code:string){return `<!doctype html><html><body style="margin:0;background:#f7f5f6;font-family:Arial,sans-serif;color:#111"><div style="max-width:560px;margin:auto;padding:40px 20px"><div style="background:white;border-radius:24px;padding:32px"><p style="color:#a81455;font-size:12px;font-weight:700;letter-spacing:1px">GWMB MEMBERSHIP</p><h1 style="font-size:26px">Verify your membership email</h1><p style="color:#655f62;font-size:15px;line-height:1.6">Enter this code in the GWMB app. It expires in 10 minutes.</p><div style="font-size:34px;font-weight:800;letter-spacing:8px;background:#fcebf3;border-radius:16px;padding:20px;text-align:center;color:#a81455">${code}</div><p style="color:#817a7e;font-size:12px;line-height:1.5">If you did not request this, you can safely ignore this email.</p></div></div></body></html>`}
function json(value:unknown,status=200){return new Response(JSON.stringify(value),{status,headers:{...corsHeaders,'Content-Type':'application/json'}})}
