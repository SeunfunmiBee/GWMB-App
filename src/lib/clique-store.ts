import { supabase } from '@/lib/supabase';

const storageKey = (userId: string) => `gwmb-joined-cliques:${userId}`;
const seatsKey = (userId: string) => `gwmb-clique-session-seats:${userId}`;
const updatesKey = (userId: string) => `gwmb-clique-updates:${userId}`;

function readLocal(userId: string) {
  try {
    const raw = globalThis.localStorage?.getItem(storageKey(userId));
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch { return []; }
}

function writeLocal(userId: string, ids: string[]) {
  try { globalThis.localStorage?.setItem(storageKey(userId), JSON.stringify(ids)); } catch { /* Best-effort offline fallback. */ }
}

export async function loadJoinedCliques(userId: string) {
  const local = readLocal(userId);
  const { data, error } = await supabase.from('clique_memberships').select('clique_id').eq('user_id', userId).order('joined_at', { ascending:false });
  if (error) return local;
  const ids = (data ?? []).map(item => String(item.clique_id));
  writeLocal(userId, ids);
  return ids;
}

export async function joinClique(userId: string, cliqueId: string) {
  const ids = Array.from(new Set([cliqueId, ...readLocal(userId)]));
  writeLocal(userId, ids);
  const { error } = await supabase.from('clique_memberships').upsert({ user_id:userId, clique_id:cliqueId }, { onConflict:'user_id,clique_id' });
  try { globalThis.localStorage?.setItem(updatesKey(userId), 'true'); } catch { /* best effort */ }
  return { ids, cloud:!error };
}

export async function loadCliqueSessionSeats(userId:string){
  let local:string[]=[];try{const raw=globalThis.localStorage?.getItem(seatsKey(userId));local=raw?JSON.parse(raw) as string[]:[]}catch{/* use cloud */}
  const{data,error}=await supabase.from('clique_session_seats').select('session_id').eq('user_id',userId).eq('status','saved').order('saved_at',{ascending:false});
  if(error)return local;
  const ids=(data??[]).map(item=>String(item.session_id));try{globalThis.localStorage?.setItem(seatsKey(userId),JSON.stringify(ids))}catch{/* best effort */}return ids;
}

export async function saveCliqueSessionSeat(userId:string,sessionId:string){const current=await loadCliqueSessionSeats(userId);const ids=Array.from(new Set([sessionId,...current]));try{globalThis.localStorage?.setItem(seatsKey(userId),JSON.stringify(ids))}catch{/* best effort */}await supabase.from('clique_session_seats').upsert({user_id:userId,session_id:sessionId,status:'saved',saved_at:new Date().toISOString()},{onConflict:'user_id,session_id'});return ids}

export function cliqueUpdatesEnabled(userId:string){try{return globalThis.localStorage?.getItem(updatesKey(userId))==='true'}catch{return false}}
