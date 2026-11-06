import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { createSignedUrl, publicUrl, uploadFile, type UploadControl } from '@/lib/storage';
import { getUser } from '@/lib/auth';
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
  const { data: auth } = await getUser();
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
  try {
    await uploadFile('content-media', path, blob, { contentType: asset.mimeType ?? 'image/jpeg' });
    return { url: publicUrl('content-media', path), error: null };
  } catch (error) {
    return { url: null, error: error instanceof Error ? error : new Error(String(error)) };
  }
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
  const control:UploadControl={paused:false,cancelled:false};

  return new Promise<{url:string|null;error:Error|null}>((resolve)=>{
    let settled=false;
    const finish=(value:{url:string|null;error:Error|null})=>{if(settled)return;settled=true;options.onController?.(null);resolve(value)};
    options.onController?.({
      pause:async()=>{control.paused=true},
      resume:()=>{control.paused=false;control.resume?.()},
      cancel:async()=>{control.cancelled=true;control.resume?.();finish({url:null,error:new Error('Upload cancelled.')})},
    });
    void (async()=>{
      try{
        const body=asset.file??await(await fetch(asset.uri)).blob();
        await uploadFile(bucket,path,body,{contentType:asset.mimeType??'application/octet-stream',onProgress:options.onProgress,control});
        finish({url:protectedAccess?`protected-content-media://${path}`:publicUrl('content-media',path),error:null});
      }catch(error){finish({url:null,error:error instanceof Error?error:new Error(String(error))})}
    })();
  });
}

export async function resolveContentFileUrl(value:string){
  const prefix='protected-content-media://';
  if(!value.startsWith(prefix))return{url:value,error:null};
  return createSignedUrl('protected-content-media',value.slice(prefix.length),15*60);
}

export async function createGoogleMeet(contentId: string) {
  return supabase.functions.invoke('google-calendar-create-event', { body: { contentId } });
}

export async function getGoogleCalendarStatus() {
  return supabase.functions.invoke('google-calendar-status');
}
