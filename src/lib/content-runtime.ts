import { useCallback, useEffect, useState } from 'react';
import type { GwmbEvent } from '@/data/events';
import type { Opportunity } from '@/data/opportunities';
import { listPublishedContent, type ContentArea, type ContentItem } from '@/lib/admin-content';
import { supabase } from '@/lib/supabase';

export type PublishedContentState = {
  items: ContentItem[];
  loading: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
};

export function usePublishedContentState(area: ContentArea): PublishedContentState {
  const [items, setItems] = useState<ContentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const refresh = useCallback(async () => {
    setLoading(true);
    const result = await listPublishedContent(area);
    if (result.error) {
      setError(new Error(result.error.message));
    } else {
      setItems(result.data.filter(item => item.visible));
      setError(null);
    }
    setLoading(false);
  }, [area]);

  useEffect(() => {
    void Promise.resolve().then(refresh);
    const channel = supabase
      .channel(`published-content-${area}-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'content_items', filter: `area=eq.${area}` }, () => void refresh())
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [area, refresh]);

  return { items, loading, error, refresh };
}

export function usePublishedContent(area: ContentArea) {
  return usePublishedContentState(area).items;
}

const text=(value:unknown,fallback='')=>typeof value==='string'?value:fallback;
const list=(value:unknown,fallback:string[]=[])=>Array.isArray(value)?value.filter(item=>typeof item==='string') as string[]:fallback;

export function cmsEvent(item: ContentItem, fallback?: GwmbEvent): GwmbEvent {
  const start=item.starts_at?new Date(item.starts_at):null;
  const past=Boolean(start&&start.getTime()<Date.now());
  const metadata=item.metadata??{};
  const speakerRecord=metadata.speaker&&typeof metadata.speaker==='object'?metadata.speaker as Record<string,unknown>:{};
  const access=item.access_level==='members'?'Members Only':'Open Access';
  return {
    id:item.slug,
    type:item.eyebrow||fallback?.type||'GWMB EVENT',
    title:item.title,
    copy:item.summary||fallback?.copy||'',
    date:start?start.toLocaleString('en-NG',{weekday:'long',day:'numeric',month:'long',hour:'numeric',minute:'2-digit'}):fallback?.date||'Date to be announced',
    dateShort:start?start.toLocaleString('en-NG',{day:'2-digit',month:'short',hour:'numeric',minute:'2-digit'}):fallback?.dateShort||'Coming soon',
    startsAt:item.starts_at||fallback?.startsAt,
    day:start?String(start.getDate()).padStart(2,'0'):fallback?.day||'--',
    month:start?start.toLocaleString('en-NG',{month:'short'}).toUpperCase():fallback?.month||'TBA',
    location:text(metadata.venue,text(metadata.location,fallback?.location||'Details to be announced')), access,
    lifecycle:text(metadata.lifecycle,past?'past':'upcoming') as GwmbEvent['lifecycle'],
    bookingMode:text(metadata.bookingMode,fallback?.bookingMode||'register') as GwmbEvent['bookingMode'],
    speaker:text(speakerRecord.name,text(metadata.speaker,fallback?.speaker||'GWMB Team')), role:text(speakerRecord.role,text(metadata.role,fallback?.role||'Girls Who Mean Business')),
    initials:text(metadata.initials,fallback?.initials||item.title.split(' ').slice(0,2).map(word=>word[0]).join('').toUpperCase()),
    tone:text(metadata.color,fallback?.tone||'#A81455'), about:item.body||fallback?.about||item.summary||'',
    speakerAbout:text(speakerRecord.bio,text(metadata.speakerAbout,fallback?.speakerAbout||'')), eligibility:text(metadata.eligibility,fallback?.eligibility||`${access}.`),
    agenda:list(metadata.agenda,fallback?.agenda||[]), prep:list(metadata.prep,fallback?.prep||[]),
    image:item.image_url?{uri:item.image_url}:fallback?.image,
  };
}

export function cmsOpportunity(item:ContentItem,fallback?:Opportunity):Opportunity {
  const metadata=item.metadata??{};
  const deadline=text(metadata.deadline,fallback?.deadlineAt||'');
  const aiAssistance=metadata.aiAssistance==='restricted'?'restricted':fallback?.aiAssistance||'allowed';
  return {id:item.slug,initials:text(metadata.initials,fallback?.initials||item.title.slice(0,2).toUpperCase()),title:item.title,org:text(metadata.organisation,fallback?.org||item.eyebrow||'GWMB Partner'),type:text(metadata.type,fallback?.type||'Opportunity'),location:text(metadata.location,fallback?.location||'Nigeria'),deadline:deadline&&deadline!=='Rolling'?`Closes ${new Date(deadline).toLocaleDateString('en-NG',{day:'2-digit',month:'short'})}`:deadline||fallback?.deadline||'Rolling',deadlineAt:deadline||fallback?.deadlineAt,source:text(metadata.source,fallback?.source||'GWMB Partner'),access:item.access_level==='members'?'Members Only':'Open Access',summary:item.summary||fallback?.summary||'',aiAssistance,aiPolicy:text(metadata.aiPolicy,fallback?.aiPolicy||'')||undefined};
}
