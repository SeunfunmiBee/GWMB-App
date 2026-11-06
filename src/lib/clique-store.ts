import { apiCall } from '@/lib/auth';

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
  const { data, error } = await apiCall<string[]>('/v1/community/cliques');
  if (error) return local;
  const ids = data ?? [];
  writeLocal(userId, ids);
  return ids;
}

export async function joinClique(userId: string, cliqueId: string) {
  const ids = Array.from(new Set([cliqueId, ...readLocal(userId)]));
  writeLocal(userId, ids);
  const { error } = await apiCall(`/v1/community/cliques/${encodeURIComponent(cliqueId)}`, { method: 'PUT' });
  try { globalThis.localStorage?.setItem(updatesKey(userId), 'true'); } catch { /* best effort */ }
  return { ids, cloud:!error };
}

export async function loadCliqueSessionSeats(userId:string){
  let local:string[]=[];try{const raw=globalThis.localStorage?.getItem(seatsKey(userId));local=raw?JSON.parse(raw) as string[]:[]}catch{/* use cloud */}
  const{data,error}=await apiCall<string[]>('/v1/community/clique-seats');
  if(error)return local;
  const ids=data??[];try{globalThis.localStorage?.setItem(seatsKey(userId),JSON.stringify(ids))}catch{/* best effort */}return ids;
}

export async function saveCliqueSessionSeat(userId:string,sessionId:string){const current=await loadCliqueSessionSeats(userId);const ids=Array.from(new Set([sessionId,...current]));try{globalThis.localStorage?.setItem(seatsKey(userId),JSON.stringify(ids))}catch{/* best effort */}await apiCall(`/v1/community/clique-seats/${encodeURIComponent(sessionId)}`,{method:'PUT'});return ids}

export function cliqueUpdatesEnabled(userId:string){try{return globalThis.localStorage?.getItem(updatesKey(userId))==='true'}catch{return false}}
