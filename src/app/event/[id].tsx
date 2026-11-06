import { Ionicons } from '@expo/vector-icons';
import {
 router as expoRouter, useFocusEffect, useLocalSearchParams
} from 'expo-router';
import {
 useCallback, useMemo, useState, type ReactNode
} from 'react';
import {
 ActivityIndicator, Alert, Image, Linking, Pressable, StyleSheet, Text, View
} from 'react-native';

import { PageHeader } from '@/components/PageHeader';
import { Screen } from '@/components/Screen';
import { AppStateView } from '@/components/states/AppStateView';
import {
 cancelEventRegistration, loadEventRegistration, loadRegisteredEventMeeting, type EventMeetingAccess, type EventRegistration
} from '@/lib/event-store';
import { cancelLocalEventReminders } from '@/lib/notification-store';
import { cmsEvent, usePublishedContentState } from '@/lib/content-runtime';
import { useAuth } from '@/providers/AuthProvider';
import {
 colors, fonts
} from '@/theme';

const router = { push: (href: string) => expoRouter.push(href as never) };
type OpenSection = 'about' | 'speaker' | 'agenda' | 'eligibility' | 'prep' | 'none';

export default function EventDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const content=usePublishedContentState('events');
  const cmsItem=useMemo(()=>content.items.find(candidate=>candidate.slug===id),[content.items,id]);
  const event = useMemo(()=>cmsItem?cmsEvent(cmsItem):null,[cmsItem]);
  const registrationId=cmsItem?.id??'';
  const {
 user, membership
} = useAuth();
  const [open, setOpen] = useState<OpenSection>('about');
  const [registration, setRegistration] = useState<EventRegistration | null>(null);
  const [meeting, setMeeting] = useState<EventMeetingAccess | null>(null);
  const [loading, setLoading] = useState(Boolean(user));
  const [cancelling, setCancelling] = useState(false);
  const userId = user?.id;

  useFocusEffect(useCallback(() => {
    let active = true;
    if (!userId || !registrationId) { setRegistration(null); setMeeting(null); setLoading(false); return () => { active = false; }; }
    setLoading(true);
    Promise.all([loadEventRegistration(userId, registrationId),loadRegisteredEventMeeting(registrationId)]).then(([result,meetingResult]) => { if (active) { setRegistration(result.registration); setMeeting(meetingResult.access); setLoading(false); } });
    return () => { active = false; };
  }, [registrationId, userId]));

  if (content.loading) return <Screen><PageHeader title="Event"/><View style={styles.state}><ActivityIndicator color={colors.pinkDeep}/></View></Screen>;
  if (content.error) return <Screen><PageHeader title="Event"/><AppStateView kind="error" copy={content.error.message} actionLabel="Try again" onAction={()=>void content.refresh()}/></Screen>;
  if (!event) return <Screen><PageHeader title="Event"/><AppStateView kind="no-results" eyebrow="EVENT UNAVAILABLE" title="This event is no longer available." copy="It may have been unpublished or the link may be incorrect." actionLabel="View all events" onAction={()=>router.push('/events')}/></Screen>;
  const activeEvent=event;

  const activeRegistration = registration && registration.status !== 'cancelled' ? registration : null;
  const memberLocked = event.access === 'Members Only' && membership?.status !== 'verified';
  const primaryLabel = event.lifecycle === 'past' || event.bookingMode === 'closed' ? 'Registration closed' : !user ? 'Sign in to register' : memberLocked ? 'Explore membership' : activeRegistration ? (activeRegistration.status === 'waitlisted' ? 'You’re on the waitlist' : 'You’re registered') : event.bookingMode === 'waitlist' ? 'Join the waitlist' : 'Register for this event';

  function primaryAction() {
    if (activeEvent.lifecycle === 'past' || activeEvent.bookingMode === 'closed' || activeRegistration) return;
    if (!user) { router.push('/sign-in'); return; }
    if (memberLocked) { router.push('/membership'); return; }
    router.push(`/registration/${activeEvent.id}`);
  }

  function requestCancellation() {
    if (!userId || !activeRegistration) return;
    Alert.alert('Cancel your place?', 'You can register again later if places are still available.', [
      {
 text: 'Keep my place',
style: 'cancel'
},
      {
 text: 'Cancel registration',
style: 'destructive',
onPress: async () => {
        setCancelling(true);
        const result = await cancelEventRegistration(userId, registrationId);
        if (result.ok && result.registration) { setRegistration(result.registration); await cancelLocalEventReminders(registrationId); }
        setCancelling(false);
      }
},
    ]);
  }

  async function joinEvent(){
    if(!meeting?.join_available||!meeting.meeting_url)return;
    const supported=await Linking.canOpenURL(meeting.meeting_url);
    if(supported)await Linking.openURL(meeting.meeting_url);
    else Alert.alert('Meeting link unavailable','This joining link could not be opened on your device.');
  }

  const section = (key: Exclude<OpenSection, 'none'>, title: string, content: ReactNode) => <Pressable onPress={() => setOpen(open === key ? 'none' : key)} style={[styles.accordion, open === key && styles.accordionOpen]}><View style={styles.accordionHead}><Text style={styles.accordionTitle}>{title}</Text><Ionicons name={open === key ? 'remove' : 'add'} size={19} color={open === key ? colors.pinkDeep : colors.ink}/></View>{open === key ? <View style={styles.accordionBody}>{content}</View> : null}</Pressable>;

  return <Screen><PageHeader title="Event" eyebrow={event.type}/><View style={[styles.media, { backgroundColor: event.tone }]}>{event.image ? <Image source={event.image} style={styles.mediaImage} resizeMode="cover"/> : <><View style={styles.mediaMark}><Text style={styles.mediaInitials}>{event.initials}</Text></View><Ionicons name="sparkles" size={28} color="#FFD100" style={styles.spark}/></>}<View style={styles.mediaShade}/><View style={styles.mediaText}><Text style={styles.tag}>{event.type}</Text><Text style={styles.mediaTitle}>{event.title}</Text></View></View><View style={styles.badges}><View style={styles.badge}><Text style={styles.badgeText}>{event.access}</Text></View><View style={event.lifecycle === 'upcoming' ? styles.live : styles.past}><View style={event.lifecycle === 'upcoming' ? styles.liveDot : styles.pastDot}/><Text style={event.lifecycle === 'upcoming' ? styles.liveText : styles.pastText}>{event.lifecycle === 'upcoming' ? 'UPCOMING' : 'PAST EVENT'}</Text></View></View><Text style={styles.title}>{event.title}</Text><Text style={styles.copy}>{event.copy}</Text><View style={styles.facts}><View style={styles.fact}><Ionicons name="calendar-outline" size={20} color={colors.pinkDeep}/><View style={styles.factCopy}><Text style={styles.factLabel}>DATE & TIME</Text><Text style={styles.factValue}>{event.date}</Text></View></View><View style={styles.fact}><Ionicons name="location-outline" size={20} color={colors.pinkDeep}/><View style={styles.factCopy}><Text style={styles.factLabel}>LOCATION</Text><Text style={styles.factValue}>{event.location}</Text></View></View></View>{activeRegistration ? <View style={styles.confirmation}><View style={styles.confirmationIcon}><Ionicons name={activeRegistration.status === 'waitlisted' ? 'time' : 'checkmark'} size={18} color="white"/></View><View style={styles.confirmationCopy}><Text style={styles.confirmationTitle}>{activeRegistration.status === 'waitlisted' ? 'Waitlist request received' : 'Your place is confirmed'}</Text><Text style={styles.confirmationText}>{activeRegistration.status === 'waitlisted' ? 'We’ll email you if a place becomes available.' : 'This event now appears in My Events.'}</Text></View></View> : null}{activeRegistration?.status==='registered'&&meeting?<Pressable disabled={!meeting.join_available||!meeting.meeting_url} onPress={()=>void joinEvent()} style={[styles.join,(!meeting.join_available||!meeting.meeting_url)&&styles.joinLocked]}><View style={styles.joinIcon}><Ionicons name={meeting.join_available?'videocam':'time-outline'} size={20} color="white"/></View><View style={styles.joinCopy}><Text style={styles.joinTitle}>{meeting.join_available&&meeting.meeting_url?'Join live event':'Joining link protected'}</Text><Text style={styles.joinText}>{meeting.join_available&&meeting.meeting_url?'Your verified attendee link is ready.':meeting.unavailable_reason??`Joining opens ${new Date(meeting.available_at).toLocaleString('en-NG')}.`}</Text></View><Ionicons name={meeting.join_available?'open-outline':'lock-closed-outline'} size={19} color="white"/></Pressable>:null}<Text style={styles.sectionLabel}>YOUR HOST</Text><View style={styles.speaker}><View style={styles.speakerAvatar}><Text style={styles.speakerInitials}>{event.initials}</Text></View><View style={styles.speakerCopy}><Text style={styles.speakerName}>{event.speaker}</Text><Text style={styles.speakerRole}>{event.role}</Text></View></View><View style={styles.accordions}>{section('about', 'About this event', <Text style={styles.bodyCopy}>{event.about}</Text>)}{section('speaker', `About ${event.speaker}`, <Text style={styles.bodyCopy}>{event.speakerAbout}</Text>)}{section('agenda', 'Agenda', event.agenda.map((item) => <View key={item} style={styles.point}><Ionicons name="checkmark" size={14} color={colors.pinkDeep}/><Text style={styles.pointText}>{item}</Text></View>))}{section('eligibility', 'Eligibility', <Text style={styles.bodyCopy}>{event.eligibility}</Text>)}{section('prep', 'Before you join', event.prep.map((item) => <View key={item} style={styles.point}><Ionicons name="sparkles-outline" size={14} color={colors.pinkDeep}/><Text style={styles.pointText}>{item}</Text></View>))}</View><Pressable disabled={loading || event.lifecycle === 'past' || event.bookingMode === 'closed' || Boolean(activeRegistration)} onPress={primaryAction} style={[styles.register, (event.lifecycle === 'past' || event.bookingMode === 'closed' || activeRegistration) && styles.registerDisabled]}>{loading ? <ActivityIndicator color="white"/> : <><Text style={styles.registerText}>{primaryLabel}</Text><Ionicons name={activeRegistration ? 'checkmark-circle' : 'arrow-forward'} size={18} color="white"/></>}</Pressable>{activeRegistration ? <Pressable disabled={cancelling} onPress={requestCancellation} style={styles.cancel}>{cancelling ? <ActivityIndicator color={colors.pinkDeep}/> : <Text style={styles.cancelText}>Cancel {activeRegistration.status === 'waitlisted' ? 'waitlist request' : 'registration'}</Text>}</Pressable> : null}</Screen>;
}

const styles = StyleSheet.create({
state:{minHeight:240,alignItems:'center',justifyContent:'center'},
media:{
height:310,
borderRadius:25,
overflow:'hidden'
},
mediaImage:{
width:'100%',
height:'100%'
},
mediaShade:{
position:'absolute',
top:0,
right:0,
bottom:0,
left:0,
backgroundColor:'rgba(0,0,0,.27)'
},
mediaText:{
position:'absolute',
left:20,
right:20,
bottom:20
},
tag:{
color:'white',
fontSize:9,
fontFamily:fonts.bodyBold,
letterSpacing:1.1
},
mediaTitle:{
color:'white',
fontSize:34,
lineHeight:38,
fontFamily:fonts.heading,
letterSpacing:-1,
marginTop:8,
maxWidth:'92%'
},
mediaMark:{
position:'absolute',
width:105,
height:105,
borderRadius:35,
backgroundColor:'rgba(255,255,255,.16)',
alignItems:'center',
justifyContent:'center',
right:24,
top:28
},
mediaInitials:{
color:'white',
fontSize:25,
fontFamily:fonts.heading
},
spark:{
position:'absolute',
left:24,
top:25
},
badges:{
flexDirection:'row',
gap:7,
marginTop:17
},
badge:{
paddingHorizontal:9,
paddingVertical:6,
borderRadius:999,
backgroundColor:colors.pinkSoft
},
badgeText:{
color:colors.pinkDeep,
fontSize:9,
fontFamily:fonts.bodyBold
},
live:{
flexDirection:'row',
alignItems:'center',
gap:5,
paddingHorizontal:9,
paddingVertical:6,
borderRadius:999,
backgroundColor:'#E6F6F0'
},
liveDot:{
width:5,
height:5,
borderRadius:3,
backgroundColor:'#0B815B'
},
liveText:{
color:'#0B815B',
fontSize:9,
fontFamily:fonts.bodyBold
},
past:{
flexDirection:'row',
alignItems:'center',
gap:5,
paddingHorizontal:9,
paddingVertical:6,
borderRadius:999,
backgroundColor:'#ECEAEC'
},
pastDot:{
width:5,
height:5,
borderRadius:3,
backgroundColor:colors.muted
},
pastText:{
color:colors.muted,
fontSize:9,
fontFamily:fonts.bodyBold
},
title:{
color:colors.ink,
fontSize:30,
lineHeight:36,
fontFamily:fonts.heading,
letterSpacing:-.9,
marginTop:12
},
copy:{
color:colors.muted,
fontSize:15,
lineHeight:23,
fontFamily:fonts.body,
marginTop:8
},
facts:{
gap:9,
marginTop:20
},
fact:{
minHeight:84,
borderRadius:21,
backgroundColor:colors.surface,
borderWidth:1,
borderColor:colors.line,
paddingHorizontal:15,
flexDirection:'row',
gap:13,
alignItems:'center'
},
factCopy:{flex:1},
factLabel:{
color:colors.pinkDeep,
fontSize:9,
fontFamily:fonts.bodyBold,
letterSpacing:.7
},
factValue:{
color:colors.ink,
fontSize:13.5,
fontFamily:fonts.bodyBold,
marginTop:4
},
confirmation:{
marginTop:12,
borderRadius:18,
backgroundColor:'#E9F7F1',
padding:14,
flexDirection:'row',
alignItems:'center'
},
confirmationIcon:{
width:36,
height:36,
borderRadius:12,
backgroundColor:'#087553',
alignItems:'center',
justifyContent:'center'
},
confirmationCopy:{
flex:1,
paddingLeft:11
},
confirmationTitle:{
color:'#075C43',
fontSize:14,
fontFamily:fonts.headingBold
},
confirmationText:{
color:'#37715F',
fontSize:12,
lineHeight:18,
fontFamily:fonts.body,
marginTop:2
},
join:{
minHeight:82,
borderRadius:20,
backgroundColor:'#087553',
padding:14,
flexDirection:'row',
alignItems:'center',
gap:11,
marginTop:10
},
joinLocked:{backgroundColor:'#383238'},
joinIcon:{width:43,height:43,borderRadius:14,backgroundColor:'rgba(255,255,255,.16)',alignItems:'center',justifyContent:'center'},
joinCopy:{flex:1},
joinTitle:{color:'white',fontSize:14,fontFamily:fonts.headingBold},
joinText:{color:'rgba(255,255,255,.78)',fontSize:10,lineHeight:15,fontFamily:fonts.body,marginTop:3},
sectionLabel:{
color:colors.pinkDeep,
fontSize:9,
fontFamily:fonts.bodyBold,
letterSpacing:1,
marginTop:25,
marginBottom:9
},
speaker:{
flexDirection:'row',
alignItems:'center',
padding:17,
borderRadius:18,
backgroundColor:colors.surface,
borderWidth:1,
borderColor:colors.line
},
speakerAvatar:{
width:47,
height:47,
borderRadius:16,
backgroundColor:colors.ink,
alignItems:'center',
justifyContent:'center'
},
speakerInitials:{
color:'white',
fontSize:12,
fontFamily:fonts.heading
},
speakerCopy:{
flex:1,
paddingLeft:11
},
speakerName:{
fontSize:15,
fontFamily:fonts.headingBold,
color:colors.ink
},
speakerRole:{
fontSize:12,
fontFamily:fonts.body,
color:colors.muted,
marginTop:3
},
accordions:{
gap:8,
marginTop:20
},
accordion:{
borderRadius:20,
borderWidth:1,
borderColor:colors.line,
backgroundColor:colors.surface,
padding:18
},
accordionOpen:{borderColor:'#F3A5CA'},
accordionHead:{
flexDirection:'row',
alignItems:'center',
justifyContent:'space-between'
},
accordionTitle:{
color:colors.ink,
fontSize:14.5,
fontFamily:fonts.headingBold,
flex:1,
paddingRight:10
},
accordionBody:{paddingTop:11},
bodyCopy:{
color:colors.muted,
fontSize:13,
lineHeight:21,
fontFamily:fonts.body
},
point:{
flexDirection:'row',
alignItems:'center',
gap:8,
marginBottom:8
},
pointText:{
flex:1,
color:colors.ink,
fontSize:13,
fontFamily:fonts.bodyMedium
},
register:{
minHeight:64,
borderRadius:20,
backgroundColor:colors.pinkDeep,
marginTop:21,
paddingHorizontal:17,
flexDirection:'row',
alignItems:'center',
justifyContent:'space-between'
},
registerDisabled:{backgroundColor:colors.ink},
registerText:{
color:'white',
fontSize:14,
fontFamily:fonts.bodyBold
},
cancel:{
minHeight:46,
alignItems:'center',
justifyContent:'center',
marginTop:8
},
cancelText:{
color:colors.pinkDeep,
fontSize:10,
fontFamily:fonts.bodyBold
}
});
