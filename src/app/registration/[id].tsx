import { Ionicons } from '@expo/vector-icons';
import {
 router as expoRouter, useLocalSearchParams
} from 'expo-router';
import {
 useEffect, useMemo, useState
} from 'react';
import {
 ActivityIndicator, Alert, Pressable, StyleSheet, Text, TextInput, View
} from 'react-native';

import { PageHeader } from '@/components/PageHeader';
import { Screen } from '@/components/Screen';
import { CelebrationBurst } from '@/components/motion/Celebration';
import { FadeIn } from '@/components/motion/FadeIn';
import { AppStateView } from '@/components/states/AppStateView';
import {
 loadEventRegistration, registerForEvent, type EventRegistration
} from '@/lib/event-store';
import { successFeedback } from '@/lib/feedback';
import {
 loadNotificationPreferences, registerPushDevice, scheduleLocalEventReminders
} from '@/lib/notification-store';
import { useAuth } from '@/providers/AuthProvider';
import {
 colors, fonts
} from '@/theme';
import { cmsEvent, usePublishedContentState } from '@/lib/content-runtime';

const router = { replace: (href: string) => expoRouter.replace(href as never) };

export default function Registration() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const content=usePublishedContentState('events');
  const cmsItem=useMemo(()=>content.items.find(candidate=>candidate.slug===id),[content.items,id]);
  const event = useMemo(()=>cmsItem?cmsEvent(cmsItem):null,[cmsItem]);
  const registrationId=cmsItem?.id??'';
  const {
 user, profile, membership
} = useAuth();
  const [name, setName] = useState(profile?.full_name ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [goal, setGoal] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ registration: EventRegistration; cloud: boolean } | null>(null);
  const [remindersOn, setRemindersOn] = useState(false);
  const waitlist = event?.bookingMode === 'waitlist';

  useEffect(() => {
    if (!user || !registrationId) return;
    loadEventRegistration(user.id, registrationId).then(({ registration }) => {
      setName((current) => current || profile?.full_name || '');
      setEmail((current) => current || user.email || '');
      if (registration && registration.status !== 'cancelled') setResult({
 registration,
cloud: true
});
    });
  }, [profile?.full_name, registrationId, user]);

  async function submit() {
    setMessage(null);
    if (!event || !registrationId) { setMessage('This event is no longer available.'); return; }
    if (!user) { router.replace('/sign-in'); return; }
    if (event.access === 'Members Only' && membership?.status !== 'verified') { router.replace('/membership'); return; }
    if (name.trim().length < 2) { setMessage('Enter your full name.'); return; }
    if (!email.includes('@')) { setMessage('Enter a valid email address.'); return; }
    setSubmitting(true);
    const response = await registerForEvent({
 userId: user.id,
eventId: registrationId,
eventTitle: event.title,
eventStartsAt: event.startsAt,
eventRoute: `/event/${event.id}`,
fullName: name.trim(),
email: email.trim().toLowerCase(),
learningGoal: goal.trim(),
status: waitlist ? 'waitlisted' : 'registered'
});
    setSubmitting(false);
    if (!response.ok) {
      setMessage(response.duplicate ? 'You already have an active registration for this event.' : response.error?.message ?? 'We could not confirm your place. Check your connection and try again.');
      return;
    }
    setResult({
 registration: response.registration,
cloud: response.cloud
});
    const { preferences } = await loadNotificationPreferences(user.id);
    if (preferences.push_enabled && !waitlist) { await scheduleLocalEventReminders(event, preferences); setRemindersOn(true); }
    void successFeedback();
  }

  async function enableReminders(){
    if(!user||!event)return;
    setSubmitting(true);
    const permission=await registerPushDevice(user.id,true);
    if(!permission.enabled){setSubmitting(false);Alert.alert('Could not enable reminders',permission.reason);return}
    const{preferences}=await loadNotificationPreferences(user.id);
    await scheduleLocalEventReminders(event,preferences);
    setRemindersOn(true);
    setSubmitting(false);
    Alert.alert('Reminders are on','We will remind you before this event begins.');
  }

  if (content.loading) return <Screen><PageHeader title="Register"/><View style={styles.loading}><ActivityIndicator color={colors.pinkDeep}/></View></Screen>;
  if (content.error) return <Screen><PageHeader title="Register"/><AppStateView kind="error" copy={content.error.message} actionLabel="Try again" onAction={()=>void content.refresh()}/></Screen>;
  if (!event) return <Screen><PageHeader title="Register"/><AppStateView kind="no-results" eyebrow="REGISTRATION UNAVAILABLE" title="This event cannot be registered for." copy="It may have been unpublished, completed or removed." actionLabel="View upcoming events" onAction={()=>router.replace('/events')}/></Screen>;
  if (!user) return <Screen><PageHeader title="Register"/><View style={styles.signedOut}><View style={styles.signedOutIcon}><Ionicons name="person-outline" size={28} color={colors.pinkDeep}/></View><Text style={styles.signedOutTitle}>Sign in to save your place</Text><Text style={styles.signedOutCopy}>Your registration, reminders and event updates stay linked to your GWMB account.</Text><Pressable onPress={() => router.replace('/sign-in')} style={styles.cta}><Text style={styles.ctaText}>Sign in to continue</Text><Ionicons name="arrow-forward" size={18} color="white"/></Pressable></View></Screen>;

  if (result) { const isWaitlisted = result.registration.status === 'waitlisted'; return <Screen><PageHeader title="Registration"/><CelebrationBurst visible title={isWaitlisted ? 'You’re on the list.' : 'Your place is confirmed!'} copy={isWaitlisted ? 'We’ll let you know as soon as a place becomes available.' : 'That’s one more brilliant room you’ve put yourself in.'}/><FadeIn delay={180}><View style={styles.eventSummary}><View style={styles.date}><Text style={styles.day}>{event.day}</Text><Text style={styles.month}>{event.month}</Text></View><View style={styles.summaryCopy}><Text style={styles.summaryTitle}>{event.title}</Text><Text style={styles.summaryMeta}>{event.dateShort} · {event.location}</Text></View></View>{!result.cloud ? <View style={styles.syncNote}><Ionicons name="phone-portrait-outline" size={17} color={colors.pinkDeep}/><Text style={styles.syncText}>Saved on this device. Cloud reminders will become available when the notification migration is connected.</Text></View> : null}{!isWaitlisted?<Pressable disabled={submitting||remindersOn} onPress={enableReminders} style={[styles.reminderCard,remindersOn&&styles.reminderCardOn]}><View style={styles.reminderIcon}><Ionicons name={remindersOn?'notifications':'notifications-outline'} size={20} color={remindersOn?'white':colors.pinkDeep}/></View><View style={styles.reminderCopy}><Text style={styles.reminderTitle}>{remindersOn?'Event reminders are on':'Turn on event reminders'}</Text><Text style={styles.reminderText}>{remindersOn?'Tomorrow, one hour before, and when it starts.':'Get an Android alert before the event begins.'}</Text></View><Ionicons name={remindersOn?'checkmark-circle':'arrow-forward'} size={20} color={remindersOn?'#087553':colors.ink}/></Pressable>:null}<Pressable onPress={() => router.replace('/events?tab=my')} style={styles.cta}><Text style={styles.ctaText}>View My Events</Text><Ionicons name="arrow-forward" size={18} color="white"/></Pressable><Pressable onPress={() => router.replace(`/event/${event.id}`)} style={styles.secondary}><Text style={styles.secondaryText}>Back to event details</Text></Pressable></FadeIn></Screen>; }

  return <Screen><PageHeader title={waitlist ? 'Join Waitlist' : 'Register'}/><View style={styles.hero}><View style={styles.icon}><Ionicons name={waitlist ? 'time' : 'checkmark'} size={24} color="white"/></View><Text style={styles.kicker}>{waitlist ? 'BE NEXT IN LINE' : 'SAVE YOUR SPOT'}</Text><Text style={styles.title}>{event.title}</Text><Text style={styles.copy}>{waitlist ? 'Join the waitlist and we’ll contact you if a place becomes available.' : 'Confirm your details below. We’ll send joining information and reminders to your email.'}</Text></View><View style={styles.eventMeta}><Ionicons name="calendar-outline" size={18} color={colors.pinkDeep}/><Text style={styles.eventMetaText}>{event.date} · {event.location}</Text></View><Text style={styles.label}>FULL NAME</Text><TextInput value={name} onChangeText={setName} placeholder="Your full name" placeholderTextColor={colors.muted} style={styles.input}/><Text style={styles.label}>EMAIL ADDRESS</Text><TextInput value={email} onChangeText={setEmail} placeholder="you@example.com" placeholderTextColor={colors.muted} keyboardType="email-address" autoCapitalize="none" style={styles.input}/><Text style={styles.label}>WHAT DO YOU HOPE TO LEARN? · OPTIONAL</Text><TextInput value={goal} onChangeText={setGoal} placeholder="Share a short note" placeholderTextColor={colors.muted} multiline maxLength={1000} style={[styles.input,styles.notes]}/>{message ? <View style={styles.message}><Text style={styles.messageText}>{message}</Text></View> : null}<Pressable disabled={submitting} onPress={submit} style={[styles.cta, submitting && styles.disabled]}>{submitting ? <ActivityIndicator color="white"/> : <><Text style={styles.ctaText}>{waitlist ? 'Join the waitlist' : 'Complete registration'}</Text><Ionicons name="arrow-forward" size={18} color="white"/></>}</Pressable><Text style={styles.note}>Registration does not change or verify your GWMB membership status.</Text></Screen>;
}

const styles = StyleSheet.create({
loading:{minHeight:240,alignItems:'center',justifyContent:'center'},
hero:{
borderRadius:24,
backgroundColor:colors.ink,
padding:26,
marginBottom:14
},
icon:{
width:46,
height:46,
borderRadius:15,
backgroundColor:colors.pink,
alignItems:'center',
justifyContent:'center'
},
kicker:{
color:'#F5A4CA',
fontSize:9,
fontFamily:fonts.bodyBold,
letterSpacing:1.1,
marginTop:25
},
title:{
color:'white',
fontSize:31,
lineHeight:36,
fontFamily:fonts.heading,
marginTop:7
},
copy:{
color:'#D2CBD0',
fontSize:14,
lineHeight:21,
fontFamily:fonts.body,
marginTop:8
},
eventMeta:{
minHeight:72,
borderRadius:16,
backgroundColor:colors.pinkSoft,
paddingHorizontal:14,
flexDirection:'row',
alignItems:'center',
gap:10
},
eventMetaText:{
color:colors.ink,
fontSize:13,
lineHeight:19,
fontFamily:fonts.bodyBold,
flex:1
},
label:{
color:colors.ink,
fontSize:10.5,
fontFamily:fonts.bodyBold,
letterSpacing:.7,
marginBottom:7,
marginTop:13
},
input:{
height:64,
borderRadius:19,
borderWidth:1,
borderColor:colors.line,
backgroundColor:colors.surface,
paddingHorizontal:14,
fontSize:14,
fontFamily:fonts.body,
color:colors.ink
},
notes:{
height:130,
paddingTop:15,
textAlignVertical:'top'
},
message:{
borderRadius:13,
backgroundColor:'#FFF0F3',
padding:11,
marginTop:12
},
messageText:{
color:'#A41449',
fontSize:9,
fontFamily:fonts.bodyMedium
},
cta:{
minHeight:64,
borderRadius:20,
backgroundColor:colors.pinkDeep,
paddingHorizontal:17,
flexDirection:'row',
alignItems:'center',
justifyContent:'space-between',
marginTop:22
},
disabled:{opacity:.65},
ctaText:{
color:'white',
fontSize:14,
fontFamily:fonts.bodyBold
},
note:{
fontSize:11.5,
lineHeight:17,
fontFamily:fonts.body,
color:colors.muted,
textAlign:'center',
marginTop:12
},
signedOut:{
marginTop:40,
borderRadius:24,
backgroundColor:colors.surface,
borderWidth:1,
borderColor:colors.line,
padding:22,
alignItems:'center'
},
signedOutIcon:{
width:64,
height:64,
borderRadius:22,
backgroundColor:colors.pinkSoft,
alignItems:'center',
justifyContent:'center'
},
signedOutTitle:{
color:colors.ink,
fontSize:25,
fontFamily:fonts.heading,
textAlign:'center',
marginTop:18
},
signedOutCopy:{
color:colors.muted,
fontSize:14,
lineHeight:21,
fontFamily:fonts.body,
textAlign:'center',
marginTop:7
},
successHero:{
borderRadius:25,
backgroundColor:colors.ink,
padding:23,
marginTop:5
},
successIcon:{
width:54,
height:54,
borderRadius:18,
backgroundColor:colors.pink,
alignItems:'center',
justifyContent:'center'
},
successKicker:{
color:'#F4A7CA',
fontSize:9,
fontFamily:fonts.bodyBold,
letterSpacing:1.1,
marginTop:25
},
successTitle:{
color:'white',
fontSize:27,
lineHeight:31,
fontFamily:fonts.heading,
marginTop:7
},
successCopy:{
color:'#D5CED1',
fontSize:10,
lineHeight:17,
fontFamily:fonts.body,
marginTop:8
},
eventSummary:{
borderRadius:20,
borderWidth:1,
borderColor:colors.line,
backgroundColor:colors.surface,
padding:13,
flexDirection:'row',
alignItems:'center',
marginTop:14
},
date:{
width:56,
height:60,
borderRadius:15,
backgroundColor:colors.pinkSoft,
alignItems:'center',
justifyContent:'center'
},
day:{
color:colors.pinkDeep,
fontSize:22,
fontFamily:fonts.heading
},
month:{
color:colors.pinkDeep,
fontSize:9,
fontFamily:fonts.bodyBold,
letterSpacing:.8
},
summaryCopy:{
flex:1,
paddingLeft:12
},
summaryTitle:{
color:colors.ink,
fontSize:12,
lineHeight:16,
fontFamily:fonts.headingBold
},
summaryMeta:{
color:colors.muted,
fontSize:9,
lineHeight:13,
fontFamily:fonts.body,
marginTop:5
},
syncNote:{
borderRadius:15,
backgroundColor:colors.pinkSoft,
padding:12,
flexDirection:'row',
gap:9,
alignItems:'center',
marginTop:11
},
syncText:{
color:colors.muted,
fontSize:9,
lineHeight:13,
fontFamily:fonts.body,
flex:1
},
reminderCard:{
minHeight:72,
borderRadius:18,
borderWidth:1,
borderColor:colors.line,
backgroundColor:colors.surface,
padding:12,
flexDirection:'row',
alignItems:'center',
gap:10,
marginTop:12
},
reminderCardOn:{
backgroundColor:'#EAF8F2',
borderColor:'#BCE6D6'
},
reminderIcon:{
width:40,
height:40,
borderRadius:13,
backgroundColor:colors.pinkSoft,
alignItems:'center',
justifyContent:'center'
},
reminderCopy:{flex:1},
reminderTitle:{
color:colors.ink,
fontSize:11,
fontFamily:fonts.bodyBold
},
reminderText:{
color:colors.muted,
fontSize:9,
lineHeight:13,
fontFamily:fonts.body,
marginTop:3
},
secondary:{
minHeight:48,
alignItems:'center',
justifyContent:'center'
},
secondaryText:{
color:colors.pinkDeep,
fontSize:10,
fontFamily:fonts.bodyBold
}
});
