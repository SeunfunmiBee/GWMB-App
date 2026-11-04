import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders={
  'Access-Control-Allow-Origin':'*',
  'Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type, x-cron-secret',
};

type OutboxRow={id:string;user_id:string;channel:'push'|'in_app'|'email'|'sms'|'whatsapp';template_key:string;payload:Record<string,unknown>};
type MentorOutboxRow={id:string;mentor_id:string;session_id:string|null;recipient_email:string;template_key:string;payload:Record<string,unknown>};
type PushTicket={status:'ok'|'error';id?:string;message?:string;details?:{error?:string}};
type PushReceipt={status:'ok'|'error';message?:string;details?:{error?:string}};

Deno.serve(async(req)=>{
  if(req.method==='OPTIONS')return new Response('ok',{headers:corsHeaders});
  const url=Deno.env.get('SUPABASE_URL')!;
  const serviceKey=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const anonKey=Deno.env.get('SUPABASE_ANON_KEY')!;
  const service=createClient(url,serviceKey,{auth:{persistSession:false}});
  const cronSecret=Deno.env.get('NOTIFICATION_CRON_SECRET');
  const suppliedCron=req.headers.get('x-cron-secret');
  let authorised=Boolean(cronSecret&&suppliedCron===cronSecret);
  if(!authorised){
    const authorization=req.headers.get('authorization')??'';
    const jwt=authorization.replace(/^Bearer\s+/i,'');
    const caller=createClient(url,anonKey,{global:{headers:{Authorization:authorization}},auth:{persistSession:false}});
    const{data:{user}}=await caller.auth.getUser(jwt);
    if(user){const{data}=await caller.rpc('is_app_admin');authorised=data===true}
  }
  if(!authorised)return json({error:'Admin or scheduler authorisation required.'},401);

  const receiptSummary=await checkPushReceipts(service);

  const{data,error}=await service.from('notification_outbox').select('id,user_id,channel,template_key,payload').eq('status','pending').lte('scheduled_for',new Date().toISOString()).in('channel',['push','in_app','email']).order('scheduled_for').limit(100);
  if(error)return json({error:error.message},500);
  const rows=(data??[]) as OutboxRow[];
  const summary={processed:0,sent:0,skipped:0,failed:0,receiptsChecked:receiptSummary.checked,receiptErrors:receiptSummary.errors};
  for(const row of rows){
    summary.processed++;
    await service.from('notification_outbox').update({status:'processing',error_message:null}).eq('id',row.id).eq('status','pending');
    try{
      const{data:preferences}=await service.from('notification_preferences').select('*').eq('user_id',row.user_id).maybeSingle();
      const categoryAllowed=categoryIsAllowed(row.template_key,preferences);
      if(!categoryAllowed){await finish(service,row.id,'skipped','Disabled in notification preferences');summary.skipped++;continue}
      const title=String(row.payload.title??'GWMB update');
      const body=String(row.payload.body??'Open GWMB to see what is new.');
      const route=String(row.payload.route??'/notifications');

      if(row.channel==='in_app'){
        const{error:insertError}=await service.from('user_notifications').insert({user_id:row.user_id,kind:row.template_key,title,body,route});
        if(insertError)throw insertError;
      }else if(row.channel==='push'){
        if(!preferences?.push_enabled){await finish(service,row.id,'skipped','Push is disabled');summary.skipped++;continue}
        const{data:devices}=await service.from('push_devices').select('id,expo_push_token').eq('user_id',row.user_id).eq('active',true);
        if(!devices?.length){await finish(service,row.id,'skipped','No active push device');summary.skipped++;continue}
        const response=await fetch('https://exp.host/--/api/v2/push/send',{method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json','Accept-Encoding':'gzip, deflate'},body:JSON.stringify(devices.map(device=>({to:device.expo_push_token,title,body,sound:'default',priority:'high',channelId:'gwmb-reminders',data:{route}})))});
        if(!response.ok)throw new Error(`Expo push returned ${response.status}`);
        const result=await response.json() as {data?:PushTicket[]|PushTicket;errors?:{message?:string}[]};
        const tickets=Array.isArray(result.data)?result.data:result.data?[result.data]:[];
        if(!tickets.length)throw new Error(result.errors?.[0]?.message??'Expo returned no push tickets');
        let accepted=0;
        for(let index=0;index<devices.length;index++){
          const device=devices[index];const ticket=tickets[index]??{status:'error',message:'Expo returned no ticket for this device'} as PushTicket;
          const errorCode=ticket.details?.error??null;
          await service.from('notification_push_deliveries').upsert({outbox_id:row.id,device_id:device.id,expo_push_token:device.expo_push_token,ticket_id:ticket.id??null,ticket_status:ticket.status==='ok'?'accepted':'error',receipt_status:ticket.status==='ok'?'pending':'error',error_code:errorCode,error_message:ticket.message??null,sent_at:new Date().toISOString()},{onConflict:'outbox_id,expo_push_token'});
          if(ticket.status==='ok'&&ticket.id)accepted++;
          if(errorCode==='DeviceNotRegistered')await service.from('push_devices').update({active:false}).eq('id',device.id);
        }
        if(accepted===0)throw new Error(tickets.map(ticket=>ticket.message).filter(Boolean).join('; ')||'Every push ticket was rejected');
      }else if(row.channel==='email'){
        if(preferences?.email_enabled===false){await finish(service,row.id,'skipped','Email is disabled');summary.skipped++;continue}
        const resendKey=Deno.env.get('RESEND_API_KEY');
        const from=Deno.env.get('NOTIFICATION_FROM_EMAIL');
        const{data:{user}}=await service.auth.admin.getUserById(row.user_id);
        const to=String(row.payload.email??user?.email??'');
        if(!resendKey||!from||!to){await finish(service,row.id,'skipped','Email provider is not configured');summary.skipped++;continue}
        const response=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${resendKey}`,'Content-Type':'application/json'},body:JSON.stringify({from,to:[to],subject:title,html:emailHtml(title,body)})});
        if(!response.ok)throw new Error(`Email provider returned ${response.status}`);
      }
      await finish(service,row.id,'sent');summary.sent++;
    }catch(cause){const message=cause instanceof Error?cause.message:'Notification delivery failed';await finish(service,row.id,'failed',message);summary.failed++}
  }
  const{data:mentorData,error:mentorError}=await service.from('mentor_communication_outbox').select('id,mentor_id,session_id,recipient_email,template_key,payload').eq('status','pending').lte('scheduled_for',new Date().toISOString()).order('scheduled_for').limit(100);
  if(!mentorError){for(const row of (mentorData??[]) as MentorOutboxRow[]){summary.processed++;await service.from('mentor_communication_outbox').update({status:'processing',error_message:null}).eq('id',row.id).eq('status','pending');try{const resendKey=Deno.env.get('RESEND_API_KEY');const from=Deno.env.get('NOTIFICATION_FROM_EMAIL');if(!resendKey||!from||row.recipient_email.endsWith('@mentor.pending')){const reason=row.recipient_email.endsWith('@mentor.pending')?'Mentor email needs confirmation':'Email provider is not configured';await finishMentor(service,row.id,'skipped',reason);await service.from('mentorship_operations_tasks').upsert({dedupe_key:`mentor-message:${row.id}`,mentor_id:row.mentor_id,session_id:row.session_id,kind:'manual_mentor_reminder',title:mentorTaskTitle(row.template_key),detail:String(row.payload.title??'Mentorship session'),priority:row.template_key.includes('24h')||row.template_key.includes('1h')?'high':'normal',status:'open'},{onConflict:'dedupe_key'});summary.skipped++;continue}const subject=mentorEmailTitle(row.template_key,row.payload);const body=mentorEmailBody(row.template_key,row.payload);const response=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${resendKey}`,'Content-Type':'application/json'},body:JSON.stringify({from,to:[row.recipient_email],subject,html:emailHtml(subject,body)})});if(!response.ok)throw new Error(`Email provider returned ${response.status}`);await finishMentor(service,row.id,'sent');summary.sent++}catch(cause){const message=cause instanceof Error?cause.message:'Mentor reminder failed';await finishMentor(service,row.id,'failed',message);summary.failed++}}}
  return json(summary);
});

function categoryIsAllowed(key:string,preferences:Record<string,unknown>|null){
  if(!preferences)return true;
  if(key.includes('event')||key.includes('mentorship'))return preferences.events_enabled!==false;
  if(key.includes('opportunit')||key.includes('application'))return preferences.opportunities_enabled!==false;
  if(key.includes('learning')||key.includes('course'))return preferences.learning_enabled!==false;
  if(key.includes('community'))return preferences.community_enabled!==false;
  if(key.includes('newsletter'))return preferences.newsletter_enabled!==false;
  return true;
}

async function checkPushReceipts(client:ReturnType<typeof createClient>){
  const now=Date.now();const eligibleBefore=new Date(now-15*60*1000).toISOString();const expiresAfter=new Date(now-24*60*60*1000).toISOString();
  await client.from('notification_push_deliveries').update({receipt_status:'expired',receipt_checked_at:new Date().toISOString(),error_message:'No Expo receipt became available within 24 hours'}).eq('receipt_status','pending').lt('sent_at',expiresAfter);
  const{data,error}=await client.from('notification_push_deliveries').select('id,device_id,ticket_id').eq('receipt_status','pending').not('ticket_id','is',null).lte('sent_at',eligibleBefore).gte('sent_at',expiresAfter).limit(300);
  if(error||!data?.length)return{checked:0,errors:error?1:0};
  const ids=data.map(item=>String(item.ticket_id));
  const response=await fetch('https://exp.host/--/api/v2/push/getReceipts',{method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json'},body:JSON.stringify({ids})});
  if(!response.ok)return{checked:0,errors:1};
  const payload=await response.json() as {data?:Record<string,PushReceipt>};let checked=0;let errors=0;
  for(const delivery of data){
    const receipt=payload.data?.[String(delivery.ticket_id)];if(!receipt)continue;checked++;
    const errorCode=receipt.details?.error??null;if(receipt.status==='error')errors++;
    await client.from('notification_push_deliveries').update({receipt_status:receipt.status==='ok'?'delivered':'error',receipt_checked_at:new Date().toISOString(),error_code:errorCode,error_message:receipt.message??null}).eq('id',delivery.id);
    if(errorCode==='DeviceNotRegistered'&&delivery.device_id)await client.from('push_devices').update({active:false}).eq('id',delivery.device_id);
  }
  return{checked,errors};
}

async function finish(client:ReturnType<typeof createClient>,id:string,status:'sent'|'failed'|'skipped',errorMessage?:string){await client.from('notification_outbox').update({status,error_message:errorMessage??null,sent_at:status==='sent'?new Date().toISOString():null}).eq('id',id)}
async function finishMentor(client:ReturnType<typeof createClient>,id:string,status:'sent'|'failed'|'skipped',errorMessage?:string){await client.from('mentor_communication_outbox').update({status,error_message:errorMessage??null,sent_at:status==='sent'?new Date().toISOString():null}).eq('id',id)}
function mentorTaskTitle(key:string){if(key.includes('24h'))return'Send mentor 24-hour reminder';if(key.includes('1h'))return'Send mentor final reminder';if(key.includes('7d'))return'Send mentor 7-day reminder';if(key.includes('thank'))return'Send mentor thank-you';return'Send mentor session confirmation'}
function mentorEmailTitle(key:string,payload:Record<string,unknown>){const title=String(payload.title??'your mentorship session');if(key.includes('thank'))return`Thank you for ${title}`;if(key.includes('confirmed'))return`Confirmed: ${title}`;return`Reminder: ${title}`}
function mentorEmailBody(key:string,payload:Record<string,unknown>){const start=payload.starts_at?new Intl.DateTimeFormat('en-NG',{dateStyle:'full',timeStyle:'short',timeZone:'Africa/Lagos'}).format(new Date(String(payload.starts_at))):'the scheduled time';const link=String(payload.meeting_url??'');const prefix=key.includes('confirmed')?'Your GWMB mentorship session is confirmed.':'A reminder about your upcoming GWMB mentorship session.';return `${prefix} It is scheduled for ${start}.${link?` Meeting link: ${link}`:' GWMB Admin will share the meeting link separately.'}`}
function emailHtml(title:string,body:string){return `<!doctype html><html><body style="margin:0;background:#f7f5f6;font-family:Arial,sans-serif;color:#111"><div style="max-width:560px;margin:auto;padding:40px 20px"><div style="background:white;border-radius:24px;padding:32px"><p style="color:#a81455;font-size:12px;font-weight:700;letter-spacing:1px">GWMB UPDATE</p><h1 style="font-size:26px">${escapeHtml(title)}</h1><p style="color:#655f62;font-size:15px;line-height:1.6">${escapeHtml(body)}</p></div></div></body></html>`}
function escapeHtml(value:string){return value.replace(/[&<>'"]/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#039;','"':'&quot;'}[char]!))}
function json(value:unknown,status=200){return new Response(JSON.stringify(value),{status,headers:{...corsHeaders,'Content-Type':'application/json'}})}
