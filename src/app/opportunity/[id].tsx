import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import {
 router as expoRouter, useFocusEffect, useLocalSearchParams
} from 'expo-router';
import {
 useCallback, useMemo, useState
} from 'react';
import {
 ActivityIndicator, Pressable, StyleSheet, Text, View
} from 'react-native';

import { PageHeader } from '@/components/PageHeader';
import { Screen } from '@/components/Screen';
import { AppStateView } from '@/components/states/AppStateView';
import { loadApplicationProfile } from '@/lib/application-profile-store';
import { cmsOpportunity, usePublishedContentState } from '@/lib/content-runtime';
import {
 loadSavedOpportunityIds, setOpportunitySaved
} from '@/lib/opportunity-store';
import { useAuth } from '@/providers/AuthProvider';
import {
 colors, fonts
} from '@/theme';

const router={push:(href:string)=>expoRouter.push(href as never)};

export default function OpportunityDetail(){
  const{id}=useLocalSearchParams<{id:string}>();const{
user,membership
}=useAuth();const content=usePublishedContentState('opportunities');
  const item=useMemo(()=>{const published=content.items.find(candidate=>candidate.slug===id);return published?cmsOpportunity(published):null},[content.items,id]);
  const[saved,setSaved]=useState(false);const[profileReady,setProfileReady]=useState(false);
  useFocusEffect(useCallback(()=>{let active=true;if(!item)return()=>{active=false};Promise.all([loadSavedOpportunityIds(user?.id),user?loadApplicationProfile(user.id):Promise.resolve(null)]).then(([ids,profile])=>{if(!active)return;setSaved(ids.includes(item.id));setProfileReady(Boolean(profile&&(profile.professional_bio||profile.career_direction||profile.strengths.length)))});return()=>{active=false}},[item,user]));
  if(content.loading)return <Screen><PageHeader title="Opportunity"/><View style={styles.state}><ActivityIndicator color={colors.pinkDeep}/></View></Screen>;
  if(content.error)return <Screen><PageHeader title="Opportunity"/><AppStateView kind="error" copy={content.error.message} actionLabel="Try again" onAction={()=>void content.refresh()}/></Screen>;
  if(!item)return <Screen><PageHeader title="Opportunity"/><AppStateView kind="no-results" eyebrow="OPPORTUNITY UNAVAILABLE" title="This opportunity is no longer available." copy="It may have closed, been unpublished or the link may be incorrect." actionLabel="View opportunities" onAction={()=>router.push('/opportunities')}/></Screen>;
  const activeItem=item;
  async function toggleSaved(){if(!user){router.push('/sign-in');return}const next=!saved;setSaved(next);await setOpportunitySaved(user.id,activeItem.id,next)}
  function apply(){if(!user){router.push('/sign-in');return}if(activeItem.access==='Members Only'&&membership?.status!=='verified'){router.push('/membership');return}router.push(`/application/opportunity?opportunityId=${activeItem.id}`)}
  const ctaLabel=!user?'Sign in to apply':item.access==='Members Only'&&membership?.status!=='verified'?'Explore Membership':'Start Application';
  return <Screen><PageHeader title="Opportunity" eyebrow={item.type}/>
    <LinearGradient colors={['#12101E','#2A214F','#87366C']} start={{
x:0,
y:0
}} end={{
x:1,
y:1
}} style={[styles.hero,item.access==='Members Only'&&styles.heroLocked]}><View style={styles.heroRing}/><View style={styles.heroTop}><View style={styles.logo}><Text style={styles.logoText}>{item.initials}</Text></View><View style={styles.heroActions}>{item.access==='Members Only'?<View style={styles.heroLock}><Ionicons name="lock-closed" size={18} color="white"/></View>:null}<Pressable onPress={()=>void toggleSaved()} style={[styles.save,saved&&styles.saveActive]}><Ionicons name={saved?'bookmark':'bookmark-outline'} size={18} color={saved?'white':colors.ink}/></Pressable></View></View><View style={styles.badges}><View style={styles.heroBadge}><Text style={styles.heroBadgeText}>{item.source}</Text></View><View style={[styles.heroBadge,item.access==='Members Only'&&styles.memberBadge]}><Ionicons name={item.access==='Members Only'?'lock-closed':'lock-open-outline'} size={11} color="white"/><Text style={styles.heroBadgeText}>{item.access}</Text></View></View><Text style={styles.title}>{item.title}</Text><Text style={styles.org}>{item.org}</Text><View style={styles.heroMeta}><View style={styles.meta}><Ionicons name="location-outline" size={15} color="#F3B2D1"/><Text style={styles.metaText}>{item.location}</Text></View><View style={styles.meta}><Ionicons name="calendar-outline" size={15} color="#F3B2D1"/><Text style={styles.metaText}>{item.deadline}</Text></View></View></LinearGradient>
    <View style={styles.fitCard}><View style={styles.fitIcon}><Ionicons name="navigate-outline" size={21} color="#3154F5"/></View><View style={styles.fitCopy}><Text style={styles.fitKicker}>WHY IT MAY FIT</Text><Text style={styles.fitTitle}>A practical next step for your career path</Text><Text style={styles.fitText}>{item.summary}</Text></View></View>
    <Text style={styles.foundationLabel}>APPLICATION FOUNDATION</Text>
    <Pressable onPress={()=>router.push('/application-profile')}><LinearGradient colors={['#171326','#3A276C','#8A3F78']} start={{
x:0,
y:0
}} end={{
x:1,
y:1
}} style={styles.profileCard}><View style={styles.profileOrb}/><View style={[styles.profileStatus,profileReady&&styles.profileStatusReady]}><Ionicons name={profileReady?'checkmark':'sparkles'} size={23} color={profileReady?'white':colors.pinkDeep}/></View><View style={styles.profileCopy}><Text style={styles.profileKicker}>{profileReady?'READY TO REUSE':'YOUR REUSABLE FOUNDATION'}</Text><Text style={styles.profileTitle}>Application Profile</Text><Text style={styles.profileText}>{profileReady?'Your story is saved. Review it, tailor it and apply with control.':'Save your story once. Refine it as you apply and reuse it with control.'}</Text></View><View style={styles.profileArrow}><Ionicons name="arrow-forward" size={17} color={colors.ink}/></View></LinearGradient></Pressable>
    {item.aiAssistance==='restricted'?<View style={styles.policy}><Ionicons name="shield-outline" size={20} color="#8D5D00"/><View style={styles.policyCopy}><Text style={styles.policyTitle}>Personal answers required</Text><Text style={styles.policyText}>{item.aiPolicy}</Text></View></View>:<View style={styles.assist}><Ionicons name="sparkles-outline" size={20} color="#3154F5"/><View style={styles.policyCopy}><Text style={styles.assistTitle}>Assistance available</Text><Text style={styles.policyText}>Use your saved profile to build a first draft, then refine every answer in your own voice.</Text></View></View>}
    <Text style={styles.kicker}>WHAT TO EXPECT</Text><Text style={styles.sectionTitle}>A clear, focused application</Text>
    <View style={styles.requirements}>{([['document-text-outline','A current CV or professional profile'],['chatbox-ellipses-outline','A thoughtful motivation response'],['link-outline','Portfolio or LinkedIn link where relevant']] as const).map(([icon,label],index)=><View key={label} style={styles.requirement}><Text style={styles.number}>0{index+1}</Text><View style={styles.requirementIcon}><Ionicons name={icon} size={19} color={colors.pinkDeep}/></View><Text style={styles.requirementText}>{label}</Text></View>)}</View>
    <Pressable onPress={()=>router.push('/career-readiness' as never)} style={styles.readiness}><View style={styles.readinessIcon}><Ionicons name="briefcase-outline" size={21} color="#7E2F09"/></View><View style={styles.readinessCopy}><Text style={styles.readinessKicker}>PREPARING TO APPLY?</Text><Text style={styles.readinessTitle}>Review your CV or practise interview questions</Text><Text style={styles.readinessText}>Explore Career Readiness</Text></View><Ionicons name="arrow-forward" size={19} color={colors.ink}/></Pressable>
    <Pressable onPress={apply} style={styles.cta}><View><Text style={styles.ctaKicker}>{item.access.toUpperCase()}</Text><Text style={styles.ctaText}>{ctaLabel}</Text></View><View style={styles.ctaArrow}><Ionicons name="arrow-forward" size={19} color={colors.ink}/></View></Pressable>
  </Screen>
}

const styles=StyleSheet.create({
state:{minHeight:240,alignItems:'center',justifyContent:'center'},
hero:{
minHeight:310,
borderRadius:26,
padding:21,
overflow:'hidden',
borderWidth:1,
borderColor:'rgba(255,255,255,.16)'
},
heroLocked:{
borderColor:'#EA7AAF',
borderWidth:1.5
},
heroRing:{
position:'absolute',
width:220,
height:220,
borderRadius:110,
borderWidth:32,
borderColor:'rgba(255,255,255,.07)',
right:-80,
top:-90
},
heroTop:{
flexDirection:'row',
alignItems:'flex-start',
justifyContent:'space-between'
},
heroActions:{
flexDirection:'row',
gap:7
},
heroLock:{
width:43,
height:43,
borderRadius:15,
backgroundColor:colors.pinkDeep,
alignItems:'center',
justifyContent:'center'
},
logo:{
width:54,
height:54,
borderRadius:17,
backgroundColor:'white',
alignItems:'center',
justifyContent:'center'
},
logoText:{
color:colors.pinkDeep,
fontSize:16,
fontFamily:fonts.headingBold
},
save:{
width:43,
height:43,
borderRadius:15,
backgroundColor:'white',
alignItems:'center',
justifyContent:'center'
},
saveActive:{backgroundColor:colors.pinkDeep},
badges:{
flexDirection:'row',
gap:7,
marginTop:20
},
heroBadge:{
borderRadius:999,
backgroundColor:'rgba(255,255,255,.14)',
paddingHorizontal:9,
paddingVertical:6,
flexDirection:'row',
alignItems:'center',
gap:5
},
memberBadge:{backgroundColor:'rgba(230,43,127,.62)'},
heroBadgeText:{
color:'white',
fontSize:7.5,
fontFamily:fonts.bodyBold,
letterSpacing:.5
},
title:{
color:'white',
fontSize:31,
lineHeight:36,
fontFamily:fonts.headingBold,
letterSpacing:-.8,
marginTop:10,
maxWidth:330
},
org:{
color:'#F1B3D0',
fontSize:12.5,
fontFamily:fonts.bodyBold,
marginTop:5
},
heroMeta:{
flexDirection:'row',
gap:14,
marginTop:'auto',
paddingTop:15
},
meta:{
flexDirection:'row',
alignItems:'center',
gap:5
},
metaText:{
color:'rgba(255,255,255,.8)',
fontSize:11,
fontFamily:fonts.bodyMedium
},
fitCard:{
borderRadius:23,
backgroundColor:'#EEF1FF',
borderWidth:1,
borderColor:'#D8DEFF',
padding:17,
flexDirection:'row',
gap:11,
marginTop:12
},
fitIcon:{
width:44,
height:44,
borderRadius:15,
backgroundColor:'white',
alignItems:'center',
justifyContent:'center'
},
fitCopy:{flex:1},
fitKicker:{
color:'#3154F5',
fontSize:7,
fontFamily:fonts.bodyBold,
letterSpacing:.9
},
fitTitle:{
color:colors.ink,
fontSize:15,
fontFamily:fonts.headingBold,
marginTop:3
},
fitText:{
color:colors.muted,
fontSize:12.5,
lineHeight:19,
fontFamily:fonts.body,
marginTop:4
},
sectionHead:{
flexDirection:'row',
justifyContent:'space-between',
alignItems:'flex-end',
marginTop:24,
marginBottom:10
},
kicker:{
color:colors.pinkDeep,
fontSize:7.5,
fontFamily:fonts.bodyBold,
letterSpacing:1.05,
marginTop:24
},
kickerNoMargin:{
color:colors.pinkDeep,
fontSize:7.5,
fontFamily:fonts.bodyBold,
letterSpacing:1.05
},
sectionTitle:{
color:colors.ink,
fontSize:24,
fontFamily:fonts.headingBold,
letterSpacing:-.5,
marginTop:4
},
edit:{
color:colors.pinkDeep,
fontSize:9,
fontFamily:fonts.bodyBold
},
foundationLabel:{
color:colors.pinkDeep,
fontSize:8,
fontFamily:fonts.bodyBold,
letterSpacing:1.05,
marginTop:24,
marginBottom:9
},
profileCard:{
minHeight:160,
borderRadius:24,
padding:15,
overflow:'hidden',
flexDirection:'row',
alignItems:'center',
gap:12
},
profileOrb:{
position:'absolute',
width:170,
height:170,
borderRadius:85,
borderWidth:28,
borderColor:'rgba(255,255,255,.08)',
right:-50,
top:-68
},
profileStatus:{
width:49,
height:49,
borderRadius:16,
backgroundColor:'white',
alignItems:'center',
justifyContent:'center'
},
profileStatusReady:{backgroundColor:'#087553'},
profileCopy:{
flex:1,
minWidth:0
},
profileKicker:{
color:'#D9D1D6',
fontSize:8,
fontFamily:fonts.bodyBold,
letterSpacing:.8
},
profileTitle:{
color:'white',
fontSize:24,
fontFamily:fonts.headingBold,
marginTop:4
},
profileText:{
color:'rgba(255,255,255,.78)',
fontSize:13,
lineHeight:20,
fontFamily:fonts.body,
marginTop:4,
maxWidth:230
},
profileArrow:{
width:36,
height:36,
borderRadius:18,
backgroundColor:'white',
alignItems:'center',
justifyContent:'center'
},
policy:{
borderRadius:19,
backgroundColor:'#FFF4DB',
borderWidth:1,
borderColor:'#F3D895',
padding:13,
flexDirection:'row',
gap:10,
marginTop:10
},
assist:{
borderRadius:19,
backgroundColor:'#EEF1FF',
borderWidth:1,
borderColor:'#D8DEFF',
padding:13,
flexDirection:'row',
gap:10,
marginTop:10
},
policyCopy:{flex:1},
policyTitle:{
color:'#7A5000',
fontSize:13,
fontFamily:fonts.headingBold
},
assistTitle:{
color:'#3154F5',
fontSize:13,
fontFamily:fonts.headingBold
},
policyText:{
color:colors.muted,
fontSize:12,
lineHeight:18,
fontFamily:fonts.body,
marginTop:3
},
requirements:{
marginTop:9,
borderRadius:21,
backgroundColor:'white',
borderWidth:1,
borderColor:colors.line,
overflow:'hidden'
},
requirement:{
minHeight:82,
flexDirection:'row',
alignItems:'center',
gap:10,
paddingHorizontal:13,
borderBottomWidth:1,
borderBottomColor:colors.line
},
number:{
color:'#B9B1B6',
fontSize:8,
fontFamily:fonts.bodyBold
},
requirementIcon:{
width:35,
height:35,
borderRadius:12,
backgroundColor:colors.pinkSoft,
alignItems:'center',
justifyContent:'center'
},
requirementText:{
flex:1,
color:colors.ink,
fontSize:14,
fontFamily:fonts.bodySemibold
},
cta:{
minHeight:84,
borderRadius:20,
backgroundColor:colors.pinkDeep,
paddingHorizontal:17,
flexDirection:'row',
alignItems:'center',
justifyContent:'space-between',
marginTop:18
},
readiness:{minHeight:108,borderRadius:20,backgroundColor:'#FFF0D5',borderWidth:1,borderColor:'#E7CDA5',padding:14,flexDirection:'row',alignItems:'center',gap:11,marginTop:14},
readinessIcon:{width:48,height:52,borderRadius:15,backgroundColor:'white',alignItems:'center',justifyContent:'center'},
readinessCopy:{flex:1},readinessKicker:{fontFamily:fonts.bodyBold,fontSize:7,letterSpacing:.85,color:'#8A5700'},readinessTitle:{fontFamily:fonts.headingBold,fontSize:11.5,lineHeight:15,color:colors.ink,marginTop:4},readinessText:{fontFamily:fonts.bodyBold,fontSize:8.5,color:'#8A5700',marginTop:5},
ctaKicker:{
color:'rgba(255,255,255,.65)',
fontSize:7,
fontFamily:fonts.bodyBold,
letterSpacing:.8
},
ctaText:{
color:'white',
fontSize:15.5,
fontFamily:fonts.headingBold,
marginTop:3
},
ctaArrow:{
width:39,
height:39,
borderRadius:20,
backgroundColor:'white',
alignItems:'center',
justifyContent:'center'
}
});
