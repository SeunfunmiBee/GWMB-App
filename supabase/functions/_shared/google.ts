import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

export const corsHeaders = {'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type'};
export const json = (body: unknown, status=200) => new Response(JSON.stringify(body), {status,headers:{...corsHeaders,'Content-Type':'application/json'}});
export const adminClient = () => createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {auth:{persistSession:false}});

export async function requireAdmin(req: Request) {
  const token=req.headers.get('Authorization')?.replace('Bearer ','');
  if(!token)return {error:json({error:'Sign in as an administrator.'},401)};
  const client=adminClient();
  const {data:{user}}=await client.auth.getUser(token);
  if(!user)return {error:json({error:'Your admin session has expired.'},401)};
  const {data}=await client.from('app_admins').select('user_id').eq('user_id',user.id).maybeSingle();
  if(!data)return {error:json({error:'Admin access required.'},403)};
  return {user,client};
}

function bytesToBase64(bytes:Uint8Array){let value='';for(const byte of bytes)value+=String.fromCharCode(byte);return btoa(value)}
function base64ToBytes(value:string){const decoded=atob(value);return Uint8Array.from(decoded,char=>char.charCodeAt(0))}
async function encryptionKey(){const raw=Deno.env.get('GOOGLE_TOKEN_ENCRYPTION_KEY');if(!raw||raw.length<32)throw new Error('GOOGLE_TOKEN_ENCRYPTION_KEY must be at least 32 characters.');const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(raw));return crypto.subtle.importKey('raw',hash,{name:'AES-GCM'},false,['encrypt','decrypt'])}
export async function encryptToken(value:string){const iv=crypto.getRandomValues(new Uint8Array(12));const encrypted=await crypto.subtle.encrypt({name:'AES-GCM',iv},await encryptionKey(),new TextEncoder().encode(value));return `${bytesToBase64(iv)}.${bytesToBase64(new Uint8Array(encrypted))}`}
export async function decryptToken(value:string){const[iv,data]=value.split('.');const decrypted=await crypto.subtle.decrypt({name:'AES-GCM',iv:base64ToBytes(iv)},await encryptionKey(),base64ToBytes(data));return new TextDecoder().decode(decrypted)}

export function googleRedirectUri(){return `${Deno.env.get('SUPABASE_URL')}/functions/v1/google-calendar-auth-callback`}
export async function refreshGoogleAccessToken(refreshToken:string){const response=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:Deno.env.get('GOOGLE_CLIENT_ID')!,client_secret:Deno.env.get('GOOGLE_CLIENT_SECRET')!,refresh_token:refreshToken,grant_type:'refresh_token'})});const payload=await response.json();if(!response.ok)throw new Error(payload.error_description||'Google access token refresh failed.');return payload.access_token as string}
