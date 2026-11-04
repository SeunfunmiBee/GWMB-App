import { Buffer } from 'node:buffer';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import pdf from 'npm:pdf-parse@1.1.1';
import mammoth from 'npm:mammoth@1.10.0';

const corsHeaders={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type'};
const DOCX='application/vnd.openxmlformats-officedocument.wordprocessingml.document';

Deno.serve(async(req)=>{
  if(req.method==='OPTIONS')return new Response('ok',{headers:corsHeaders});
  if(req.method!=='POST')return json({error:'Method not allowed.'},405);
  const authorization=req.headers.get('authorization')??'';
  const jwt=authorization.replace(/^Bearer\s+/i,'');
  const caller=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_ANON_KEY')!,{global:{headers:{Authorization:authorization}},auth:{persistSession:false}});
  const{data:{user}}=await caller.auth.getUser(jwt);
  if(!user)return json({error:'Sign in before reviewing a CV.'},401);
  const form=await req.formData().catch(()=>null);
  const file=form?.get('file');
  if(!(file instanceof File))return json({error:'Choose a PDF or DOCX file.'},400);
  if(file.size>10*1024*1024)return json({error:'Choose a file smaller than 10 MB.'},413);
  const mime=file.type||mimeFromName(file.name);
  if(mime!=='application/pdf'&&mime!==DOCX)return json({error:'Only PDF and DOCX files are supported.'},415);
  try{
    const bytes=new Uint8Array(await file.arrayBuffer());
    const text=mime==='application/pdf'?(await pdf(Buffer.from(bytes))).text:(await mammoth.extractRawText({buffer:Buffer.from(bytes)})).value;
    const clean=text.replace(/\u0000/g,'').replace(/[ \t]+\n/g,'\n').replace(/\n{4,}/g,'\n\n\n').trim();
    if(clean.length<80)return json({text:clean,complete:false,warning:'We could not confidently read enough text from this file. It may be scanned or image-based.'});
    return json({text:clean,complete:true});
  }catch{return json({text:'',complete:false,warning:'This file could not be read reliably. Paste the CV text so we do not analyse incomplete content.'});}
});

function mimeFromName(name:string){return name.toLowerCase().endsWith('.pdf')?'application/pdf':name.toLowerCase().endsWith('.docx')?DOCX:''}
function json(value:unknown,status=200){return new Response(JSON.stringify(value),{status,headers:{...corsHeaders,'Content-Type':'application/json'}})}
