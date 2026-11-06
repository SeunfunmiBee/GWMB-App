import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import {
 router, type Href, useFocusEffect, useLocalSearchParams 
} from 'expo-router';
import {
 useCallback, useMemo, useState 
} from 'react';
import {
 ActivityIndicator, Alert, Image, Linking, Pressable, ScrollView, StyleSheet, Text, TextInput, View 
} from 'react-native';
import { PageHeader } from '@/components/PageHeader';
import { Screen } from '@/components/Screen';
import { AppStateView } from '@/components/states/AppStateView';
import {
 formatSessionDate, mentorshipIndustries, type Mentor, type MentorshipSession
} from '@/data/mentorship';
import { loadMarketplaceJourney } from '@/lib/marketplace-journey';
import {
 getApprovedBookingLink, loadIndustryInterests, loadMentors, loadMentorshipApplications, loadMentorshipRegistrations, loadMentorshipSessions, saveIndustryInterest, type MentorshipApplication, type MentorshipRegistration 
} from '@/lib/mentorship-store';
import { useAuth } from '@/providers/AuthProvider';
import {
 colors, fonts 
} from '@/theme';

function MentorCard({ mentor }:{ mentor:Mentor }) { const source=mentor.photo_url?{uri:mentor.photo_url}:null; return <Pressable onPress={() => router.push(`/mentor/${mentor.id}` as Href)} style={styles.mentorCard}>{source?<Image source={source} style={styles.mentorImage}/>:<View style={styles.mentorFallback}><Text style={styles.mentorInitials}>{mentor.full_name.split(' ').map((part)=>part[0]).join('')}</Text></View>}<View style={styles.mentorBody}><Text style={styles.tag}>{mentor.industry}</Text><Text style={styles.mentorName}>{mentor.full_name}</Text><Text style={styles.meta}>{mentor.job_title} · {mentor.organisation}</Text><View style={styles.chips}>{mentor.expertise.slice(0,2).map((item)=><View key={item} style={styles.chip}><Text style={styles.chipText}>{item}</Text></View>)}</View></View></Pressable> }

function SessionCard({ session, registered }:{session:MentorshipSession;registered?:boolean}) {
  const label=session.mentorship_type==='discovery'?'Discovery Mentorship':session.mentorship_type==='industry'?'Industry Mentorship':'Webinar / Training';
  const completed=session.status==='completed';
  const action=completed?(session.replay_url?'Watch Replay':'View Session'):registered?'View Seat':'Save My Seat';
  return <Pressable onPress={() => router.push(`/mentorship-session/${session.id}` as Href)} style={styles.sessionCard}><View style={[styles.sessionAccent,{backgroundColor:session.mentorship_type==='discovery'?'#7A35D1':'#3150E8'}]}/><View style={styles.sessionBody}><View style={styles.rowBetween}><Text style={styles.tag}>{session.industry} · {completed?(session.replay_url?'REPLAY READY':'COMPLETED'):'UPCOMING'}</Text>{registered?<View style={styles.registered}><Text style={styles.registeredText}>Seat Saved ✓</Text></View>:null}</View><Text style={styles.sessionTitle}>{session.title}</Text><Pressable onPress={()=>session.mentors?.[0]&&router.push(`/mentor/${session.mentors[0].id}` as Href)}><Text style={styles.meta}>{session.mentors?.[0]?.full_name ?? 'GWMB Mentor'} · {formatSessionDate(session.starts_at)}</Text></Pressable><Text style={styles.sessionCopy}>{session.description}</Text><View style={styles.sessionFoot}><Text style={styles.access}>{label} · {session.access_level==='members'?'Members Only':'Open Access'}</Text><Text style={styles.saveLabel}>{action}  →</Text></View></View></Pressable>;
}

const industryFields:Record<string,string[]>={
Technology:['Data Analysis','Software Engineering','Cybersecurity'],
Product:['Product Management','Product Marketing','Product Design'],
Marketing:['Digital Marketing','Content Marketing','Brand Strategy'],
Data:['Data Analysis','Business Intelligence'],
Software:['Software Engineering','Frontend Development'],
AI:['AI Engineering','Machine Learning'],
Sales:['Business Development','Account Management'],
HR:['People Operations','Talent Acquisition'],
Finance:['Financial Analysis','Accounting'],
Design:['Product Design','Graphic Design'],
Business:['Operations','Entrepreneurship'],
Creative:['Photography','Fashion','Content Creation']
};
type MyTab='upcoming'|'applications'|'past';

export default function MentorshipAreaScreen(){
  const { area }=useLocalSearchParams<{area:string}>(); const {
user,membership
}=useAuth();
  const [mentors,setMentors]=useState<Mentor[]>([]); const [sessions,setSessions]=useState<MentorshipSession[]>([]); const [registrations,setRegistrations]=useState<MentorshipRegistration[]>([]); const [applications,setApplications]=useState<MentorshipApplication[]>([]); const [industry,setIndustry]=useState('Product'); const [field,setField]=useState('Product Management'); const [savedInterest,setSavedInterest]=useState(false); const [myTab,setMyTab]=useState<MyTab>('upcoming'); const [mentorQuery,setMentorQuery]=useState(''); const [mentorField,setMentorField]=useState('All'); const [loading,setLoading]=useState(true); const [loadError,setLoadError]=useState<string|null>(null); const [saving,setSaving]=useState(false);
  useFocusEffect(useCallback(()=>{let active=true;setLoading(true);Promise.all([loadMentors(),loadMentorshipSessions(),user?loadMentorshipRegistrations(user.id):Promise.resolve({
registrations:[],
cloud:false
}),user?loadMentorshipApplications(user.id):Promise.resolve({
applications:[],
cloud:false
}),user?loadMarketplaceJourney(user.id):Promise.resolve({
journey:null,
cloud:false
}),user?loadIndustryInterests(user.id):Promise.resolve({
interests:[],
error:null
})]).then(([m,s,r,a,j,i])=>{if(!active)return;setMentors(m.mentors);setSessions(s.sessions.filter(item=>!item.distribution_surfaces||item.distribution_surfaces.includes('mentorship')));setRegistrations(r.registrations);setApplications(a.applications);setLoadError(m.error?.message??s.error?.message??null);const saved=i.interests[0];const preferred=saved?.industry??j.journey?.interests.find((item)=>mentorshipIndustries.includes(item));if(preferred){setIndustry(preferred);setField(saved?.subfield||industryFields[preferred]?.[0]||'')}setSavedInterest(Boolean(saved));setLoading(false)});return()=>{active=false}},[user]));
  const registeredIds=useMemo(()=>new Set(registrations.filter((item)=>item.status!=='cancelled').map((item)=>item.session_id)),[registrations]);
  if(loading)return <Screen><PageHeader title="Mentorship"/><View style={styles.loading}><ActivityIndicator color={colors.pinkDeep}/></View></Screen>;
  if(loadError)return <Screen><PageHeader title="Mentorship"/><AppStateView kind="error" title="Mentorship could not load" copy={loadError}/></Screen>;
  if(area==='mentors'){
    const fields=['All',...Array.from(new Set(mentors.map(item=>item.industry)))];
    const filtered=mentors.filter(item=>(mentorField==='All'||item.industry===mentorField)&&`${item.full_name} ${item.job_title} ${item.organisation} ${item.industry} ${item.expertise.join(' ')}`.toLowerCase().includes(mentorQuery.toLowerCase()));
    return <Screen>
      <PageHeader title="Mentors" eyebrow="Mentorship"/>
      <LinearGradient colors={['#5B2418','#A6462D','#DF7443','#F0AE58']} start={{x:0,y:0}} end={{x:1,y:1}} style={styles.directoryHero}>
        <View style={styles.directoryOrb}/>
        <Text style={styles.directoryKicker}>THE GWMB MENTOR NETWORK</Text>
        <Text style={styles.directoryTitle}>Meet The GWMB Mentors</Text>
        <Text style={styles.directoryCopy}>Find guidance from women with experience across the fields you want to explore and grow in.</Text>
      </LinearGradient>
      <View style={styles.search}><Ionicons name="search-outline" size={18} color={colors.muted}/><TextInput value={mentorQuery} onChangeText={setMentorQuery} placeholder="Search mentors or expertise" placeholderTextColor={colors.muted} style={styles.searchInput}/></View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.industryContent}>{fields.map(item=><Pressable key={item} onPress={()=>setMentorField(item)} style={[styles.industryChip,mentorField===item&&styles.industryChipActive]}><Text style={[styles.industryText,mentorField===item&&styles.industryTextActive]}>{item}</Text></Pressable>)}</ScrollView>
      {filtered.length?<View style={[styles.list,{marginTop:16}]}>{filtered.map((mentor)=><MentorCard key={mentor.id} mentor={mentor}/>)}</View>:<AppStateView kind="empty" compact title="No mentors published yet" copy="Approved mentor profiles will appear here when Admin publishes them."/>}
    </Screen>
  }
  if(area==='discovery'){const upcoming=sessions.filter((s)=>s.mentorship_type==='discovery'&&s.status!=='completed');const past=sessions.filter((s)=>s.mentorship_type==='discovery'&&s.status==='completed');return <Screen><PageHeader title="Discovery Mentorship" eyebrow="Explore careers"/><LinearGradient colors={['#38156F','#8746D6','#F06EBB']} style={styles.areaHero}><Ionicons name="compass-outline" size={30} color="white"/><Text style={styles.areaTitle}>Explore careers before you choose.</Text><Text style={styles.areaCopy}>Save a seat for honest conversations about what the work really looks like.</Text></LinearGradient><Text style={styles.section}>Upcoming sessions</Text><View style={styles.list}>{upcoming.map((s)=><SessionCard key={s.id} session={s} registered={registeredIds.has(s.id)}/>)}</View><Text style={styles.section}>Past sessions · also in Learn Replays</Text><View style={styles.list}>{past.map((s)=><SessionCard key={s.id} session={s}/>)}</View></Screen>}
  if(area==='industry'){const matches=sessions.filter((s)=>s.mentorship_type==='industry'&&(s.industry===industry||s.industry===field)&&s.status!=='completed');const fields=industryFields[industry]??['General'];async function notify(){if(!user){router.push('/sign-in');return}setSaving(true);const {error}=await saveIndustryInterest(user.id,industry,field);setSaving(false);if(error){Alert.alert('Could not save yet',error.message);return}setSavedInterest(true)}return <Screen><PageHeader title="Industry Mentorship" eyebrow="Grow in your field"/><Text style={styles.title}>Tell us what you want to hear about.</Text><Text style={styles.intro}>We’ve reused your career interests where possible. Confirm or change them below.</Text><Text style={styles.formLabel}>PRIMARY INDUSTRY</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.industryScroll} contentContainerStyle={styles.industryContent}>{mentorshipIndustries.map((item)=><Pressable key={item} onPress={()=>{setIndustry(item);setField(industryFields[item]?.[0]??'General');setSavedInterest(false)}} style={[styles.industryChip,industry===item&&styles.industryChipActive]}><Text style={[styles.industryText,industry===item&&styles.industryTextActive]}>{item}</Text></Pressable>)}</ScrollView><Text style={styles.formLabel}>SPECIFIC FIELD</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.industryScroll} contentContainerStyle={styles.industryContent}>{fields.map(item=><Pressable key={item} onPress={()=>{setField(item);setSavedInterest(false)}} style={[styles.fieldChip,field===item&&styles.fieldChipActive]}><Text style={[styles.fieldText,field===item&&styles.fieldTextActive]}>{item}</Text></Pressable>)}</ScrollView><LinearGradient colors={['#10285F','#225ED0','#46C3E7']} style={styles.areaHero}><Text style={styles.heroLabel}>YOUR MENTORSHIP INTEREST</Text><Text style={styles.areaTitle}>{industry} → {field}</Text><Text style={styles.areaCopy}>New sessions tagged to either interest will appear on Home, here and in your notifications.</Text></LinearGradient><Text style={styles.section}>Upcoming {industry} mentorship</Text>{matches.length?<View style={styles.list}>{matches.map((s)=><SessionCard key={s.id} session={s} registered={registeredIds.has(s.id)}/>)}</View>:<View style={styles.empty}><Ionicons name={savedInterest?'checkmark-circle':'notifications-outline'} size={25} color={savedInterest?'#087553':colors.pinkDeep}/><Text style={styles.emptyTitle}>{savedInterest?'Interest Saved ✓':`No upcoming ${field} session yet.`}</Text><Text style={styles.emptyText}>{savedInterest?'We’ll let you know when a relevant mentorship opens.':'Save this interest and we’ll notify you when a relevant mentorship opens.'}</Text><Pressable disabled={saving||savedInterest} onPress={notify} style={[styles.primary,savedInterest&&styles.savedButton]}><Text style={styles.primaryText}>{saving?'Saving...':savedInterest?'Interest Saved ✓':'Notify Me'}</Text></Pressable></View>}</Screen>}
  if(area==='one-on-one'){const verified=membership?.status==='verified';const hasUnverifiedMembership=Boolean(membership&&!verified);const steps=[['01','Tell us the decision or challenge you need help with'],['02','GWMB reviews your request and matches the right mentor'],['03','Book privately when your application is approved']];return <Screen><PageHeader title="One-on-One Mentorship" eyebrow="Members Only"/><LinearGradient colors={['#3E0B29','#A81455','#EE6397']} start={{
x:0,
y:0
}} end={{
x:1,
y:1
}} style={styles.oneHero}><View style={styles.oneHeroOrb}/><View style={styles.oneHeroTop}><View style={styles.oneHeroIcon}><Ionicons name="person-add-outline" size={25} color={colors.pinkDeep}/></View><View style={styles.memberPill}><Ionicons name="lock-closed" size={11} color="white"/><Text style={styles.memberPillText}>PRIVATE · MEMBERS ONLY</Text></View></View><Text style={styles.oneHeroTitle}>Focused guidance, matched to your next move.</Text><Text style={styles.oneHeroCopy}>Meet privately with a mentor in your field for clarity on a real career question, decision or next step.</Text></LinearGradient><View style={styles.chips}><View style={styles.chip}><Text style={styles.chipText}>Private session</Text></View><View style={styles.chip}><Text style={styles.chipText}>Matched by GWMB</Text></View><View style={styles.chip}><Text style={styles.chipText}>Tracked in My Mentorship</Text></View></View><Text style={styles.oneSectionLabel}>YOUR PATH TO A SESSION</Text><View style={styles.steps}>{steps.map(([number,item],index)=><View key={item} style={styles.step}><View style={styles.stepNumber}><Text style={styles.stepNumberText}>{number}</Text></View><Text style={styles.stepText}>{item}</Text><Ionicons name={index===2?'calendar-outline':'arrow-forward'} size={18} color={colors.pinkDeep}/></View>)}</View>{verified?<><View style={styles.empty}><Ionicons name="checkmark-circle" size={25} color="#087553"/><Text style={styles.emptyTitle}>Your membership is verified</Text><Text style={styles.emptyText}>You can apply now. Your review, mentor match and booking access will stay visible in My Mentorship.</Text></View><Pressable onPress={()=>router.push('/mentorship-application')} style={styles.primary}><Text style={styles.primaryText}>Start My Application</Text><Ionicons name="arrow-forward" size={18} color="white"/></Pressable></>:<LinearGradient colors={['#FFF0F6','#F3E9FF']} style={styles.locked}><View style={styles.lockIcon}><Ionicons name="lock-closed-outline" size={23} color={colors.pinkDeep}/></View><Text style={styles.emptyTitle}>Unlock private mentorship</Text><Text style={styles.emptyText}>{hasUnverifiedMembership?'Link your existing membership to continue.':'Explore GWMB membership to request a private mentor match.'}</Text><Pressable onPress={()=>router.push(hasUnverifiedMembership?'/verify-membership':'/membership')} style={styles.primary}><Text style={styles.primaryText}>{hasUnverifiedMembership?'Verify Membership':'Explore Membership'}</Text><Ionicons name="arrow-forward" size={17} color="white"/></Pressable></LinearGradient>}</Screen>}
  async function book(application:MentorshipApplication){const result=await getApprovedBookingLink(application.id);if(result.bookingUrl)await Linking.openURL(result.bookingUrl);else Alert.alert('Booking is not ready yet','GWMB will notify you as soon as your private booking link is released.')}
  const activeSessions=registrations.filter((r)=>r.status!=='cancelled').map((r)=>sessions.find((s)=>s.id===r.session_id)).filter((s):s is MentorshipSession=>Boolean(s&&s.status!=='completed'));
  const pastSessions=registrations.filter((r)=>r.status!=='cancelled').map((r)=>sessions.find((s)=>s.id===r.session_id)).filter((s):s is MentorshipSession=>Boolean(s&&s.status==='completed'));
  const completedApplications=applications.filter((item)=>item.status==='completed').length;
  const availableReplays=pastSessions.filter((item)=>Boolean(item.replay_url)).length;
  const statusLabel:Record<MentorshipApplication['status'],string>={
submitted:'Under Review',
under_review:'Under Review',
more_information_required:'Action Needed',
approved:'Approved',
mentor_assigned:'Mentor Assigned',
booking_access_released:'Approved · Book Session',
not_approved:'Closed',
completed:'Completed'
};
  return <Screen><PageHeader title="My Mentorship" eyebrow="Mentorship"/>{!user?<View style={styles.empty}><Text style={styles.emptyTitle}>Sign in to see your mentorship journey.</Text><Text style={styles.emptyText}>Your saved seats, applications and past sessions will stay with your account.</Text><Pressable onPress={()=>router.push('/sign-in')} style={styles.primary}><Text style={styles.primaryText}>Sign in</Text></Pressable></View>:<><View style={styles.mentorshipSummary}><View style={styles.summaryHead}><View><Text style={styles.summaryEyebrow}>YOUR MENTORSHIP JOURNEY</Text><Text style={styles.summaryTitle}>Everything in one place</Text></View><View style={styles.summaryIcon}><Ionicons name="people-outline" size={21} color="white"/></View></View><View style={styles.summaryGrid}><SummaryMetric value={activeSessions.length} label="Saved & upcoming"/><SummaryMetric value={applications.length} label="Applications"/><SummaryMetric value={completedApplications+pastSessions.length} label="Completed"/><SummaryMetric value={availableReplays} label="Replays ready"/></View></View><View style={styles.dashboardTabs}>{(['upcoming','applications','past'] as MyTab[]).map(tab=><Pressable key={tab} onPress={()=>setMyTab(tab)} style={[styles.dashboardTab,myTab===tab&&styles.dashboardTabActive]}><Text style={[styles.dashboardTabText,myTab===tab&&styles.dashboardTabTextActive]}>{tab==='upcoming'?'Saved':tab==='applications'?'Applications':'History'}</Text><Text style={[styles.dashboardCount,myTab===tab&&styles.dashboardTabTextActive]}>{tab==='upcoming'?activeSessions.length:tab==='applications'?applications.length:pastSessions.length}</Text></Pressable>)}</View>{myTab==='upcoming'?(activeSessions.length?<View style={styles.list}>{activeSessions.map((s)=><SessionCard key={s.id} session={s} registered/>)}</View>:<Text style={styles.emptyLine}>No saved or upcoming mentorship sessions yet.</Text>):null}{myTab==='applications'?(applications.length?<View style={styles.list}>{applications.map((a)=><View key={a.id} style={styles.application}><View style={styles.rowBetween}><Text style={styles.tag}>ONE-ON-ONE · MEMBERS ONLY</Text><Text style={styles.status}>{statusLabel[a.status]}</Text></View><Text style={styles.applicationTitle}>{a.assigned_mentor?.full_name??a.requested_mentor?.full_name??'Mentor matching in progress'}</Text><Text style={styles.meta}>{a.industry} · Submitted {new Date(a.submitted_at).toLocaleDateString('en-NG')}</Text><Text style={styles.sessionCopy}>{a.guidance_request}</Text>{a.admin_comments?<Text style={styles.adminNote}>{a.admin_comments}</Text>:null}{a.status==='approved'||a.status==='booking_access_released'?<Pressable onPress={()=>book(a)} style={styles.primary}><Text style={styles.primaryText}>Book Your Session</Text></Pressable>:null}</View>)}</View>:<Text style={styles.emptyLine}>No one-on-one applications yet.</Text>):null}{myTab==='past'?(pastSessions.length?<View style={styles.list}>{pastSessions.map(s=><SessionCard key={s.id} session={s} registered/>)}</View>:<Text style={styles.emptyLine}>Past sessions, completed mentorships and available replays will appear here.</Text>):null}</>}</Screen>;
}

function SummaryMetric({value,label}:{value:number;label:string}){return <View style={styles.summaryMetric}><Text style={styles.summaryValue}>{value}</Text><Text style={styles.summaryLabel}>{label}</Text></View>}

const styles=StyleSheet.create({
loading:{
height:300,
alignItems:'center',
justifyContent:'center'
},
mentorshipSummary:{
borderRadius:23,
backgroundColor:colors.ink,
padding:17,
marginBottom:13
},
summaryHead:{
flexDirection:'row',
alignItems:'center',
justifyContent:'space-between',
marginBottom:15
},
summaryEyebrow:{
color:'#D9B7C7',
fontSize:8,
fontFamily:fonts.bodyBold,
letterSpacing:1
},
summaryTitle:{
color:'white',
fontSize:19,
fontFamily:fonts.headingBold,
marginTop:4
},
summaryIcon:{
width:43,
height:43,
borderRadius:14,
backgroundColor:colors.pinkDeep,
alignItems:'center',
justifyContent:'center'
},
summaryGrid:{
flexDirection:'row',
flexWrap:'wrap',
gap:7
},
summaryMetric:{
width:'48.7%',
minHeight:66,
borderRadius:15,
backgroundColor:'#2B282B',
padding:11,
justifyContent:'center'
},
summaryValue:{
color:'white',
fontSize:20,
fontFamily:fonts.headingBold
},
summaryLabel:{
color:'#C9C3C7',
fontSize:8.5,
fontFamily:fonts.bodyMedium,
marginTop:3
},
title:{
color:colors.ink,
fontSize:30,
lineHeight:36,
fontFamily:fonts.heading,
letterSpacing:-.7
},
intro:{
color:colors.muted,
fontSize:15,
lineHeight:23,
fontFamily:fonts.body,
marginTop:7,
marginBottom:19
},
list:{gap:12},
directoryHero:{
minHeight:260,
borderRadius:25,
overflow:'hidden',
justifyContent:'flex-end',
padding:24
},
directoryOrb:{
position:'absolute',
width:210,
height:210,
borderRadius:105,
borderWidth:34,
borderColor:'rgba(255,255,255,.10)',
right:-55,
top:-75
},
directoryKicker:{
color:'rgba(255,255,255,.78)',
fontSize:10,
fontFamily:fonts.bodyBold,
letterSpacing:1.15
},
directoryTitle:{
color:'white',
fontSize:28,
lineHeight:33,
fontFamily:fonts.headingBold,
letterSpacing:-.7,
marginTop:10,
maxWidth:350
},
directoryCopy:{
color:'rgba(255,255,255,.82)',
fontSize:13,
lineHeight:20,
fontFamily:fonts.body,
marginTop:10,
maxWidth:350
},
search:{
height:60,
borderRadius:20,
borderWidth:1,
borderColor:colors.line,
backgroundColor:colors.surface,
flexDirection:'row',
alignItems:'center',
paddingHorizontal:15,
gap:9,
marginVertical:14
},
searchInput:{
flex:1,
color:colors.ink,
fontSize:14,
fontFamily:fonts.bodyMedium
},
mentorCard:{
borderRadius:22,
borderWidth:1,
borderColor:colors.line,
backgroundColor:colors.surface,
overflow:'hidden'
},
mentorImage:{
width:'100%',
height:230
},
mentorFallback:{
height:180,
backgroundColor:colors.ink,
alignItems:'center',
justifyContent:'center'
},
mentorInitials:{
color:'white',
fontSize:31,
fontFamily:fonts.heading
},
mentorBody:{padding:15},
tag:{
color:colors.pinkDeep,
fontSize:9,
fontFamily:fonts.bodyBold,
letterSpacing:.7,
textTransform:'uppercase'
},
mentorName:{
color:colors.ink,
fontSize:22,
fontFamily:fonts.headingBold,
marginTop:5
},
meta:{
color:colors.muted,
fontSize:13,
lineHeight:19,
fontFamily:fonts.body,
marginTop:4
},
chips:{
flexDirection:'row',
flexWrap:'wrap',
gap:6,
marginTop:11
},
chip:{
borderRadius:999,
backgroundColor:colors.pinkSoft,
paddingHorizontal:9,
paddingVertical:6
},
chipText:{
color:colors.pinkDeep,
fontSize:9,
fontFamily:fonts.bodyBold
},
areaHero:{
minHeight:250,
borderRadius:24,
padding:24,
justifyContent:'flex-end',
overflow:'hidden'
},
heroLabel:{
color:'rgba(255,255,255,.7)',
fontSize:9,
fontFamily:fonts.bodyBold,
letterSpacing:.9
},
areaTitle:{
color:'white',
fontSize:32,
lineHeight:37,
fontFamily:fonts.heading,
letterSpacing:-.8,
marginTop:10
},
areaCopy:{
color:'rgba(255,255,255,.86)',
fontSize:14,
lineHeight:21,
fontFamily:fonts.body,
marginTop:7,
maxWidth:330
},
section:{
color:colors.ink,
fontSize:23,
fontFamily:fonts.heading,
marginTop:26,
marginBottom:11
},
sessionCard:{
borderRadius:21,
borderWidth:1,
borderColor:colors.line,
backgroundColor:colors.surface,
overflow:'hidden',
flexDirection:'row'
},
sessionAccent:{width:7},
sessionBody:{
flex:1,
padding:18
},
rowBetween:{
flexDirection:'row',
justifyContent:'space-between',
alignItems:'center',
gap:8
},
registered:{
borderRadius:999,
backgroundColor:'#E6F6F0',
paddingHorizontal:8,
paddingVertical:5
},
registeredText:{
color:'#087553',
fontSize:9,
fontFamily:fonts.bodyBold
},
sessionTitle:{
color:colors.ink,
fontSize:19,
lineHeight:24,
fontFamily:fonts.headingBold,
marginTop:7
},
sessionCopy:{
color:colors.muted,
fontSize:13,
lineHeight:20,
fontFamily:fonts.body,
marginTop:8
},
sessionFoot:{
borderTopWidth:1,
borderTopColor:colors.line,
marginTop:13,
paddingTop:11,
flexDirection:'row',
justifyContent:'space-between',
alignItems:'center',
gap:8
},
access:{
color:colors.pinkDeep,
fontSize:8.5,
fontFamily:fonts.bodyBold,
flex:1
},
saveLabel:{
color:colors.ink,
fontSize:9,
fontFamily:fonts.bodyBold
},
formLabel:{
color:colors.pinkDeep,
fontSize:8,
fontFamily:fonts.bodyBold,
letterSpacing:.9,
marginBottom:7
},
industryScroll:{
marginTop:2,
marginBottom:18,
flexGrow:0
},
industryContent:{
gap:7,
paddingRight:5
},
industryChip:{
height:38,
borderRadius:999,
backgroundColor:colors.surface,
borderWidth:1,
borderColor:colors.line,
paddingHorizontal:14,
alignItems:'center',
justifyContent:'center'
},
industryChipActive:{
backgroundColor:colors.ink,
borderColor:colors.ink
},
industryText:{
color:colors.muted,
fontSize:10,
fontFamily:fonts.bodyBold
},
industryTextActive:{color:'white'},
fieldChip:{
height:38,
borderRadius:12,
backgroundColor:'#EEF3FF',
borderWidth:1,
borderColor:'#D6E0FA',
paddingHorizontal:14,
alignItems:'center',
justifyContent:'center'
},
fieldChipActive:{
backgroundColor:'#3150E8',
borderColor:'#3150E8'
},
fieldText:{
color:'#3150E8',
fontSize:10,
fontFamily:fonts.bodyBold
},
fieldTextActive:{color:'white'},
empty:{
borderRadius:22,
borderWidth:1,
borderColor:colors.line,
backgroundColor:colors.surface,
padding:22,
alignItems:'center'
},
emptyTitle:{
color:colors.ink,
fontSize:20,
lineHeight:25,
fontFamily:fonts.headingBold,
textAlign:'center',
marginTop:10
},
emptyText:{
color:colors.muted,
fontSize:14,
lineHeight:21,
fontFamily:fonts.body,
textAlign:'center',
marginTop:6
},
primary:{
minHeight:64,
borderRadius:20,
backgroundColor:colors.pinkDeep,
paddingHorizontal:17,
flexDirection:'row',
alignItems:'center',
justifyContent:'center',
gap:9,
marginTop:17
},
savedButton:{backgroundColor:'#087553'},
primaryText:{
color:'white',
fontSize:14,
fontFamily:fonts.bodyBold
},
oneHero:{
minHeight:330,
borderRadius:27,
padding:24,
overflow:'hidden',
justifyContent:'flex-end'
},
oneHeroOrb:{
position:'absolute',
width:190,
height:190,
borderRadius:95,
borderWidth:34,
borderColor:'rgba(255,255,255,.12)',
right:-55,
top:-55
},
oneHeroTop:{
position:'absolute',
top:18,
left:18,
right:18,
flexDirection:'row',
justifyContent:'space-between',
alignItems:'center'
},
oneHeroIcon:{
width:48,
height:48,
borderRadius:16,
backgroundColor:'white',
alignItems:'center',
justifyContent:'center'
},
memberPill:{
height:29,
borderRadius:15,
paddingHorizontal:10,
backgroundColor:'rgba(17,16,17,.25)',
flexDirection:'row',
alignItems:'center',
gap:5
},
memberPillText:{
color:'white',
fontSize:7,
fontFamily:fonts.bodyBold,
letterSpacing:.75
},
oneHeroTitle:{
color:'white',
fontSize:34,
lineHeight:39,
fontFamily:fonts.heading,
letterSpacing:-.8,
maxWidth:325
},
oneHeroCopy:{
color:'rgba(255,255,255,.84)',
fontSize:14,
lineHeight:21,
fontFamily:fonts.body,
marginTop:7,
maxWidth:320
},
oneSectionLabel:{
color:colors.pinkDeep,
fontSize:10.5,
fontFamily:fonts.bodyBold,
letterSpacing:1,
marginTop:23
},
steps:{
gap:12,
marginTop:13
},
step:{
minHeight:92,
borderRadius:22,
borderWidth:1,
borderColor:colors.line,
backgroundColor:colors.surface,
padding:15,
flexDirection:'row',
alignItems:'center'
},
stepNumber:{
width:52,
height:52,
borderRadius:17,
backgroundColor:colors.pinkSoft,
alignItems:'center',
justifyContent:'center'
},
stepNumberText:{
color:colors.pinkDeep,
fontSize:13,
fontFamily:fonts.headingBold
},
stepText:{
flex:1,
color:colors.ink,
fontSize:14.5,
lineHeight:20,
fontFamily:fonts.bodyBold,
paddingHorizontal:11
},
locked:{
borderRadius:23,
padding:22,
alignItems:'center',
marginTop:17,
borderWidth:1,
borderColor:'#EAD8E3'
},
lockIcon:{
width:50,
height:50,
borderRadius:17,
backgroundColor:'white',
alignItems:'center',
justifyContent:'center'
},
dashboardTabs:{
flexDirection:'row',
gap:7,
marginBottom:16
},
dashboardTab:{
flex:1,
minHeight:60,
borderRadius:17,
borderWidth:1,
borderColor:colors.line,
backgroundColor:colors.surface,
alignItems:'center',
justifyContent:'center'
},
dashboardTabActive:{
backgroundColor:colors.ink,
borderColor:colors.ink
},
dashboardTabText:{
color:colors.muted,
fontSize:9,
fontFamily:fonts.bodyBold
},
dashboardTabTextActive:{color:'white'},
dashboardCount:{
color:colors.pinkDeep,
fontSize:14,
fontFamily:fonts.headingBold,
marginTop:3
},
emptyLine:{
color:colors.muted,
fontSize:11,
lineHeight:17,
fontFamily:fonts.body,
padding:15,
borderRadius:17,
backgroundColor:colors.surface,
borderWidth:1,
borderColor:colors.line
},
application:{
borderRadius:20,
borderWidth:1,
borderColor:colors.line,
backgroundColor:colors.surface,
padding:15
},
status:{
color:colors.pinkDeep,
fontSize:9,
fontFamily:fonts.bodyBold,
textTransform:'capitalize'
},
applicationTitle:{
color:colors.ink,
fontSize:15,
fontFamily:fonts.headingBold,
marginTop:8
},
adminNote:{
color:colors.ink,
fontSize:10,
lineHeight:16,
fontFamily:fonts.bodyMedium,
backgroundColor:colors.pinkSoft,
borderRadius:13,
padding:11,
marginTop:11
}
});
