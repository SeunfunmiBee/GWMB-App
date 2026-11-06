import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import {
 router, type Href, useFocusEffect, useLocalSearchParams 
} from 'expo-router';
import {
 useCallback, useMemo, useState 
} from 'react';
import {
 ActivityIndicator, Alert, Linking, Pressable, StyleSheet, Text, View 
} from 'react-native';
import { PageHeader } from '@/components/PageHeader';
import { Screen } from '@/components/Screen';
import { AppStateView } from '@/components/states/AppStateView';
import {
 formatSessionDate, type MentorshipSession 
} from '@/data/mentorship';
import {
 cancelMentorshipRegistration, loadMentorshipRegistrations, loadMentorshipSession, registerForMentorshipSession, type MentorshipRegistration 
} from '@/lib/mentorship-store';
import {
 cancelLocalMentorshipReminders, defaultNotificationPreferences, loadNotificationPreferences, scheduleLocalMentorshipReminders, type NotificationPreferences 
} from '@/lib/notification-store';
import { useAuth } from '@/providers/AuthProvider';
import {
 colors, fonts 
} from '@/theme';

const TWO_HOURS=2*60*60*1000;
const detailLoadedAt=Date.now();

export default function MentorshipSessionDetail(){
  const{id}=useLocalSearchParams<{id:string}>();
  const{
user,membership
}=useAuth();
  const[session,setSession]=useState<MentorshipSession|null>(null);
  const[registration,setRegistration]=useState<MentorshipRegistration|null>(null);
  const[preferences,setPreferences]=useState<NotificationPreferences|null>(null);
  const[busy,setBusy]=useState(false);
  const[answer,setAnswer]=useState<string|null>(null);
  const[loading,setLoading]=useState(true);
  const[loadError,setLoadError]=useState<string|null>(null);

  useFocusEffect(useCallback(()=>{let active=true;setLoading(true);Promise.all([
    loadMentorshipSession(id),
    user?loadMentorshipRegistrations(user.id):Promise.resolve({
registrations:[],
cloud:false
}),
    user?loadNotificationPreferences(user.id):Promise.resolve({
preferences:defaultNotificationPreferences('guest'),
error:null
}),
  ]).then(([s,r,p])=>{if(active){setSession(s.session);setRegistration(r.registrations.find(item=>item.session_id===id&&item.status!=='cancelled')??null);setPreferences(p.preferences);setLoadError(s.error?.message??null);setLoading(false)}});return()=>{active=false}},[id,user]));

  const live=useMemo(()=>{if(!session)return false;const start=new Date(session.starts_at).getTime();return session.status==='live'||(start<=detailLoadedAt&&start+TWO_HOURS>=detailLoadedAt)},[session]);
  if(loading)return <Screen><PageHeader title="Mentorship session"/><View style={styles.loading}><ActivityIndicator color={colors.pinkDeep}/></View></Screen>;
  if(loadError)return <Screen><PageHeader title="Mentorship session"/><AppStateView kind="error" title="Session could not load" copy={loadError}/></Screen>;
  if(!session)return <Screen><PageHeader title="Mentorship session"/><AppStateView kind="no-results" eyebrow="SESSION UNAVAILABLE" title="This mentorship session is no longer available." copy="It may have been unpublished or the link may be incorrect."/></Screen>;

  const verified=membership?.status==='verified';
  const locked=session.access_level==='members'&&!verified;
  const linkedButUnverified=Boolean(membership&&!verified);
  const isFull=Boolean(session.capacity&&session.registration_count!=null&&session.registration_count>=session.capacity);
  const sessionLabel=session.mentorship_type==='discovery'?'Discovery Mentorship':'Industry Mentorship';
  const accessLabel=session.access_level==='members'?'Members Only':'Open Access';

  async function saveSeat(){
    if(!user){router.push('/sign-in');return}
    if(locked){router.push(linkedButUnverified?'/verify-membership':'/membership');return}
    setBusy(true);
    const result=await registerForMentorshipSession(user.id,session!.id,isFull?'waitlisted':'registered');
    if(result.registration?.status==='registered'&&preferences)await scheduleLocalMentorshipReminders(session!,preferences);
    setBusy(false);
    if(result.error){Alert.alert('Your seat could not be saved',result.error.message);return}
    setRegistration(result.registration);
  }

  async function cancel(){if(!user)return;setBusy(true);await Promise.all([cancelMentorshipRegistration(user.id,session!.id),cancelLocalMentorshipReminders(session!.id)]);setRegistration(null);setBusy(false)}
  async function join(){if(session?.meeting_url)await Linking.openURL(session.meeting_url);else Alert.alert('Join link coming shortly','We will place the live link here as soon as the host opens the room.')}
  async function addToCalendar(){const start=new Date(session!.starts_at);const end=new Date(start.getTime()+60*60*1000);const stamp=(date:Date)=>date.toISOString().replace(/[-:]/g,'').replace(/\.\d{3}/,'');await Linking.openURL(`https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(session!.title)}&dates=${stamp(start)}/${stamp(end)}&details=${encodeURIComponent(session!.description)}`)}

  const enabledChannels=[
    {
label:'In-app notification',
enabled:true,
icon:'notifications-outline' as const
},
    {
label:'Email reminder',
enabled:preferences?.email_enabled!==false,
icon:'mail-outline' as const
},
    {
label:'Push notification',
enabled:Boolean(preferences?.push_enabled),
icon:'phone-portrait-outline' as const
},
    {
label:'WhatsApp reminder',
enabled:Boolean(preferences?.whatsapp_enabled),
icon:'chatbubble-outline' as const
},
  ].filter(item=>item.enabled);

  return <Screen>
    <PageHeader title="Mentorship session" eyebrow={sessionLabel}/>
    <LinearGradient colors={session.mentorship_type==='discovery'?['#38156F','#8746D6','#F06EBB']:['#10285F','#225ED0','#46C3E7']} start={{
x:0,
y:0
}} end={{
x:1,
y:1
}} style={styles.hero}><View style={styles.heroOrb}/><Ionicons name={session.mentorship_type==='discovery'?'compass-outline':'briefcase-outline'} size={29} color="white"/><Text style={styles.heroTag}>{session.industry}</Text><Text style={styles.heroTitle}>{session.title}</Text></LinearGradient>
    <View style={styles.badges}><View style={styles.badge}><Text style={styles.badgeText}>{sessionLabel} · {accessLabel}</Text></View>{registration?<View style={styles.confirmed}><Text style={styles.confirmedText}>{registration.status==='waitlisted'?'Waitlisted':'Seat Saved ✓'}</Text></View>:null}</View>
    <Text style={styles.copy}>{session.description}</Text>
    <View style={styles.facts}>
      <View style={styles.fact}><Ionicons name="calendar-outline" size={21} color={colors.pinkDeep}/><View><Text style={styles.factLabel}>DATE & TIME</Text><Text style={styles.factText}>{formatSessionDate(session.starts_at)}</Text></View></View>
      <Pressable onPress={()=>session.mentors?.[0]&&router.push(`/mentor/${session.mentors[0].id}` as Href)} style={styles.fact}><Ionicons name="person-outline" size={21} color={colors.pinkDeep}/><View style={styles.factCopy}><Text style={styles.factLabel}>MENTOR OR SPEAKER · VIEW PROFILE</Text><Text style={styles.factText}>{session.mentors?.map(m=>m.full_name).join(', ')||'GWMB Mentor'}</Text></View><Ionicons name="chevron-forward" size={17} color={colors.ink}/></Pressable>
      {session.capacity?<View style={styles.fact}><Ionicons name="people-outline" size={21} color={colors.pinkDeep}/><View><Text style={styles.factLabel}>CAPACITY</Text><Text style={styles.factText}>{session.capacity} places · Waitlist opens when full</Text></View></View>:null}
    </View>
    <Text style={styles.section}>Eligibility</Text><Text style={styles.body}>{session.eligibility??'See the access details for this session.'}</Text>
    <Text style={styles.section}>What to expect</Text>{['A practical conversation with an experienced professional','Time to understand the work and ask better questions','Clear next steps you can use after the session'].map(item=><View key={item} style={styles.point}><Ionicons name="checkmark-circle" size={18} color={colors.pinkDeep}/><Text style={styles.pointText}>{item}</Text></View>)}
    {session.status==='completed'?<><Pressable disabled={!session.replay_url} onPress={()=>session.replay_url&&Linking.openURL(session.replay_url)} style={[styles.cta,!session.replay_url&&styles.disabled]}><Text style={styles.ctaText}>{session.replay_url?'Watch Replay':'Replay coming soon'}</Text><Ionicons name="play" size={17} color="white"/></Pressable><View style={styles.followUp}><Text style={styles.followKicker}>YOUR NEXT STEP</Text><Text style={styles.followTitle}>Interested in exploring {session.industry} further?</Text><View style={styles.answerRow}>{['Yes','Still exploring','Not for me'].map(item=><Pressable key={item} onPress={()=>setAnswer(item)} style={[styles.answer,answer===item&&styles.answerActive]}><Text style={[styles.answerText,answer===item&&styles.answerTextActive]}>{item}</Text></Pressable>)}</View>{answer?<Text style={styles.answerSaved}>Saved ✓ We’ll use this to shape your next recommendations.</Text>:null}</View></>
    :live&&registration?.status==='registered'?<Pressable onPress={join} style={styles.cta}><Text style={styles.ctaText}>Join Session</Text><Ionicons name="videocam" size={18} color="white"/></Pressable>
    :registration?<><View style={styles.success}><Ionicons name={registration.status==='waitlisted'?'time-outline':'checkmark-circle'} size={25} color="#087553"/><View style={styles.successCopy}><Text style={styles.successTitle}>{registration.status==='waitlisted'?'Waitlist joined':'Seat Saved ✓'}</Text><Text style={styles.successText}>{registration.status==='waitlisted'?'We will notify you if a place becomes available.':'Your reminders are scheduled before the session.'}</Text></View></View>{registration.status==='registered'?<View style={styles.reminders}><View style={styles.reminderHead}><View><Text style={styles.reminderKicker}>REMINDER PREFERENCES</Text><Text style={styles.reminderTitle}>How we’ll remind you</Text></View><Pressable onPress={()=>router.push('/settings')}><Text style={styles.manage}>Manage</Text></Pressable></View>{enabledChannels.map(channel=><View key={channel.label} style={styles.channel}><Ionicons name={channel.icon} size={18} color={colors.pinkDeep}/><Text style={styles.channelText}>{channel.label}</Text><Ionicons name="checkmark-circle" size={17} color="#087553"/></View>)}<Pressable onPress={addToCalendar} style={styles.calendar}><Ionicons name="calendar-outline" size={17} color={colors.ink}/><Text style={styles.calendarText}>Add to Calendar</Text></Pressable></View>:null}<Pressable disabled={busy} onPress={cancel} style={styles.secondary}><Text style={styles.secondaryText}>{registration.status==='waitlisted'?'Leave waitlist':'Cancel saved seat'}</Text></Pressable></>
    :<Pressable disabled={busy} onPress={saveSeat} style={styles.cta}>{busy?<ActivityIndicator color="white"/>:<><Text style={styles.ctaText}>{!user?'Sign in to Save My Seat':locked?(linkedButUnverified?'Verify Membership':'Explore Membership'):isFull?'Join Waitlist':'Save My Seat'}</Text><Ionicons name="arrow-forward" size={18} color="white"/></>}</Pressable>}
  </Screen>;
}

const styles=StyleSheet.create({
loading:{
height:300,
alignItems:'center',
justifyContent:'center'
},
hero:{
minHeight:260,
borderRadius:25,
padding:24,
justifyContent:'flex-end',
overflow:'hidden'
},
heroOrb:{
position:'absolute',
width:175,
height:175,
borderRadius:90,
borderWidth:28,
borderColor:'rgba(255,255,255,.12)',
right:-42,
top:-52
},
heroTag:{
color:'rgba(255,255,255,.75)',
fontSize:9,
fontFamily:fonts.bodyBold,
letterSpacing:1,
marginTop:14
},
heroTitle:{
color:'white',
fontSize:33,
lineHeight:38,
fontFamily:fonts.heading,
letterSpacing:-1,
marginTop:7,
maxWidth:335
},
badges:{
flexDirection:'row',
flexWrap:'wrap',
gap:7,
marginTop:16
},
badge:{
borderRadius:999,
backgroundColor:colors.pinkSoft,
paddingHorizontal:9,
paddingVertical:6
},
badgeText:{
color:colors.pinkDeep,
fontSize:9,
fontFamily:fonts.bodyBold
},
confirmed:{
borderRadius:999,
backgroundColor:'#E6F6F0',
paddingHorizontal:9,
paddingVertical:6
},
confirmedText:{
color:'#087553',
fontSize:9,
fontFamily:fonts.bodyBold
},
copy:{
color:colors.muted,
fontSize:15,
lineHeight:23,
fontFamily:fonts.body,
marginTop:12
},
facts:{
gap:9,
marginTop:20
},
fact:{
minHeight:82,
borderRadius:21,
borderWidth:1,
borderColor:colors.line,
backgroundColor:colors.surface,
paddingHorizontal:15,
flexDirection:'row',
alignItems:'center',
gap:12
},
factCopy:{flex:1},
factLabel:{
color:colors.pinkDeep,
fontSize:9,
fontFamily:fonts.bodyBold,
letterSpacing:.7
},
factText:{
color:colors.ink,
fontSize:13.5,
fontFamily:fonts.bodyBold,
marginTop:3
},
section:{
color:colors.ink,
fontSize:22,
fontFamily:fonts.headingBold,
marginTop:24,
marginBottom:8
},
body:{
color:colors.muted,
fontSize:14,
lineHeight:22,
fontFamily:fonts.body
},
point:{
flexDirection:'row',
alignItems:'center',
gap:9,
minHeight:44
},
pointText:{
flex:1,
color:colors.ink,
fontSize:14,
lineHeight:20,
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
marginTop:21
},
disabled:{backgroundColor:colors.ink},
ctaText:{
color:'white',
fontSize:14,
fontFamily:fonts.bodyBold
},
success:{
borderRadius:19,
backgroundColor:'#E9F7F1',
padding:15,
flexDirection:'row',
alignItems:'center',
marginTop:21
},
successCopy:{
flex:1,
paddingLeft:11
},
successTitle:{
color:'#075C43',
fontSize:12,
fontFamily:fonts.headingBold
},
successText:{
color:'#37715F',
fontSize:10,
lineHeight:15,
fontFamily:fonts.body,
marginTop:3
},
reminders:{
borderRadius:21,
borderWidth:1,
borderColor:colors.line,
backgroundColor:colors.surface,
padding:15,
marginTop:11
},
reminderHead:{
flexDirection:'row',
alignItems:'center',
justifyContent:'space-between',
marginBottom:8
},
reminderKicker:{
color:colors.pinkDeep,
fontSize:8,
fontFamily:fonts.bodyBold,
letterSpacing:.8
},
reminderTitle:{
color:colors.ink,
fontSize:18,
fontFamily:fonts.headingBold,
marginTop:3
},
manage:{
color:colors.pinkDeep,
fontSize:10,
fontFamily:fonts.bodyBold
},
channel:{
minHeight:42,
borderTopWidth:1,
borderTopColor:colors.line,
flexDirection:'row',
alignItems:'center',
gap:9
},
channelText:{
flex:1,
color:colors.ink,
fontSize:13,
fontFamily:fonts.bodyMedium
},
calendar:{
height:46,
borderRadius:14,
backgroundColor:'#F1F3FA',
flexDirection:'row',
alignItems:'center',
justifyContent:'center',
gap:8,
marginTop:8
},
calendarText:{
color:colors.ink,
fontSize:10,
fontFamily:fonts.bodyBold
},
secondary:{
height:48,
alignItems:'center',
justifyContent:'center'
},
secondaryText:{
color:colors.pinkDeep,
fontSize:10,
fontFamily:fonts.bodyBold
},
followUp:{
borderRadius:21,
backgroundColor:'#F5F0FF',
padding:16,
marginTop:14
},
followKicker:{
color:'#6945BD',
fontSize:8,
fontFamily:fonts.bodyBold,
letterSpacing:.9
},
followTitle:{
color:colors.ink,
fontSize:16,
lineHeight:21,
fontFamily:fonts.headingBold,
marginTop:5
},
answerRow:{
flexDirection:'row',
flexWrap:'wrap',
gap:7,
marginTop:12
},
answer:{
borderRadius:999,
backgroundColor:'white',
paddingHorizontal:11,
paddingVertical:8,
borderWidth:1,
borderColor:'#DED4F2'
},
answerActive:{
backgroundColor:'#6945BD',
borderColor:'#6945BD'
},
answerText:{
color:'#6945BD',
fontSize:9,
fontFamily:fonts.bodyBold
},
answerTextActive:{color:'white'},
answerSaved:{
color:'#5C4C72',
fontSize:9,
lineHeight:14,
fontFamily:fonts.bodyMedium,
marginTop:10
}
});
