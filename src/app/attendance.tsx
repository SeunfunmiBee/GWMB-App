/* eslint-disable react-hooks/set-state-in-effect */
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { PageHeader } from '@/components/PageHeader';
import { Screen } from '@/components/Screen';
import { loadMyAttendance, loadMyLiveActivities, loadMyParticipation, requestLiveAttendance, type AttendanceRecord, type LiveActivity, type ParticipationSummary } from '@/lib/chapter-admin';
import { useAuth } from '@/providers/AuthProvider';
import { colors, fonts } from '@/theme';

const defaultSummary: ParticipationSummary = { state: 'good', attended_count: 0, eligible_count: 0, participation_percentage: 100, review_started_at: null, downgraded_at: null };

export default function Attendance() {
  const router = useRouter();
  const { user, membership } = useAuth();
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [live, setLive] = useState<LiveActivity[]>([]);
  const [summary, setSummary] = useState<ParticipationSummary>(defaultSummary);
  const [loading, setLoading] = useState(true);
  const [requesting, setRequesting] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) { setLoading(false); return; }
    setLoading(true);
    try {
      const [attendance, liveActivities, participation] = await Promise.all([loadMyAttendance(), loadMyLiveActivities(), loadMyParticipation()]);
      setRecords(attendance); setLive(liveActivities); setSummary(participation);
    } catch (value) { setError(value instanceof Error ? value.message : 'Attendance could not be loaded.'); }
    finally { setLoading(false); }
  }, [user]);
  useEffect(() => { void load(); }, [load]);

  async function attend(activity: LiveActivity) {
    setRequesting(activity.id); setError(null); setNotice(null);
    try {
      await requestLiveAttendance(activity.id);
      setLive(current => current.map(item => item.id === activity.id ? { ...item, request_status: 'pending' } : item));
      setNotice('Attendance request sent. A chapter administrator will confirm that you are present.');
    } catch (value) { setError(value instanceof Error ? value.message : 'Your attendance request could not be sent.'); }
    finally { setRequesting(null); }
  }

  if (loading) return <Screen scroll={false}><ActivityIndicator color={colors.ink} style={{ marginTop: 120 }} /></Screen>;
  const percentage = Math.max(0, Math.min(100, Number(summary.participation_percentage)));
  const stateCopy = summary.state === 'downgraded'
    ? { title: 'Membership inactive', copy: 'Your membership was downgraded after another missed activity. Reapply to return as a member.', icon: 'lock-closed-outline' as const, tone: 'danger' as const }
    : summary.state === 'review'
      ? { title: 'Inactivity review', copy: 'Your participation is below 70%. Attend the next eligible activity to protect your membership.', icon: 'alert-circle-outline' as const, tone: 'warning' as const }
      : { title: 'In good standing', copy: 'Keep showing up. Only attendance confirmed by a chapter administrator counts.', icon: 'shield-checkmark-outline' as const, tone: 'good' as const };

  return <Screen>
    <PageHeader title="My Participation" />
    <View style={styles.hero}>
      <View style={styles.heroTop}><View><Text style={styles.kicker}>MEMBER PARTICIPATION</Text><Text style={styles.percentage}>{Math.round(percentage)}%</Text></View><View style={styles.heroIcon}><Ionicons name="pulse" size={24} color="white" /></View></View>
      <View style={styles.progress}><View style={[styles.progressFill, { width: `${percentage}%` }]} /></View>
      <View style={styles.heroBottom}><Text style={styles.heroMeta}>{summary.attended_count} attended</Text><Text style={styles.heroMeta}>{summary.eligible_count} eligible activities</Text></View>
    </View>
    <View style={[styles.state, stateCopy.tone === 'warning' && styles.stateWarning, stateCopy.tone === 'danger' && styles.stateDanger]}>
      <Ionicons name={stateCopy.icon} size={21} color={stateCopy.tone === 'danger' ? '#A9184D' : stateCopy.tone === 'warning' ? '#8B5A00' : '#087553'} />
      <View style={{ flex: 1 }}><Text style={styles.stateTitle}>{stateCopy.title}</Text><Text style={styles.stateCopy}>{stateCopy.copy}</Text></View>
      {summary.state === 'downgraded' ? <Pressable onPress={() => router.push('/membership-application')} style={styles.reapply}><Text style={styles.reapplyText}>Reapply</Text></Pressable> : null}
    </View>
    {notice ? <View style={styles.notice}><Ionicons name="hourglass-outline" size={18} color="#175FC8" /><Text style={styles.noticeText}>{notice}</Text></View> : null}
    {error ? <Text style={styles.error}>{error}</Text> : null}

    {live.length ? <><View style={styles.sectionHead}><View><Text style={styles.eyebrow}>HAPPENING NOW</Text><Text style={styles.sectionTitle}>Confirm you’re here</Text></View><View style={styles.liveDot} /></View><View style={styles.list}>{live.map(item => <View key={item.id} style={styles.liveCard}>
      <View style={styles.liveIcon}><Ionicons name={item.kind === 'event' ? 'calendar-outline' : 'construct-outline'} size={22} color="white" /></View>
      <View style={{ flex: 1, minWidth: 0 }}><Text style={styles.liveType}>LIVE · {item.kind}</Text><Text style={styles.liveTitle}>{item.title}</Text><Text style={styles.liveMeta}>{item.chapter_name} · {item.venue}</Text></View>
      <Pressable disabled={requesting === item.id || item.request_status === 'pending' || item.request_status === 'confirmed'} onPress={() => void attend(item)} style={[styles.attend, (item.request_status === 'pending' || item.request_status === 'confirmed') && styles.attendSent]}>
        {requesting === item.id ? <ActivityIndicator size="small" color="white" /> : <><Ionicons name={item.request_status === 'confirmed' ? 'checkmark-circle' : item.request_status === 'pending' ? 'time-outline' : 'hand-left-outline'} size={16} color="white" /><Text style={styles.attendText}>{item.request_status === 'confirmed' ? 'Confirmed' : item.request_status === 'pending' ? 'Sent' : 'Attend'}</Text></>}
      </Pressable>
    </View>)}</View></> : null}

    <View style={styles.sectionHead}><View><Text style={styles.eyebrow}>BACKEND CONFIRMED</Text><Text style={styles.sectionTitle}>Activity history</Text></View><Text style={styles.count}>{records.length} records</Text></View>
    <View style={styles.list}>{!user ? <Empty title="Sign in to see attendance" copy="Your confirmed member attendance is linked securely to your account." /> : membership?.status !== 'verified' && summary.state !== 'downgraded' ? <Empty title="Verify your membership first" copy="Participation is available to verified GWMB members." /> : records.length === 0 ? <Empty title="No attendance recorded yet" copy="After a chapter admin confirms your presence at an event or project, it will appear here." /> : records.map(item => <View key={item.id} style={styles.card}>
      <View style={[styles.icon, item.status === 'absent' && styles.iconAbsent]}><Ionicons name={item.status === 'attended' ? 'checkmark' : 'close'} size={20} color="white" /></View>
      <View style={{ flex: 1, minWidth: 0 }}><View style={styles.row}><Text style={styles.type}>{item.kind}</Text><Text style={[styles.status, item.status === 'absent' && styles.statusAbsent]}>{item.status === 'attended' ? 'CONFIRMED' : 'MISSED'}</Text></View><Text style={styles.cardTitle}>{item.title}</Text><Text style={styles.meta}>{item.chapter_name} · {new Date(item.starts_at).toLocaleDateString()}</Text><Text style={styles.meta}>{item.venue}</Text></View>
    </View>)}</View>
  </Screen>;
}

function Empty({ title, copy }: { title: string; copy: string }) { return <View style={styles.empty}><Ionicons name="calendar-clear-outline" size={27} color={colors.muted} /><Text style={styles.emptyTitle}>{title}</Text><Text style={styles.emptyCopy}>{copy}</Text></View>; }
const styles = StyleSheet.create({
  hero:{borderRadius:22,backgroundColor:colors.ink,padding:18},heroTop:{flexDirection:'row',justifyContent:'space-between',alignItems:'flex-start'},heroIcon:{width:48,height:48,borderRadius:15,backgroundColor:'#A9184D',alignItems:'center',justifyContent:'center'},kicker:{fontFamily:fonts.bodyBold,fontSize:8,letterSpacing:1.1,color:'#D9D2D8'},percentage:{fontFamily:fonts.heading,fontSize:45,lineHeight:51,color:'white',marginTop:5},progress:{height:8,borderRadius:8,backgroundColor:'#3D373C',overflow:'hidden',marginTop:15},progressFill:{height:'100%',borderRadius:8,backgroundColor:'#ED2A7B'},heroBottom:{flexDirection:'row',justifyContent:'space-between',marginTop:10},heroMeta:{fontFamily:fonts.bodyMedium,fontSize:9,color:'#DDD6DC'},
  state:{borderRadius:17,borderWidth:1,borderColor:'#CDE7DC',backgroundColor:'#EFF9F5',padding:14,flexDirection:'row',alignItems:'center',gap:10,marginTop:12},stateWarning:{borderColor:'#E9D7AD',backgroundColor:'#FFF8E9'},stateDanger:{borderColor:'#F0CAD7',backgroundColor:'#FFF2F6'},stateTitle:{fontFamily:fonts.headingBold,fontSize:12,color:colors.ink},stateCopy:{fontFamily:fonts.body,fontSize:8.7,lineHeight:13,color:colors.muted,marginTop:3},reapply:{minHeight:36,borderRadius:10,backgroundColor:colors.ink,paddingHorizontal:11,alignItems:'center',justifyContent:'center'},reapplyText:{fontFamily:fonts.bodyBold,fontSize:8.5,color:'white'},
  notice:{borderRadius:14,borderWidth:1,borderColor:'#C8DAF2',backgroundColor:'#EEF5FF',padding:12,flexDirection:'row',alignItems:'center',gap:9,marginTop:12},noticeText:{flex:1,fontFamily:fonts.bodyMedium,fontSize:9,lineHeight:14,color:'#244B78'},error:{fontFamily:fonts.bodyMedium,fontSize:9.5,color:'#A9184D',marginTop:13},sectionHead:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',marginTop:25,marginBottom:11},eyebrow:{fontFamily:fonts.bodyBold,fontSize:7.5,letterSpacing:1,color:'#A9184D'},sectionTitle:{fontFamily:fonts.heading,fontSize:20,color:colors.ink,marginTop:3},count:{fontFamily:fonts.body,fontSize:9,color:colors.muted},liveDot:{width:10,height:10,borderRadius:5,backgroundColor:'#EB315A'},list:{gap:9},liveCard:{minHeight:105,borderRadius:18,backgroundColor:'#171316',padding:12,flexDirection:'row',alignItems:'center',gap:10},liveIcon:{width:46,height:56,borderRadius:14,backgroundColor:'#A9184D',alignItems:'center',justifyContent:'center'},liveType:{fontFamily:fonts.bodyBold,fontSize:7.5,letterSpacing:.7,color:'#FF9BC2',textTransform:'uppercase'},liveTitle:{fontFamily:fonts.headingBold,fontSize:13,color:'white',marginTop:5},liveMeta:{fontFamily:fonts.body,fontSize:8.2,color:'#C8C0C6',marginTop:4},attend:{minWidth:72,minHeight:43,borderRadius:13,backgroundColor:'#ED2A7B',paddingHorizontal:9,alignItems:'center',justifyContent:'center',flexDirection:'row',gap:4},attendSent:{backgroundColor:'#4C454A'},attendText:{fontFamily:fonts.bodyBold,fontSize:8,color:'white'},
  card:{minHeight:101,borderRadius:17,borderWidth:1,borderColor:'#DFDCDF',backgroundColor:colors.surface,padding:12,flexDirection:'row',alignItems:'center',gap:11},icon:{width:44,height:52,borderRadius:13,backgroundColor:'#087553',alignItems:'center',justifyContent:'center'},iconAbsent:{backgroundColor:'#8D888C'},row:{flexDirection:'row',alignItems:'center',justifyContent:'space-between'},type:{fontFamily:fonts.bodyBold,fontSize:8,color:'#6D686C',textTransform:'uppercase'},status:{fontFamily:fonts.bodyBold,fontSize:7.5,color:'#087553'},statusAbsent:{color:'#A9184D'},cardTitle:{fontFamily:fonts.headingBold,fontSize:13.5,color:colors.ink,marginTop:6},meta:{fontFamily:fonts.body,fontSize:8.5,color:colors.muted,marginTop:4},empty:{minHeight:170,borderRadius:18,borderWidth:1,borderColor:'#DFDCDF',backgroundColor:'#F7F6F7',alignItems:'center',justifyContent:'center',padding:23},emptyTitle:{fontFamily:fonts.headingBold,fontSize:15,color:colors.ink,marginTop:11},emptyCopy:{fontFamily:fonts.body,fontSize:9.5,lineHeight:15,color:colors.muted,textAlign:'center',maxWidth:290,marginTop:5},
});
