import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Screen } from '@/components/Screen';
import { listAdminContent } from '@/lib/admin-content';
import { useAuth } from '@/providers/AuthProvider';
import { colors, fonts } from '@/theme';

const libraries=[
  {area:'courses',label:'Courses',icon:'school-outline' as const},
  {area:'events',label:'Events',icon:'calendar-outline' as const},
  {area:'resources',label:'Resources',icon:'document-text-outline' as const},
  {area:'member-wins',label:'Member Spotlights',icon:'star-outline' as const},
];
const operations=[
  {icon:'calendar-outline' as const,title:'Operational calendar',route:'/admin/calendar'},
  {icon:'options-outline' as const,title:'Feature releases',route:'/admin/features'},
  {icon:'briefcase-outline' as const,title:'Applications',route:'/admin/applications'},
  {icon:'location-outline' as const,title:'Local chapters',route:'/admin/local-admins'},
  {icon:'checkmark-done-outline' as const,title:'Membership',route:'/admin/approvals'},
  {icon:'people-outline' as const,title:'Mentorship',route:'/admin/mentorship'},
  {icon:'notifications-outline' as const,title:'Notifications',route:'/admin/notifications'},
  {icon:'videocam-outline' as const,title:'Integrations',route:'/admin/integrations'},
  {icon:'document-text-outline' as const,title:'CV reviews',route:'/admin/cvs'},
  {icon:'ribbon-outline' as const,title:'Career Readiness',route:'/admin/career-readiness'},
  {icon:'chatbubbles-outline' as const,title:'Career Readiness questions',route:'/admin/career-readiness-questions'},
  {icon:'color-palette-outline' as const,title:'App content',route:'/admin/content?area=home'},
  {icon:'pulse-outline' as const,title:'Launch operations',route:'/admin/operations'},
];
export default function AdminDashboard(){
  const{isAdmin,loading,accountLoading}=useAuth();const[counts,setCounts]=useState<Record<string,number>>({});
  useEffect(()=>{if(isAdmin)void listAdminContent().then(({data})=>setCounts(data.reduce<Record<string,number>>((acc,item)=>({...acc,[item.area]:(acc[item.area]??0)+1}),{})))},[isAdmin]);
  if(loading||accountLoading)return <Screen scroll={false}><View style={styles.loading}><ActivityIndicator color={colors.ink}/></View></Screen>;
  if(!isAdmin)return <Screen><View style={styles.guard}><Ionicons name="shield-outline" size={34} color={colors.ink}/><Text style={styles.guardTitle}>Admin access required</Text></View></Screen>;
  return <Screen>
    <View style={styles.top}><View><Text style={styles.kicker}>GWMB ADMIN</Text><Text style={styles.pageTitle}>Dashboard</Text></View><Pressable accessibilityLabel="Create" onPress={()=>router.push('/admin/create' as never)} style={styles.create}><Ionicons name="add" size={27} color="white"/></Pressable></View>
    <Pressable onPress={()=>router.push('/admin/calendar' as never)} style={styles.calendarStrip}><View style={styles.calendarIcon}><Ionicons name="calendar-outline" size={22} color="white"/></View><View style={styles.calendarCopy}><Text style={styles.calendarEyebrow}>OPERATIONS CALENDAR</Text><Text style={styles.calendarTitle}>See everything happening across GWMB</Text></View><Ionicons name="arrow-forward" size={18} color="white"/></Pressable>
    <View style={styles.stats}><View><Text style={styles.statValue}>{Object.values(counts).reduce((sum,value)=>sum+value,0)}</Text><Text style={styles.statLabel}>Content records</Text></View><View style={styles.statDivider}/><View><Text style={styles.statValue}>{counts.events??0}</Text><Text style={styles.statLabel}>Events</Text></View><View style={styles.statDivider}/><View><Text style={styles.statValue}>{counts.courses??0}</Text><Text style={styles.statLabel}>Courses</Text></View></View>
    <Pressable accessibilityRole="button" accessibilityLabel="Open content library" onPress={()=>router.push('/admin/education' as never)} style={styles.sectionHead}><Text style={styles.section}>Content</Text><View style={styles.sectionLink}><Text style={styles.viewAll}>View all</Text><Ionicons name="arrow-forward" size={16} color={colors.ink}/></View></Pressable>
    <View style={styles.libraryGrid}>{libraries.map(item=><Pressable key={item.area} onPress={()=>router.push(item.area==='member-wins'?'/admin/content?area=member-wins' as never:`/admin/education?type=${item.area==='courses'?'course':item.area==='events'?'event':'resource'}` as never)} style={styles.libraryCard}><View style={styles.libraryIcon}><Ionicons name={item.icon} size={24} color={colors.ink}/></View><Text style={styles.libraryTitle}>{item.label}</Text><Text style={styles.libraryCount}>{counts[item.area]??0} items</Text><Ionicons name="arrow-forward" size={17} color={colors.ink}/></Pressable>)}</View>
    <Text style={styles.section}>Manage</Text><View style={styles.manage}>{operations.map(item=><Pressable key={item.title} onPress={()=>router.push(item.route as never)} style={styles.row}><View style={styles.rowIcon}><Ionicons name={item.icon} size={20} color={colors.ink}/></View><Text style={styles.rowTitle}>{item.title}</Text><Ionicons name="chevron-forward" size={18} color="#8A8589"/></Pressable>)}</View>
  </Screen>;
}
const styles=StyleSheet.create({loading:{flex:1,alignItems:'center',justifyContent:'center'},guard:{padding:25,borderRadius:20,backgroundColor:colors.surface,borderWidth:1,borderColor:colors.line,alignItems:'center'},guardTitle:{fontFamily:fonts.heading,fontSize:19,color:colors.ink,marginTop:12},top:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',marginBottom:16},kicker:{fontFamily:fonts.bodyBold,fontSize:9,letterSpacing:1.4,color:'#757176'},pageTitle:{fontFamily:fonts.heading,fontSize:34,lineHeight:39,color:colors.ink,letterSpacing:-1.2,marginTop:4},create:{width:52,height:52,borderRadius:17,backgroundColor:colors.ink,alignItems:'center',justifyContent:'center'},calendarStrip:{minHeight:87,borderRadius:19,backgroundColor:colors.ink,padding:14,flexDirection:'row',alignItems:'center',marginBottom:10},calendarIcon:{width:47,height:47,borderRadius:14,backgroundColor:'#463A49',alignItems:'center',justifyContent:'center'},calendarCopy:{flex:1,paddingHorizontal:12},calendarEyebrow:{fontFamily:fonts.bodyBold,fontSize:7.5,letterSpacing:1,color:'#BFB7BC'},calendarTitle:{fontFamily:fonts.headingBold,fontSize:13,color:'white',marginTop:5},stats:{minHeight:92,borderRadius:18,borderWidth:1,borderColor:'#E1DEE1',backgroundColor:'#F5F4F5',paddingHorizontal:18,flexDirection:'row',alignItems:'center',justifyContent:'space-between'},statValue:{fontFamily:fonts.headingBold,fontSize:21,color:colors.ink},statLabel:{fontFamily:fonts.body,fontSize:8.5,color:colors.muted,marginTop:3},statDivider:{width:1,height:40,backgroundColor:'#D9D6D9'},sectionHead:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',marginTop:27,marginBottom:11},sectionLink:{flexDirection:'row',alignItems:'center',gap:6},section:{fontFamily:fonts.heading,fontSize:21,color:colors.ink,marginTop:27,marginBottom:11},viewAll:{fontFamily:fonts.bodyBold,fontSize:9.5,color:colors.ink},libraryGrid:{flexDirection:'row',flexWrap:'wrap',gap:8},libraryCard:{width:'48%',minHeight:142,borderRadius:18,borderWidth:1,borderColor:'#DFDCDF',backgroundColor:'#F7F6F7',padding:12},libraryIcon:{width:43,height:43,borderRadius:13,backgroundColor:'white',borderWidth:1,borderColor:'#E4E1E4',alignItems:'center',justifyContent:'center'},libraryTitle:{fontFamily:fonts.headingBold,fontSize:12.5,color:colors.ink,marginTop:15},libraryCount:{fontFamily:fonts.body,fontSize:8.5,color:colors.muted,marginTop:3,flex:1},manage:{borderRadius:19,borderWidth:1,borderColor:'#E1DEE1',backgroundColor:colors.surface,overflow:'hidden'},row:{minHeight:64,paddingHorizontal:13,flexDirection:'row',alignItems:'center',borderBottomWidth:1,borderBottomColor:'#ECEAEC'},rowIcon:{width:38,height:38,borderRadius:12,backgroundColor:'#F1F0F1',alignItems:'center',justifyContent:'center'},rowTitle:{flex:1,fontFamily:fonts.headingBold,fontSize:12,color:colors.ink,paddingHorizontal:11}});
