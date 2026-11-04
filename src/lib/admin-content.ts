import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import * as tus from 'tus-js-client';

import { supabase } from '@/lib/supabase';

export const contentAreas = [
  ['home', 'Home'],
  ['grow-career', 'Grow · Career'],
  ['grow-mentorship', 'Grow · Mentorship'],
  ['grow-learning', 'Grow · Learning'],
  ['grow-money', 'Grow · Smart Money Girl'],
  ['grow-personal-growth', 'Grow · Personal Growth'],
  ['grow-leadership', 'Grow · Leadership'],
  ['community', 'Community'],
  ['opportunities', 'Opportunities'],
  ['events', 'Events & trainings'],
  ['courses', 'Courses'],
  ['resources', 'Resources'],
  ['member-wins', 'Member Spotlights'],
] as const;

export type ContentArea = typeof contentAreas[number][0];
export type ContentStatus = 'draft' | 'scheduled' | 'published' | 'archived';
export type ContentAccess = 'open' | 'account' | 'members' | 'admin';

export type ContentItem = {
  id: string;
  slug: string;
  area: ContentArea;
  content_type: string;
  title: string;
  eyebrow: string | null;
  summary: string | null;
  body: string | null;
  image_url: string | null;
  route: string | null;
  access_level: ContentAccess;
  status: ContentStatus;
  featured: boolean;
  visible: boolean;
  sort_order: number;
  publish_at: string | null;
  starts_at: string | null;
  ends_at: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type ContentDraft = Omit<ContentItem, 'id' | 'created_at' | 'updated_at'> & { id?: string };

export async function isAppAdmin() {
  const { data, error } = await supabase.rpc('is_app_admin');
  return { isAdmin: data === true, error };
}

export async function listAdminContent(area?: string) {
  let query = supabase.from('content_items').select('*').order('sort_order').order('updated_at', { ascending: false });
  if (area) query = query.eq('area', area);
  const { data, error } = await query;
  return { data: (data ?? []) as ContentItem[], error };
}

export async function loadContentItem(id: string) {
  const { data, error } = await supabase.from('content_items').select('*').eq('id', id).maybeSingle();
  return { data: data as ContentItem | null, error };
}

export async function listPublishedContent(area: ContentArea) {
  const { data, error } = await supabase.from('content_items').select('*').eq('area', area).eq('status', 'published').eq('visible', true).order('sort_order');
  return { data: (data ?? []) as ContentItem[], error };
}

export async function saveContentItem(draft: ContentDraft) {
  const { data: auth } = await supabase.auth.getUser();
  const payload = { ...draft, updated_by: auth.user?.id ?? null };
  if (draft.id) {
    const { id, ...update } = payload;
    return supabase.from('content_items').update(update).eq('id', id).select().single();
  }
  return supabase.from('content_items').insert({ ...payload, created_by: auth.user?.id ?? null }).select().single();
}

export async function archiveContentItem(id: string) {
  return supabase.from('content_items').update({ status: 'archived' }).eq('id', id);
}

export async function pickAndUploadContentImage(area: string) {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) return { url: null, error: new Error('Photo library access is required to choose an image.') };
  const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, quality: 0.86 });
  if (result.canceled || !result.assets[0]?.uri) return { url: null, error: null };
  const asset = result.assets[0];
  const response = await fetch(asset.uri);
  const blob = await response.blob();
  const extension = asset.fileName?.split('.').pop()?.toLowerCase() || asset.mimeType?.split('/').pop() || 'jpg';
  const path = `${area}/${Date.now()}-${Math.random().toString(36).slice(2)}.${extension}`;
  const upload = await supabase.storage.from('content-media').upload(path, blob, { contentType: asset.mimeType ?? 'image/jpeg', upsert: false });
  if (upload.error) return { url: null, error: upload.error };
  return { url: supabase.storage.from('content-media').getPublicUrl(path).data.publicUrl, error: null };
}

export type ContentUploadController = {
  pause: () => Promise<void>;
  resume: () => void;
  cancel: () => Promise<void>;
};

type ContentUploadOptions = {
  onProgress?: (progress: number) => void;
  onController?: (controller: ContentUploadController | null) => void;
};

export async function pickAndUploadContentFile(area: string, type: string | string[] = '*/*', protectedAccess = false, options: ContentUploadOptions = {}) {
  const result = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true, type });
  if (result.canceled || !result.assets[0]?.uri) return { url: null, error: null };
  const asset = result.assets[0];
  const extension = asset.name.split('.').pop()?.toLowerCase() || 'bin';
  const path = `${area}/${Date.now()}-${Math.random().toString(36).slice(2)}.${extension}`;
  const bucket=protectedAccess?'protected-content-media':'content-media';
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) return { url: null, error: new Error('Your Admin session expired. Sign in again before uploading.') };

  const configuredUrl=process.env.EXPO_PUBLIC_SUPABASE_URL;
  if(!configuredUrl)return{url:null,error:new Error('Storage is not configured.')};
  const projectRef=new URL(configuredUrl).hostname.split('.')[0];
  const endpoint=`https://${projectRef}.storage.supabase.co/storage/v1/upload/resumable`;
  const source=asset.file??{uri:asset.uri,name:asset.name,type:asset.mimeType??'application/octet-stream'};

  return new Promise<{url:string|null;error:Error|null}>((resolve)=>{
    let settled=false;
    const finish=(value:{url:string|null;error:Error|null})=>{if(settled)return;settled=true;options.onController?.(null);resolve(value)};
    const upload=new tus.Upload(source as never,{
      endpoint,
      retryDelays:[0,3000,5000,10000,20000],
      chunkSize:6*1024*1024,
      uploadDataDuringCreation:true,
      removeFingerprintOnSuccess:true,
      headers:{authorization:`Bearer ${session.access_token}`,'x-upsert':'false'},
      metadata:{bucketName:bucket,objectName:path,contentType:asset.mimeType??'application/octet-stream',cacheControl:'3600'},
      onProgress:(uploaded,total)=>options.onProgress?.(total>0?Math.round((uploaded/total)*100):0),
      onError:error=>finish({url:null,error:error instanceof Error?error:new Error(String(error))}),
      onSuccess:()=>finish({url:protectedAccess?`protected-content-media://${path}`:supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl,error:null}),
    });
    options.onController?.({
      pause:()=>upload.abort(false),
      resume:()=>upload.start(),
      cancel:async()=>{await upload.abort(true);finish({url:null,error:new Error('Upload cancelled.')})},
    });
    void (async()=>{
      try{
        if(tus.canStoreURLs){const previous=await upload.findPreviousUploads();if(previous.length)upload.resumeFromPreviousUpload(previous[0])}
        upload.start();
      }catch(error){finish({url:null,error:error instanceof Error?error:new Error(String(error))})}
    })();
  });
}

export async function resolveContentFileUrl(value:string){
  const prefix='protected-content-media://';
  if(!value.startsWith(prefix))return{url:value,error:null};
  const path=value.slice(prefix.length);
  const{data,error}=await supabase.storage.from('protected-content-media').createSignedUrl(path,15*60);
  return{url:data?.signedUrl??null,error};
}

export async function createGoogleMeet(contentId: string) {
  return supabase.functions.invoke('google-calendar-create-event', { body: { contentId } });
}

export async function getGoogleCalendarStatus() {
  return supabase.functions.invoke('google-calendar-status');
}
