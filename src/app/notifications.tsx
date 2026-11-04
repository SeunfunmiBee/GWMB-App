import { Ionicons } from '@expo/vector-icons';
import { router, type Href, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { PageHeader } from '@/components/PageHeader';
import { Screen } from '@/components/Screen';
import { SignInGate } from '@/components/SignInGate';
import { loadUserNotifications, markAllNotificationsRead, markNotificationRead, type UserNotification } from '@/lib/notification-store';
import { useAuth } from '@/providers/AuthProvider';
import { colors,fonts } from '@/theme';

type Filter='All'|'Learning'|'Mentorship'|'Community'|'Opportunities';
const filters:Filter[]=['All','Learning','Mentorship','Community','Opportunities'];

function categoryFor(kind:string):Exclude<Filter,'All'>{
  if(/course|learning|resource|replay|certificate/i.test(kind))return'Learning';
  if(/mentor/i.test(kind))return'Mentorship';
  if(/clique|community|chapter|sister|project/i.test(kind))return'Community';
  return'Opportunities';
}

function iconFor(kind:string):React.ComponentProps<typeof Ionicons>['name']{
  if(/course|learning/i.test(kind))return'book-outline';
  if(/resource|replay/i.test(kind))return'play-circle-outline';
  if(/mentor/i.test(kind))return'people-outline';
  if(/clique|community|chapter|sister/i.test(kind))return'chatbubbles-outline';
  if(/opportunit|application/i.test(kind))return'briefcase-outline';
  if(/event|session/i.test(kind))return'calendar-outline';
  return'notifications-outline';
}

export default function Notifications(){
  const{user}=useAuth();
  const[items,setItems]=useState<UserNotification[]>([]);
  const[loading,setLoading]=useState(Boolean(user));
  const[filter,setFilter]=useState<Filter>('All');
  useFocusEffect(useCallback(()=>{let active=true;if(!user){setItems([]);setLoading(false);return()=>{active=false};}setLoading(true);loadUserNotifications(user.id).then(result=>{if(active){setItems(result.error?[]:result.notifications);setLoading(false)}});return()=>{active=false};},[user]));
  const visible=useMemo(()=>filter==='All'?items:items.filter(item=>categoryFor(item.kind)===filter),[filter,items]);
  const unread=items.filter(item=>!item.read_at).length;

  async function markAll(){if(user)await markAllNotificationsRead(user.id);setItems(current=>current.map(item=>({...item,read_at:item.read_at??new Date().toISOString()})));}
  async function openItem(item:UserNotification){if(user&&!item.read_at){await markNotificationRead(user.id,item.id);setItems(current=>current.map(entry=>entry.id===item.id?{...entry,read_at:new Date().toISOString()}:entry));}if(item.route)router.push(item.route as Href);}

  if(!user)return <Screen><PageHeader title="Notifications"/><SignInGate title="Sign in to see your notifications" copy="New courses, mentors, events, applications and community updates are private to your account."/></Screen>;
  return <Screen>
    <PageHeader title="Notifications" eyebrow="Everything happening in GWMB"/>
    <View style={styles.hero}><View><Text style={styles.heroKicker}>YOUR GWMB UPDATES</Text><Text style={styles.heroTitle}>{unread?`${unread} new update${unread===1?'':'s'}`:'You’re up to date'}</Text><Text style={styles.heroCopy}>Courses, mentors, events, opportunities and community activity all meet here.</Text></View><View style={styles.heroIcon}><Ionicons name="notifications" size={24} color="white"/></View></View>
    <Pressable onPress={()=>router.push('/settings')} style={styles.preferences}><View style={styles.preferencesIcon}><Ionicons name="options-outline" size={20} color={colors.pinkDeep}/></View><View style={styles.preferencesCopy}><Text style={styles.preferencesTitle}>Choose what reaches you</Text><Text style={styles.preferencesText}>Manage push alerts, email and reminder timing.</Text></View><Ionicons name="arrow-forward" size={19} color={colors.ink}/></Pressable>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>{filters.map(item=><Pressable key={item} onPress={()=>setFilter(item)} style={[styles.filter,filter===item&&styles.filterActive]}><Text style={[styles.filterText,filter===item&&styles.filterTextActive]}>{item}</Text></Pressable>)}</ScrollView>
    {loading?<View style={styles.loading}><ActivityIndicator color={colors.pinkDeep}/></View>:visible.length?<><View style={styles.list}>{visible.map(item=>{const category=categoryFor(item.kind);return <Pressable key={item.id} onPress={()=>void openItem(item)} style={[styles.item,!item.read_at&&styles.itemUnread]}><View style={styles.icon}><Ionicons name={iconFor(item.kind)} size={22} color={colors.pinkDeep}/></View><View style={styles.copy}><View style={styles.itemTop}><Text style={styles.category}>{category.toUpperCase()}</Text><Text style={styles.time}>{new Date(item.created_at).toLocaleDateString('en-NG',{day:'numeric',month:'short'})}</Text></View><Text style={styles.title}>{item.title}</Text><Text style={styles.text}>{item.body}</Text></View>{!item.read_at?<View style={styles.dot}/>:null}</Pressable>})}</View>{unread?<Pressable onPress={markAll} style={styles.clear}><Text style={styles.clearText}>Mark all as read</Text></Pressable>:null}</>:<View style={styles.empty}><Ionicons name={filter==='All'?'checkmark-circle-outline':'search-outline'} size={31} color={colors.pinkDeep}/><Text style={styles.emptyTitle}>{filter==='All'?'You are all caught up.':`No ${filter.toLowerCase()} updates yet.`}</Text><Text style={styles.emptyText}>New courses, mentors, sessions, opportunities and community news will appear here as they are published.</Text></View>}
  </Screen>;
}

const styles=StyleSheet.create({hero:{minHeight:132,borderRadius:24,backgroundColor:colors.ink,padding:18,flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:14,marginBottom:12},heroKicker:{color:'#E9A8C5',fontSize:8.5,fontFamily:fonts.bodyBold,letterSpacing:1},heroTitle:{color:'white',fontSize:23,fontFamily:fonts.headingBold,marginTop:5},heroCopy:{color:'#CFC7CC',fontSize:10.5,lineHeight:16,fontFamily:fonts.body,marginTop:5,maxWidth:285},heroIcon:{width:50,height:50,borderRadius:17,backgroundColor:colors.pinkDeep,alignItems:'center',justifyContent:'center'},preferences:{minHeight:72,borderRadius:19,backgroundColor:colors.pinkSoft,padding:13,flexDirection:'row',alignItems:'center',marginBottom:14},preferencesIcon:{width:43,height:43,borderRadius:14,backgroundColor:'white',alignItems:'center',justifyContent:'center'},preferencesCopy:{flex:1,paddingHorizontal:11},preferencesTitle:{color:colors.ink,fontSize:12,fontFamily:fonts.headingBold},preferencesText:{color:colors.muted,fontSize:9.5,fontFamily:fonts.body,marginTop:3},filters:{gap:7,paddingBottom:16,paddingRight:12},filter:{height:39,borderRadius:999,borderWidth:1,borderColor:colors.line,backgroundColor:colors.surface,paddingHorizontal:14,alignItems:'center',justifyContent:'center'},filterActive:{backgroundColor:colors.ink,borderColor:colors.ink},filterText:{color:colors.muted,fontSize:9.5,fontFamily:fonts.bodyBold},filterTextActive:{color:'white'},loading:{height:260,alignItems:'center',justifyContent:'center'},list:{gap:10},item:{minHeight:108,borderRadius:21,borderWidth:1,borderColor:colors.line,backgroundColor:colors.surface,padding:14,flexDirection:'row',alignItems:'center'},itemUnread:{borderColor:'#E8A3C2',backgroundColor:'#FFFBFD'},icon:{width:48,height:48,borderRadius:16,backgroundColor:colors.pinkSoft,alignItems:'center',justifyContent:'center'},copy:{flex:1,minWidth:0,paddingHorizontal:12},itemTop:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:8},category:{color:colors.pinkDeep,fontSize:7.5,fontFamily:fonts.bodyBold,letterSpacing:.8},title:{color:colors.ink,fontSize:13,fontFamily:fonts.headingBold,marginTop:4},text:{color:colors.muted,fontSize:10.5,lineHeight:15,fontFamily:fonts.body,marginTop:4},time:{color:colors.muted,fontSize:8.5,fontFamily:fonts.bodyBold},dot:{width:8,height:8,borderRadius:4,backgroundColor:colors.pink},clear:{alignItems:'center',padding:19},clearText:{color:colors.pinkDeep,fontSize:10.5,fontFamily:fonts.bodyBold},empty:{borderRadius:23,borderWidth:1,borderColor:colors.line,backgroundColor:colors.surface,padding:26,alignItems:'center'},emptyTitle:{color:colors.ink,fontSize:18,fontFamily:fonts.headingBold,marginTop:12},emptyText:{color:colors.muted,fontSize:10.5,lineHeight:16,fontFamily:fonts.body,textAlign:'center',marginTop:6},
});
