import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { CalendarBoard } from '@/components/CalendarBoard';
import { PageHeader } from '@/components/PageHeader';
import { Screen } from '@/components/Screen';
import { loadAdminCalendar, subscribeToCalendarChanges, type CalendarItem } from '@/lib/calendar-store';
import { colors, fonts } from '@/theme';

export default function AdminCalendar(){
  const[items,setItems]=useState<CalendarItem[]>([]);const[loading,setLoading]=useState(true);const[error,setError]=useState('');const[live,setLive]=useState(false);
  const refresh=useCallback(async()=>{const result=await loadAdminCalendar();if(result.error)setError(result.error.message);else{setItems(result.items);setError('')}setLoading(false)},[]);
  // Initial calendar data is resolved after mount, then kept current by database changes.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(()=>{void refresh();const unsubscribe=subscribeToCalendarChanges(()=>{setLive(true);void refresh();setTimeout(()=>setLive(false),1800)});return unsubscribe},[refresh]);
  const upcoming=useMemo(()=>items.filter(item=>new Date(item.starts_at)>=new Date()),[items]);
  function open(item:CalendarItem){if(item.source_type==='mentorship')router.push(`/admin/mentorship-session/${item.source_id}` as never);else if(item.source_type.startsWith('local_'))router.push('/chapter-admin' as never);else router.push(`/admin/builder?type=${item.source_type==='content_course'?'course':'event'}&id=${item.source_id}` as never)}
  return <Screen><PageHeader eyebrow="ADMIN OPERATIONS" title="Calendar"/>
    <View style={styles.head}><View><Text style={styles.kicker}>ONE OPERATIONAL VIEW</Text><Text style={styles.title}>Everything happening across GWMB.</Text><Text style={styles.copy}>Courses, live learning, mentorship and chapter activity update here from their original records.</Text></View><View style={[styles.live,live&&styles.liveOn]}><View style={[styles.dot,live&&styles.dotOn]}/><Text style={styles.liveText}>{live?'UPDATED':'LIVE SYNC'}</Text></View></View>
    <View style={styles.metrics}><Metric value={upcoming.length} label="Upcoming"/><Metric value={upcoming.filter(item=>item.source_type==='mentorship').length} label="Mentorship"/><Metric value={upcoming.filter(item=>item.source_type.startsWith('local_')).length} label="Chapter"/></View>
    {loading?<View style={styles.loading}><ActivityIndicator color={colors.ink}/><Text style={styles.copy}>Loading the operational calendar…</Text></View>:error?<View style={styles.error}><Text style={styles.errorTitle}>Calendar could not load</Text><Text style={styles.copy}>{error}</Text><Pressable onPress={()=>void refresh()} style={styles.retry}><Text style={styles.retryText}>Try again</Text></Pressable></View>:<CalendarBoard items={items} admin upcomingFirst onOpen={open}/>} 
  </Screen>
}
function Metric({value,label}:{value:number;label:string}){return <View style={styles.metric}><Text style={styles.metricValue}>{value}</Text><Text style={styles.metricLabel}>{label}</Text></View>}
const styles=StyleSheet.create({head:{borderRadius:22,backgroundColor:colors.ink,padding:19,marginBottom:10},kicker:{fontFamily:fonts.bodyBold,fontSize:7.5,letterSpacing:1.2,color:'#B8B1B5'},title:{fontFamily:fonts.heading,fontSize:23,lineHeight:28,color:'white',marginTop:7,maxWidth:390},copy:{fontFamily:fonts.body,fontSize:9.5,lineHeight:15,color:colors.muted,marginTop:6},live:{position:'absolute',right:14,top:14,borderRadius:999,backgroundColor:'rgba(255,255,255,.12)',paddingHorizontal:9,paddingVertical:6,flexDirection:'row',alignItems:'center',gap:5},liveOn:{backgroundColor:'rgba(82,221,167,.18)'},dot:{width:6,height:6,borderRadius:3,backgroundColor:'#A39CA0'},dotOn:{backgroundColor:'#52DDA7'},liveText:{fontFamily:fonts.bodyBold,fontSize:6.5,color:'white',letterSpacing:.8},metrics:{flexDirection:'row',gap:7,marginBottom:16},metric:{flex:1,minHeight:70,borderRadius:15,borderWidth:1,borderColor:'#DFDCDF',backgroundColor:colors.surface,padding:12,justifyContent:'space-between'},metricValue:{fontFamily:fonts.headingBold,fontSize:19,color:colors.ink},metricLabel:{fontFamily:fonts.body,fontSize:7.5,color:colors.muted},loading:{height:280,alignItems:'center',justifyContent:'center',gap:5},error:{borderRadius:18,borderWidth:1,borderColor:'#E1DDE0',backgroundColor:colors.surface,padding:18},errorTitle:{fontFamily:fonts.headingBold,fontSize:14,color:colors.ink},retry:{height:42,borderRadius:12,backgroundColor:colors.ink,alignItems:'center',justifyContent:'center',marginTop:13},retryText:{fontFamily:fonts.bodyBold,fontSize:9,color:'white'}});
