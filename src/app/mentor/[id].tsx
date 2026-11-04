import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import {
 router, type Href, useLocalSearchParams
} from 'expo-router';
import {
 useEffect, useMemo, useState
} from 'react';
import {
 ActivityIndicator, Image, Pressable, StyleSheet, Text, View
} from 'react-native';

import { PageHeader } from '@/components/PageHeader';
import { Screen } from '@/components/Screen';
import {
 formatSessionDate, mentorImages, type Mentor, type MentorshipSession, type MentorshipType
} from '@/data/mentorship';
import {
 loadMentor, loadMentorshipSessions
} from '@/lib/mentorship-store';
import {
 colors, fonts
} from '@/theme';

const formatDetails:Record<MentorshipType,{label:string;copy:string;icon:keyof typeof Ionicons.glyphMap;surface:string;accent:string}>={
  discovery:{
label:'Discovery',
copy:'Explore the field before you choose.',
icon:'compass-outline',
surface:'#F3E9FF',
accent:'#7047D8'
},
  industry:{
label:'Industry',
copy:'Go deeper in your chosen career.',
icon:'briefcase-outline',
surface:'#E8EEFF',
accent:'#3150E8'
},
  one_on_one:{
label:'One-on-One',
copy:'Private, focused guidance for members.',
icon:'chatbubble-ellipses-outline',
surface:'#FCE3EF',
accent:colors.pinkDeep
},
};

export default function MentorDetail(){
  const{id}=useLocalSearchParams<{id:string}>();
  const[mentor,setMentor]=useState<Mentor|null>(null);
  const[sessions,setSessions]=useState<MentorshipSession[]>([]);

  useEffect(()=>{let active=true;Promise.all([loadMentor(id),loadMentorshipSessions()]).then(([m,s])=>{if(active){setMentor(m.mentor);setSessions(s.sessions.filter(item=>item.mentors?.some(person=>person.id===m.mentor.id)))}});return()=>{active=false}},[id]);
  const upcoming=useMemo(()=>sessions.filter(item=>item.status!=='completed'&&item.status!=='cancelled').sort((a,b)=>new Date(a.starts_at).getTime()-new Date(b.starts_at).getTime()),[sessions]);

  if(!mentor)return <Screen><PageHeader title="Mentor profile"/><View style={styles.loading}><ActivityIndicator color={colors.pinkDeep}/></View></Screen>;
  const source=mentor.photo_url?{uri:mentor.photo_url}:mentorImages[mentor.id]??require('../../../assets/media/community/member-01.png');
  const firstName=mentor.full_name.split(' ')[0];

  return <Screen>
    <PageHeader title="Mentor profile" eyebrow={mentor.industry}/>

    <View style={styles.hero}>
      <Image source={source} resizeMode="cover" style={styles.heroImage}/>
      <LinearGradient colors={['rgba(10,12,24,.02)','rgba(10,12,24,.18)','rgba(10,12,24,.92)']} locations={[0,.46,1]} style={styles.heroShade}/>
      <View style={styles.heroTop}>
        <View style={styles.verifiedPill}><Ionicons name="checkmark-circle" size={13} color="#087553"/><Text style={styles.verifiedText}>GWMB VERIFIED MENTOR</Text></View>
        <View style={styles.industryPill}><Text style={styles.industryText}>{mentor.industry}</Text></View>
      </View>
      <View style={styles.heroCopy}><Text style={styles.heroName}>{mentor.full_name}</Text><Text style={styles.heroRole}>{mentor.job_title}</Text><Text style={styles.heroCompany}>{mentor.organisation}</Text></View>
    </View>

    <View style={styles.snapshot}>
      <View style={styles.snapshotItem}><Text style={styles.snapshotValue}>{mentor.expertise.length}</Text><Text style={styles.snapshotLabel}>Expertise areas</Text></View>
      <View style={styles.snapshotDivider}/>
      <View style={styles.snapshotItem}><Text style={styles.snapshotValue}>{mentor.mentorship_types.length}</Text><Text style={styles.snapshotLabel}>Mentorship formats</Text></View>
      <View style={styles.snapshotDivider}/>
      <View style={styles.snapshotItem}><Ionicons name="shield-checkmark" size={21} color={colors.pinkDeep}/><Text style={styles.snapshotLabel}>Approved network</Text></View>
    </View>

    <View style={styles.sectionHead}><View><Text style={styles.kicker}>MEET YOUR MENTOR</Text><Text style={styles.title}>About {firstName}</Text></View></View>
    <View style={styles.aboutCard}><Text style={styles.aboutQuote}>“</Text><Text style={styles.copy}>{mentor.bio}</Text></View>

    <View style={styles.sectionHead}><View><Text style={styles.kicker}>CAREER EXPERTISE</Text><Text style={styles.sectionTitle}>What {firstName} knows well</Text></View></View>
    <View style={styles.expertiseGrid}>{mentor.expertise.map((item,index)=><View key={item} style={[styles.expertiseCard,index===0&&styles.expertiseCardFeatured]}><View style={[styles.expertiseIcon,index===0&&styles.expertiseIconFeatured]}><Ionicons name={index===0?'sparkles':'checkmark'} size={15} color={index===0?'white':colors.pinkDeep}/></View><Text style={[styles.expertiseText,index===0&&styles.expertiseTextFeatured]}>{item}</Text></View>)}</View>

    <View style={styles.sectionHead}><View><Text style={styles.kicker}>GUIDANCE AREAS</Text><Text style={styles.sectionTitle}>What you can explore together</Text></View></View>
    <View style={styles.focusList}>{mentor.guidance_topics.map((item,index)=><View key={item} style={styles.focusItem}><Text style={styles.focusNumber}>0{index+1}</Text><Text style={styles.focusText}>{item}</Text><Ionicons name="arrow-forward" size={17} color={colors.ink}/></View>)}</View>

    <View style={styles.sectionHead}><View><Text style={styles.kicker}>WAYS TO CONNECT</Text><Text style={styles.sectionTitle}>Available mentorship formats</Text></View></View>
    <View style={styles.formatGrid}>{mentor.mentorship_types.map(type=>{const format=formatDetails[type];return <Pressable key={type} onPress={()=>router.push(`/mentorship/${type==='one_on_one'?'one-on-one':type}` as Href)} style={[styles.formatCard,{backgroundColor:format.surface}]}><View style={[styles.formatIcon,{backgroundColor:format.accent}]}><Ionicons name={format.icon} size={19} color="white"/></View><Text style={styles.formatTitle}>{format.label}</Text><Text style={styles.formatCopy}>{format.copy}</Text><Ionicons name="arrow-forward" size={16} color={format.accent}/></Pressable>})}</View>

    {upcoming.length?<><View style={styles.sectionHead}><View><Text style={styles.kicker}>UPCOMING</Text><Text style={styles.sectionTitle}>Sessions with {firstName}</Text></View></View><View style={styles.sessionList}>{upcoming.slice(0,2).map(session=><Pressable key={session.id} onPress={()=>router.push(`/mentorship-session/${session.id}` as Href)} style={styles.sessionCard}><LinearGradient colors={session.mentorship_type==='discovery'?['#38156F','#8746D6','#F06EBB']:['#10285F','#225ED0','#46C3E7']} style={styles.sessionAccent}><Ionicons name={session.mentorship_type==='discovery'?'compass-outline':'briefcase-outline'} size={20} color="white"/></LinearGradient><View style={styles.sessionCopy}><Text style={styles.sessionTag}>{session.mentorship_type==='discovery'?'DISCOVERY MENTORSHIP':'INDUSTRY MENTORSHIP'} · {session.access_level==='members'?'MEMBERS ONLY':'OPEN ACCESS'}</Text><Text style={styles.sessionTitle}>{session.title}</Text><Text style={styles.sessionMeta}>{formatSessionDate(session.starts_at)}</Text></View><View style={styles.sessionArrow}><Ionicons name="arrow-forward" size={16} color="white"/></View></Pressable>)}</View></>:null}

    <View style={styles.privacyNote}><View style={styles.privacyIcon}><Ionicons name="lock-closed-outline" size={18} color={colors.pinkDeep}/></View><View style={styles.privacyCopy}><Text style={styles.privacyTitle}>Your privacy comes first</Text><Text style={styles.privacyText}>Private contact details and booking access are shared only after a One-on-One request is approved.</Text></View></View>

    <LinearGradient colors={['#681239','#C51F68','#FF87AA']} start={{
x:0,
y:0
}} end={{
x:1,
y:1
}} style={styles.ctaCard}>
      <View style={styles.ctaOrb}/><Text style={styles.ctaKicker}>MEMBERS-ONLY GUIDANCE</Text><Text style={styles.ctaTitle}>Want focused guidance from a mentor in your field?</Text><Pressable onPress={()=>router.push('/mentorship/one-on-one')} style={styles.ctaButton}><Text style={styles.ctaText}>Explore One-on-One Mentorship</Text><Ionicons name="arrow-forward" size={17} color={colors.ink}/></Pressable>
    </LinearGradient>
  </Screen>;
}

const styles=StyleSheet.create({
  loading:{
height:300,
alignItems:'center',
justifyContent:'center'
},
  hero:{
height:355,
borderRadius:28,
overflow:'hidden',
backgroundColor:colors.ink,
borderWidth:1,
borderColor:'rgba(17,16,17,.08)'
},
  heroImage:{
position:'absolute',
top:0,
right:0,
bottom:0,
left:0,
width:'100%',
height:'100%',
transform:[{scale:1.6},{translateX:-28},{translateY:-34}]
},
  heroShade:{
position:'absolute',
top:0,
right:0,
bottom:0,
left:0
},
  heroTop:{
position:'absolute',
top:16,
left:16,
right:16,
flexDirection:'row',
alignItems:'center',
justifyContent:'space-between',
gap:8
},
  verifiedPill:{
height:31,
borderRadius:16,
backgroundColor:'rgba(255,255,255,.94)',
paddingHorizontal:10,
flexDirection:'row',
alignItems:'center',
gap:5
},
  verifiedText:{
color:'#075C43',
fontSize:7,
fontFamily:fonts.bodyBold,
letterSpacing:.7
},
  industryPill:{
height:31,
borderRadius:16,
backgroundColor:'rgba(12,12,18,.48)',
borderWidth:1,
borderColor:'rgba(255,255,255,.25)',
paddingHorizontal:11,
alignItems:'center',
justifyContent:'center'
},
  industryText:{
color:'white',
fontSize:8,
fontFamily:fonts.bodyBold,
letterSpacing:.6,
textTransform:'uppercase'
},
  heroCopy:{
position:'absolute',
left:20,
right:20,
bottom:20
},
  heroName:{
color:'white',
fontSize:36,
lineHeight:41,
fontFamily:fonts.headingBold,
letterSpacing:-1
},
  heroRole:{
color:'white',
fontSize:15,
fontFamily:fonts.bodyBold,
marginTop:6
},
  heroCompany:{
color:'rgba(255,255,255,.72)',
fontSize:13,
fontFamily:fonts.bodyMedium,
marginTop:3
},
  snapshot:{
minHeight:110,
borderRadius:22,
borderWidth:1,
borderColor:colors.line,
backgroundColor:colors.surface,
marginTop:12,
paddingHorizontal:10,
flexDirection:'row',
alignItems:'center'
},
  snapshotItem:{
flex:1,
alignItems:'center',
justifyContent:'center',
gap:4
},
snapshotValue:{
color:colors.ink,
fontSize:24,
fontFamily:fonts.headingBold
},
snapshotLabel:{
color:colors.muted,
fontSize:9.5,
lineHeight:14,
fontFamily:fonts.bodyBold,
textAlign:'center'
},
snapshotDivider:{
width:1,
height:38,
backgroundColor:colors.line
},
  sectionHead:{
flexDirection:'row',
alignItems:'flex-end',
justifyContent:'space-between',
marginTop:27,
marginBottom:11
},
  kicker:{
color:colors.pinkDeep,
fontSize:8,
fontFamily:fonts.bodyBold,
letterSpacing:1
},
title:{
color:colors.ink,
fontSize:29,
fontFamily:fonts.heading,
letterSpacing:-.7,
marginTop:4
},
sectionTitle:{
color:colors.ink,
fontSize:23,
lineHeight:28,
fontFamily:fonts.headingBold,
letterSpacing:-.45,
marginTop:4
},
  aboutCard:{
borderRadius:22,
backgroundColor:'#F4F1F3',
padding:19,
overflow:'hidden'
},
aboutQuote:{
position:'absolute',
right:14,
top:-9,
color:'rgba(181,22,91,.12)',
fontSize:74,
fontFamily:fonts.heading
},
copy:{
color:'#514B4E',
fontSize:15,
lineHeight:24,
fontFamily:fonts.body,
paddingRight:12
},
  expertiseGrid:{
flexDirection:'row',
flexWrap:'wrap',
gap:9
},
expertiseCard:{
width:'48.5%',
minHeight:118,
borderRadius:19,
borderWidth:1,
borderColor:colors.line,
backgroundColor:colors.surface,
padding:13,
justifyContent:'space-between'
},
expertiseCardFeatured:{
backgroundColor:colors.ink,
borderColor:colors.ink
},
expertiseIcon:{
width:29,
height:29,
borderRadius:10,
backgroundColor:colors.pinkSoft,
alignItems:'center',
justifyContent:'center'
},
expertiseIconFeatured:{backgroundColor:colors.pinkDeep},
expertiseText:{
color:colors.ink,
fontSize:13,
lineHeight:18,
fontFamily:fonts.bodyBold,
marginTop:10
},
expertiseTextFeatured:{color:'white'},
  focusList:{gap:8},
focusItem:{
minHeight:78,
borderRadius:18,
borderWidth:1,
borderColor:colors.line,
backgroundColor:colors.surface,
paddingHorizontal:14,
flexDirection:'row',
alignItems:'center',
gap:12
},
focusNumber:{
color:colors.pinkDeep,
fontSize:9,
fontFamily:fonts.headingBold
},
focusText:{
color:colors.ink,
fontSize:14,
lineHeight:20,
fontFamily:fonts.bodyBold,
flex:1
},
  formatGrid:{
flexDirection:'row',
flexWrap:'wrap',
gap:9
},
formatCard:{
width:'48.5%',
minHeight:200,
borderRadius:22,
padding:14,
overflow:'hidden'
},
formatIcon:{
width:40,
height:40,
borderRadius:14,
alignItems:'center',
justifyContent:'center'
},
formatTitle:{
color:colors.ink,
fontSize:18,
fontFamily:fonts.headingBold,
marginTop:17
},
formatCopy:{
color:colors.muted,
fontSize:12,
lineHeight:18,
fontFamily:fonts.body,
marginTop:5,
flex:1
},
  sessionList:{gap:10},
sessionCard:{
minHeight:146,
borderRadius:21,
borderWidth:1,
borderColor:colors.line,
backgroundColor:colors.surface,
padding:13,
flexDirection:'row',
alignItems:'center',
gap:12
},
sessionAccent:{
width:49,
height:82,
borderRadius:16,
alignItems:'center',
justifyContent:'center'
},
sessionCopy:{flex:1},
sessionTag:{
color:colors.pinkDeep,
fontSize:7,
lineHeight:11,
fontFamily:fonts.bodyBold,
letterSpacing:.65
},
sessionTitle:{
color:colors.ink,
fontSize:16,
lineHeight:21,
fontFamily:fonts.headingBold,
marginTop:5
},
sessionMeta:{
color:colors.muted,
fontSize:11,
fontFamily:fonts.bodyMedium,
marginTop:7
},
sessionArrow:{
width:32,
height:32,
borderRadius:16,
backgroundColor:colors.ink,
alignItems:'center',
justifyContent:'center'
},
  privacyNote:{
borderRadius:20,
backgroundColor:colors.pinkSoft,
padding:15,
flexDirection:'row',
alignItems:'flex-start',
gap:11,
marginTop:24
},
privacyIcon:{
width:38,
height:38,
borderRadius:13,
backgroundColor:'white',
alignItems:'center',
justifyContent:'center'
},
privacyCopy:{flex:1},
privacyTitle:{
color:colors.ink,
fontSize:11,
fontFamily:fonts.headingBold
},
privacyText:{
color:colors.muted,
fontSize:9.5,
lineHeight:15,
fontFamily:fonts.body,
marginTop:4
},
  ctaCard:{
minHeight:220,
borderRadius:26,
padding:20,
marginTop:13,
overflow:'hidden',
justifyContent:'flex-end'
},
ctaOrb:{
position:'absolute',
width:150,
height:150,
borderRadius:75,
borderWidth:27,
borderColor:'rgba(255,255,255,.12)',
right:-35,
top:-45
},
ctaKicker:{
color:'rgba(255,255,255,.72)',
fontSize:8,
fontFamily:fonts.bodyBold,
letterSpacing:1
},
ctaTitle:{
color:'white',
fontSize:21,
lineHeight:25,
fontFamily:fonts.headingBold,
letterSpacing:-.5,
marginTop:6,
maxWidth:320
},
ctaButton:{
height:48,
borderRadius:15,
backgroundColor:'white',
paddingHorizontal:14,
flexDirection:'row',
alignItems:'center',
justifyContent:'space-between',
marginTop:17
},
ctaText:{
color:colors.ink,
fontSize:10,
fontFamily:fonts.bodyBold
},
});
