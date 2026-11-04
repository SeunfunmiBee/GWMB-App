import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { loadCv } from '@/lib/cv-store';
import type { MarketplaceJourney } from '@/lib/marketplace-journey';
import type { Profile } from '@/types/database';
import { colors, fonts } from '@/theme';

type Props={userId:string;profile:Profile|null;journey:MarketplaceJourney|null};

export function ProfileCompletionCard({userId,profile,journey}:Props){
  const[hasCv,setHasCv]=useState(false);
  useFocusEffect(useCallback(()=>{let active=true;void loadCv(userId).then(result=>{if(active)setHasCv(Boolean(result.cv))});return()=>{active=false}},[userId]));
  const actions=useMemo(()=>[
    {label:'Complete account setup',done:Boolean(profile?.full_name),route:'/edit-profile',icon:'person-outline' as const,essential:true},
    {label:'Add profile photo',done:Boolean(profile?.avatar_url),route:'/edit-profile',icon:'camera-outline' as const,essential:false},
    {label:'Select career interests',done:Boolean(journey?.interests?.length),route:'/marketplace-journey',icon:'compass-outline' as const,essential:true},
    {label:'Upload or build your CV',done:hasCv,route:'/cv',icon:'document-text-outline' as const,essential:false},
  ],[hasCv,journey?.interests?.length,profile?.avatar_url,profile?.full_name]);
  const done=actions.filter(item=>item.done).length;const percent=Math.round(done/actions.length*100);const essentialMissing=actions.some(item=>item.essential&&!item.done);
  if(done===actions.length)return null;
  return <View style={styles.card}><View style={styles.top}><View><Text style={styles.kicker}>FINISH SETTING UP</Text><Text style={styles.title}>Make GWMB work for you</Text></View><Text style={styles.percent}>{percent}%</Text></View><View style={styles.track}><View style={[styles.fill,{width:`${percent}%`}]}/></View>{essentialMissing?<Text style={styles.note}>Complete the essential steps to unlock fully personalised recommendations.</Text>:null}<View style={styles.actions}>{actions.map(item=><Pressable key={item.label} disabled={item.done} onPress={()=>router.push(item.route as never)} style={styles.action}><View style={[styles.check,item.done&&styles.checkDone]}><Ionicons name={item.done?'checkmark':item.icon} size={15} color={item.done?'white':colors.pinkDeep}/></View><Text style={[styles.actionText,item.done&&styles.actionDone]}>{item.label}</Text>{!item.done?<Ionicons name="arrow-forward" size={15} color={colors.ink}/>:null}</Pressable>)}</View></View>;
}

const styles=StyleSheet.create({card:{borderRadius:20,borderWidth:1,borderColor:'#E0DADF',backgroundColor:'#FCFAFB',padding:14,marginBottom:18},top:{flexDirection:'row',alignItems:'flex-start',justifyContent:'space-between'},kicker:{fontFamily:fonts.bodyBold,fontSize:7.5,letterSpacing:1,color:colors.pinkDeep},title:{fontFamily:fonts.headingBold,fontSize:14,color:colors.ink,marginTop:4},percent:{fontFamily:fonts.headingBold,fontSize:13,color:colors.pinkDeep},track:{height:4,borderRadius:4,backgroundColor:'#E7E1E5',overflow:'hidden',marginTop:12},fill:{height:'100%',backgroundColor:colors.pinkDeep},note:{fontFamily:fonts.body,fontSize:8.5,lineHeight:13,color:colors.muted,marginTop:8},actions:{gap:5,marginTop:10},action:{minHeight:43,borderRadius:13,backgroundColor:'white',paddingHorizontal:9,flexDirection:'row',alignItems:'center',gap:9},check:{width:28,height:28,borderRadius:10,backgroundColor:colors.pinkSoft,alignItems:'center',justifyContent:'center'},checkDone:{backgroundColor:'#087553'},actionText:{flex:1,fontFamily:fonts.bodyBold,fontSize:9.5,color:colors.ink},actionDone:{color:colors.muted,textDecorationLine:'line-through'}});
