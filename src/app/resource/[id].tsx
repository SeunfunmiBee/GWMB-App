import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useMemo } from 'react';
import {
 ActivityIndicator, Alert, Pressable, StyleSheet, Text, View
} from 'react-native';
import { PageHeader } from '@/components/PageHeader';
import { Screen } from '@/components/Screen';
import { AppStateView } from '@/components/states/AppStateView';
import {
 colors, fonts
} from '@/theme';
import { usePublishedContentState } from '@/lib/content-runtime';
import { resolveContentFileUrl } from '@/lib/admin-content';
import { useAuth } from '@/providers/AuthProvider';

const resources:Record<string,{type:string;title:string;copy:string;meta:string;points:string[]}>= {
  'weekly-planning':{
type:'Practical Resource',
title:'The Weekly Planning Template',
copy:'A simple reusable template for turning priorities into a realistic week you can actually follow.',
meta:'PDF · 5 pages',
points:['Choose three weekly priorities','Plan realistic focus blocks','Protect rest and recovery','Review and reset each week']
},
  'better-goals':{
type:'Personal Growth Guide',
title:'A Better Way to Set Goals',
copy:'Make your next goal specific, workable and connected to an action you can take now.',
meta:'8 min read',
points:['Define a meaningful outcome','Choose the smallest next action','Set a realistic check-in rhythm','Review progress without judgement']
},
  'conflict-guide':{
type:'Leadership Guide',
title:'Communicating Through Conflict',
copy:'A practical guide to direct, respectful conversations when expectations or perspectives differ.',
meta:'Guide · 12 min',
points:['Prepare for the conversation','Separate facts from assumptions','Communicate clearly and calmly','Agree on a useful next step']
},
  'monthly-budget-workbook':{
type:'Smart Money Workbook',
title:'Your Monthly Money Workbook',
copy:'A practical, shame-free workbook for planning your money around the life you are actually living.',
meta:'Editable · 12 pages',
points:['Map your income and essential costs','Plan flexible spending without guilt','Choose one realistic savings goal','Review and reset each month']
},
  'first-job-playbook':{
type:'Career Book',
title:'The First Job Playbook',
copy:'A concise guide to preparing, positioning yourself and navigating your first professional opportunity with confidence.',
meta:'Digital book · 28 pages',
points:['Understand what employers look for','Translate school and project experience','Prepare for applications and interviews','Build strong early-career habits']
},
  'presentation-practice':{
type:'Communication Workbook',
title:'Presentation Practice Planner',
copy:'A guided workbook for structuring your message, rehearsing intentionally and speaking with greater clarity.',
meta:'PDF · 8 pages',
points:['Define your audience and outcome','Build a simple message structure','Plan your opening and close','Track practice and useful feedback']
},
};

export default function ResourceDetail(){
  const{id}=useLocalSearchParams<{id:string}>();
  const{user,membership}=useAuth();
  const contentState=usePublishedContentState('resources');
  const item=useMemo(()=>{
    const content=contentState.items.find(candidate=>candidate.slug===id);
    if(!content)return null;
    const fallback=resources[id];
    const rawMeta=content.metadata.length||content.metadata.format||fallback?.meta||'Resource';
    return {
      type:content.eyebrow||fallback?.type||'Practical Resource',
      title:content.title,
      copy:content.body||content.summary||fallback?.copy||'',
      meta:String(rawMeta),
      points:Array.isArray(content.metadata.points)?content.metadata.points.filter((point):point is string=>typeof point==='string'):fallback?.points??[],
      url:typeof content.metadata.url==='string'?content.metadata.url:'',
      membersOnly:content.access_level==='members',
    };
  },[contentState.items,id]);

  if(contentState.loading)return <Screen><PageHeader title="Resource"/><View style={styles.state}><ActivityIndicator color={colors.pinkDeep}/></View></Screen>;
  if(contentState.error)return <Screen><PageHeader title="Resource"/><AppStateView kind="error" copy={contentState.error.message} actionLabel="Try again" onAction={()=>void contentState.refresh()}/></Screen>;
  if(!item)return <Screen><PageHeader title="Resource"/><AppStateView kind="no-results" eyebrow="RESOURCE UNAVAILABLE" title="This resource is no longer available." copy="It may have been unpublished or the link may be incorrect."/></Screen>;
  const activeItem=item;

  async function open(){
    if(activeItem.membersOnly&&membership?.status!=='verified'){Alert.alert('Members-only resource',user?'Verify your GWMB membership to open this resource.':'Sign in and verify your membership to continue.');return}
    if(!activeItem.url){Alert.alert('Resource unavailable','The downloadable file has not been published yet.');return}
    const result=await resolveContentFileUrl(activeItem.url);
    if(result.error||!result.url){Alert.alert('Resource unavailable','We could not open this resource. Check your access and try again.');return}
    await WebBrowser.openBrowserAsync(result.url);
  }

  return <Screen><PageHeader title="Resource" eyebrow={item.type}/><View style={styles.media}><View style={styles.orbit}/><Text style={styles.mediaTag}>GWMB RESOURCE</Text><Text style={styles.mediaTitle}>{item.title}</Text><Ionicons name="document-text-outline" size={42} color="white"/></View><Text style={styles.title}>About this resource</Text><Text style={styles.copy}>{item.copy}</Text><View style={styles.meta}><Ionicons name="time-outline" size={18} color={colors.pinkDeep}/><Text style={styles.metaText}>{item.meta} · {item.membersOnly?'Members Only':'Open Access'}</Text></View><Text style={styles.sectionTitle}>Inside the resource</Text><View style={styles.points}>{item.points.map(point=><View key={point} style={styles.point}><Ionicons name="checkmark" size={15} color={colors.pinkDeep}/><Text style={styles.pointText}>{point}</Text></View>)}</View><Pressable accessibilityRole="button" accessibilityLabel={`Open ${item.title}`} onPress={()=>void open()} style={styles.cta}><Text style={styles.ctaText}>Open resource</Text><Ionicons name="arrow-forward" size={18} color="white"/></Pressable></Screen>;
}

const styles=StyleSheet.create({
state:{minHeight:240,alignItems:'center',justifyContent:'center'},
media:{
height:290,
borderRadius:24,
backgroundColor:'#7040A0',
padding:21,
justifyContent:'space-between',
overflow:'hidden'
},
orbit:{
position:'absolute',
right:-32,
top:-42,
width:155,
height:155,
borderRadius:78,
borderWidth:28,
borderColor:'rgba(255,255,255,.13)'
},
mediaTag:{
color:'rgba(255,255,255,.8)',
fontSize:9,
fontFamily:fonts.bodyBold,
letterSpacing:1.1
},
mediaTitle:{
color:'white',
fontSize:34,
lineHeight:38,
fontFamily:fonts.heading,
letterSpacing:-.9,
maxWidth:290
},
title:{
color:colors.ink,
fontSize:27,
fontFamily:fonts.heading,
marginTop:24
},
copy:{
color:colors.muted,
fontSize:15,
lineHeight:24,
fontFamily:fonts.body,
marginTop:8
},
meta:{
minHeight:68,
borderRadius:16,
borderWidth:1,
borderColor:colors.line,
backgroundColor:colors.surface,
flexDirection:'row',
alignItems:'center',
gap:10,
paddingHorizontal:14,
marginTop:18
},
metaText:{
color:colors.ink,
fontSize:13,
fontFamily:fonts.bodyBold
},
sectionTitle:{
color:colors.ink,
fontSize:22,
fontFamily:fonts.headingBold,
marginTop:25,
marginBottom:10
},
points:{gap:8},
point:{
minHeight:68,
borderRadius:15,
backgroundColor:colors.surface,
borderWidth:1,
borderColor:colors.line,
paddingHorizontal:13,
flexDirection:'row',
gap:10,
alignItems:'center'
},
pointText:{
color:colors.ink,
fontSize:13.5,
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
marginTop:20
},
ctaText:{
color:'white',
fontSize:14,
fontFamily:fonts.bodyBold
}
});
