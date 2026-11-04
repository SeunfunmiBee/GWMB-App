import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type'};
Deno.serve(async(req)=>{
  if(req.method==='OPTIONS')return new Response('ok',{headers:corsHeaders});
  if(req.method!=='POST')return json({error:'Method not allowed.'},405);
  const authorization=req.headers.get('authorization')??'';const jwt=authorization.replace(/^Bearer\s+/i,'');
  const caller=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_ANON_KEY')!,{global:{headers:{Authorization:authorization}},auth:{persistSession:false}});
  const{data:{user}}=await caller.auth.getUser(jwt);if(!user)return json({error:'Sign in before importing profile information.'},401);
  const body=await req.json().catch(()=>({})) as {url?:string};let url:URL;try{url=new URL(String(body.url??''))}catch{return json({error:'Enter a valid public URL.'},400)}
  if(!['http:','https:'].includes(url.protocol)||isPrivateHost(url.hostname))return json({error:'Use a public website URL.'},400);
  if(/(^|\.)linkedin\.com$/i.test(url.hostname))return json({error:'LinkedIn does not allow reliable direct profile imports. Download your LinkedIn profile as a PDF and upload it instead.',linkedinPdfRequired:true},422);
  try{const response=await fetch(url,{redirect:'follow',signal:AbortSignal.timeout(10000),headers:{'User-Agent':'GWMB-CV-Importer/1.0'}});if(!response.ok)return json({error:'That page could not be opened.'},400);const contentType=response.headers.get('content-type')??'';if(!/text\/(html|plain)/i.test(contentType))return json({error:'Use a public webpage containing your professional information.'},415);const html=(await response.text()).slice(0,2_000_000);const text=decode(html.replace(/<script[\s\S]*?<\/script>/gi,' ').replace(/<style[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ')).trim();if(text.length<100)return json({error:'We could not find enough readable professional information on that page.'},422);return json({text:text.slice(0,50000)});}catch{return json({error:'That page could not be imported. Try an old CV or LinkedIn profile PDF instead.'},400)}
});
function isPrivateHost(host:string){return host==='localhost'||host.endsWith('.local')||host==='0.0.0.0'||host==='127.0.0.1'||host==='::1'||/^\d+(\.\d+){3}$/.test(host)||host.includes(':')||/^10\./.test(host)||/^192\.168\./.test(host)||/^172\.(1[6-9]|2\d|3[01])\./.test(host)}
function decode(value:string){return value.replace(/&nbsp;/gi,' ').replace(/&amp;/gi,'&').replace(/&lt;/gi,'<').replace(/&gt;/gi,'>').replace(/&quot;/gi,'"').replace(/&#39;/gi,"'")}
function json(value:unknown,status=200){return new Response(JSON.stringify(value),{status,headers:{...corsHeaders,'Content-Type':'application/json'}})}
