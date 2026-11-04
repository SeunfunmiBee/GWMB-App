import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { PageHeader } from '@/components/PageHeader';
import { Screen } from '@/components/Screen';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/AuthProvider';
import { colors, fonts } from '@/theme';

const communityTypes=['Student','Graduate','Professional'] as const;

export default function CommunityLocationScreen(){
  const{user}=useAuth();
  const[location,setLocation]=useState('');
  const[campus,setCampus]=useState('');
  const[type,setType]=useState<(typeof communityTypes)[number]>('Graduate');
  const[saved,setSaved]=useState(false);
  const needsCampus=type==='Student';
  const ready=Boolean(location.trim()&&(!needsCampus||campus.trim()));
  const match=useMemo(()=>needsCampus?`${campus||'Your campus'} Student Chapter`:`${location||'Your city'} City Chapter`,[campus,location,needsCampus]);

  useEffect(()=>{if(!user)return;let active=true;supabase.from('community_preferences').select('member_type,location,campus').eq('user_id',user.id).maybeSingle().then(({data})=>{if(!active||!data)return;setType((data.member_type==='student'?'Student':data.member_type==='professional'?'Professional':'Graduate'));setLocation(data.location??'');setCampus(data.campus??'')});return()=>{active=false}},[user]);

  async function save(){
    if(!ready)return;
    const preference={location:location.trim(),campus:campus.trim(),type};
    try{globalThis.localStorage?.setItem('gwmb-community-location',JSON.stringify(preference))}catch{/* Best-effort offline persistence. */}
    if(user)await supabase.from('community_preferences').upsert({user_id:user.id,member_type:type.toLowerCase(),location:preference.location,campus:preference.campus||null},{onConflict:'user_id'});
    setSaved(true);
  }

  return <Screen>
    <PageHeader title="Your local community" eyebrow="Community"/>
    <View style={styles.hero}><View style={styles.orb}/><View style={styles.heroIcon}><Ionicons name="location" size={23} color="white"/></View><Text style={styles.heroKicker}>FIND YOUR CHAPTER</Text><Text style={styles.heroTitle}>Tell us where you are.</Text><Text style={styles.heroCopy}>We’ll use your city or campus to show the Sister Circles, chapter gatherings and community updates that are actually relevant to you.</Text></View>

    {!saved?<View style={styles.form}>
      <Text style={styles.label}>I AM A</Text><View style={styles.typeRow}>{communityTypes.map(option=><Pressable key={option} onPress={()=>setType(option)} style={[styles.type,option===type&&styles.typeActive]}><Text style={[styles.typeText,option===type&&styles.typeTextActive]}>{option}</Text></Pressable>)}</View>
      <Text style={styles.label}>CITY / LOCATION</Text><View style={styles.inputWrap}><Ionicons name="location-outline" size={19} color={colors.muted}/><TextInput value={location} onChangeText={setLocation} placeholder="e.g. Lagos, Abuja, Ibadan" placeholderTextColor="#918A8F" style={styles.input}/></View>
      {needsCampus?<><Text style={styles.label}>SCHOOL / CAMPUS</Text><View style={styles.inputWrap}><Ionicons name="school-outline" size={19} color={colors.muted}/><TextInput value={campus} onChangeText={setCampus} placeholder="e.g. Obafemi Awolowo University" placeholderTextColor="#918A8F" style={styles.input}/></View></>:null}
      <View style={styles.preview}><View style={styles.previewIcon}><Ionicons name={needsCampus?'school':'business'} size={20} color="#087553"/></View><View style={styles.previewCopy}><Text style={styles.previewKicker}>YOUR COMMUNITY MATCH</Text><Text style={styles.previewTitle}>{match}</Text><Text style={styles.previewText}>Upcoming Sister Circles and local events will be tailored to this chapter.</Text></View></View>
      <Pressable disabled={!ready} onPress={()=>void save()} style={[styles.primary,!ready&&styles.primaryDisabled]}><Text style={styles.primaryText}>Save My Location</Text><Ionicons name="arrow-forward" size={18} color="white"/></Pressable>
    </View>:<View style={styles.success}><View style={styles.successIcon}><Ionicons name="checkmark" size={25} color="white"/></View><Text style={styles.successKicker}>COMMUNITY MATCH SAVED</Text><Text style={styles.successTitle}>{match}</Text><Text style={styles.successCopy}>Your Community feed can now prioritise nearby Sister Circles, chapter gatherings and relevant updates.</Text><Pressable onPress={()=>router.replace('/community')} style={styles.primary}><Text style={styles.primaryText}>Return to Community</Text><Ionicons name="arrow-forward" size={18} color="white"/></Pressable></View>}
  </Screen>
}

const styles=StyleSheet.create({hero:{borderRadius:25,backgroundColor:'#093F39',padding:19,overflow:'hidden'},orb:{position:'absolute',width:190,height:190,borderRadius:95,borderWidth:30,borderColor:'rgba(255,255,255,.08)',right:-65,top:-80},heroIcon:{width:49,height:49,borderRadius:16,backgroundColor:'#168878',alignItems:'center',justifyContent:'center'},heroKicker:{color:'#A9F4D8',fontSize:8,fontFamily:fonts.bodyBold,letterSpacing:1,marginTop:19},heroTitle:{color:'white',fontSize:25,fontFamily:fonts.headingBold,letterSpacing:-.7,marginTop:4},heroCopy:{color:'rgba(255,255,255,.78)',fontSize:11,lineHeight:17,fontFamily:fonts.body,marginTop:7,maxWidth:370},form:{marginTop:20},label:{color:colors.ink,fontSize:8.5,fontFamily:fonts.bodyBold,letterSpacing:.9,marginTop:16,marginBottom:7},typeRow:{flexDirection:'row',gap:7},type:{flex:1,height:44,borderRadius:14,borderWidth:1,borderColor:colors.line,backgroundColor:'white',alignItems:'center',justifyContent:'center'},typeActive:{backgroundColor:colors.ink,borderColor:colors.ink},typeText:{color:colors.muted,fontSize:10,fontFamily:fonts.bodyBold},typeTextActive:{color:'white'},inputWrap:{height:54,borderRadius:16,borderWidth:1,borderColor:colors.line,backgroundColor:'white',paddingHorizontal:14,flexDirection:'row',alignItems:'center',gap:8},input:{flex:1,height:'100%',color:colors.ink,fontSize:11,fontFamily:fonts.body},preview:{borderRadius:20,backgroundColor:'#E4F7EF',borderWidth:1,borderColor:'#BCEAD9',padding:14,flexDirection:'row',gap:11,marginTop:20},previewIcon:{width:45,height:45,borderRadius:15,backgroundColor:'white',alignItems:'center',justifyContent:'center'},previewCopy:{flex:1},previewKicker:{color:'#087553',fontSize:7.5,fontFamily:fonts.bodyBold,letterSpacing:.8},previewTitle:{color:colors.ink,fontSize:14,fontFamily:fonts.headingBold,marginTop:3},previewText:{color:colors.muted,fontSize:9.5,lineHeight:14,fontFamily:fonts.body,marginTop:3},primary:{minHeight:52,borderRadius:16,backgroundColor:colors.pinkDeep,paddingHorizontal:16,flexDirection:'row',alignItems:'center',justifyContent:'space-between',marginTop:16},primaryDisabled:{opacity:.42},primaryText:{color:'white',fontSize:11,fontFamily:fonts.bodyBold},success:{borderRadius:25,backgroundColor:'white',borderWidth:1,borderColor:colors.line,padding:20,marginTop:20,alignItems:'center'},successIcon:{width:52,height:52,borderRadius:18,backgroundColor:'#087553',alignItems:'center',justifyContent:'center'},successKicker:{color:'#087553',fontSize:8,fontFamily:fonts.bodyBold,letterSpacing:1,marginTop:17},successTitle:{color:colors.ink,fontSize:23,fontFamily:fonts.headingBold,marginTop:5,textAlign:'center'},successCopy:{color:colors.muted,fontSize:11,lineHeight:17,fontFamily:fonts.body,textAlign:'center',marginTop:7,maxWidth:340}});
