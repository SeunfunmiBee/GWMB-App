import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { createSignedUrl, publicUrl, uploadFile, type UploadControl } from '@/lib/storage';
import { apiCall } from '@/lib/auth';

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
  const { data, error } = await apiCall<{ isAdmin: boolean }>('/v1/me');
  return { isAdmin: data?.isAdmin === true, error };
}

export async function listAdminContent(area?: string) {
  const { data, error } = await apiCall<ContentItem[]>(`/v1/admin/content${area ? `?area=${encodeURIComponent(area)}` : ''}`);
  return { data: (data ?? []) as ContentItem[], error };
}

export async function loadContentItem(id: string) {
  return apiCall<ContentItem | null>(`/v1/admin/content/${id}`);
}

export async function listPublishedContent(area: ContentArea) {
  const { data, error } = await apiCall<ContentItem[]>(`/v1/content?area=${encodeURIComponent(area)}`);
  return { data: (data ?? []) as ContentItem[], error };
}

export async function saveContentItem(draft: ContentDraft) {
  const { id, ...fields } = draft;
  return id
    ? apiCall<ContentItem>(`/v1/admin/content/${id}`, { method: 'PUT', body: JSON.stringify(fields) })
    : apiCall<ContentItem>('/v1/admin/content', { method: 'POST', body: JSON.stringify(fields) });
}

export async function archiveContentItem(id: string) {
  return apiCall<ContentItem>(`/v1/admin/content/${id}/archive`, { method: 'POST' });
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
  return apiCall<{ meetingUrl: string | null; eventId: string }>('/v1/admin/integrations/google/meet', { method: 'POST', body: JSON.stringify({ contentId }) });
}

export async function getGoogleCalendarStatus() {
  return apiCall<{ connected: boolean; email: string | null; connectedAt: string | null; configured: boolean }>('/v1/admin/integrations/google/status');
}

export async function startGoogleCalendarConnection() {
  return apiCall<{ url: string }>('/v1/admin/integrations/google/start', { method: 'POST' });
}
