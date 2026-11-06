import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, ImageBackground, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { cliquesByCategory, type CliqueCategory } from '@/data/cliques';
import { nextCliqueSession, publishedCliqueSessions } from '@/lib/clique-events';
import { joinClique, loadJoinedCliques } from '@/lib/clique-store';
import { usePublishedContent } from '@/lib/content-runtime';
import { useAuth } from '@/providers/AuthProvider';
import { colors, fonts } from '@/theme';

export function CliquePromoStrip({ category }: { category: CliqueCategory }) {
  const router=useRouter();
  const{user,membership}=useAuth();
  const member=membership?.status==='verified';
  const[joined,setJoined]=useState<string[]>([]);
  const[joining,setJoining]=useState<string|null>(null);
  const eventContent=usePublishedContent('events');
  const sessions=useMemo(()=>publishedCliqueSessions(eventContent),[eventContent]);
  const items=cliquesByCategory(category);
  const joinedItems=items.filter(item=>joined.includes(item.id));
  const singleJoined=items.length===1&&joinedItems.length===1?joinedItems[0]:null;

  useFocusEffect(useCallback(()=>{let mounted=true;if(!user?.id){setJoined([]);return()=>{mounted=false};}void loadJoinedCliques(user.id).then(ids=>{if(mounted)setJoined(ids)});return()=>{mounted=false};},[user]));
  if(!items.length)return null;

  async function handlePress(cliqueId:string){
    if(!user){router.push('/sign-in');return;}
    if(!member){router.push('/membership');return;}
    if(joined.includes(cliqueId)){router.push('/cliques');return;}
    setJoining(cliqueId);
    const result=await joinClique(user.id,cliqueId);
    setJoined(result.ids);
    setJoining(null);
  }

  return <View style={styles.section}>
    <View style={styles.heading}>
      <View style={styles.headingCopy}><Text style={styles.kicker}>{singleJoined?'YOUR CLIQUE':'LEARN WITH YOUR PEOPLE'}</Text><Text style={styles.title}>{singleJoined?singleJoined.title:items.length>1?'Cliques matched to this path':'Your community for this path'}</Text><Text style={styles.pathCopy}>{singleJoined?'Your career community, sessions and conversations in one place.':'Based on your career direction and learning interests.'}</Text></View>
      <View style={styles.memberTag}><Ionicons name="lock-closed" size={11} color={colors.pinkDeep}/><Text style={styles.memberTagText}>MEMBERS</Text></View>
    </View>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
      {items.map(clique=>{
        const isJoined=joined.includes(clique.id);
        const session=isJoined?nextCliqueSession(sessions,clique.id):null;
        return <ImageBackground key={clique.id} source={clique.image} imageStyle={styles.image} style={[styles.card,items.length===1&&styles.cardWide]} resizeMode="cover">
          <LinearGradient colors={['rgba(8,7,9,.06)','rgba(8,7,9,.24)','rgba(8,7,9,.94)']} locations={[0,.42,1]} style={StyleSheet.absoluteFill}/>
          <View style={styles.cardTop}><View style={styles.cliqueBadge}><Ionicons name={isJoined?'checkmark':'people-outline'} size={14} color="white"/><Text style={styles.cliqueBadgeText}>{isJoined?'JOINED':'RECOMMENDED CLIQUE'}</Text></View></View>
          <View style={styles.cardBottom}>
            <Text style={styles.cardEyebrow}>{isJoined?(session?'COMING UP IN YOUR CLIQUE':'YOUR CLIQUE'):clique.category.toUpperCase()}</Text>
            <Text style={styles.cardTitle}>{session?.title??clique.title}</Text>
            <Text style={styles.cardCopy} numberOfLines={2}>{isJoined?(session?`${session.dateLabel} · ${session.location}`:'No upcoming session has been published yet.'):clique.copy}</Text>
            <Pressable disabled={joining===clique.id} onPress={()=>void handlePress(clique.id)} style={styles.button}>{joining===clique.id?<ActivityIndicator size="small" color={colors.ink}/>:<><Text style={styles.buttonText}>{isJoined?'Open My Clique':member?'Join this clique':'Explore membership'}</Text><Ionicons name={isJoined?'arrow-forward':member?'add':'lock-closed-outline'} size={18} color={colors.ink}/></>}</Pressable>
          </View>
        </ImageBackground>;
      })}
    </ScrollView>
  </View>;
}

const styles=StyleSheet.create({
  section:{marginBottom:28},heading:{flexDirection:'row',alignItems:'flex-start',justifyContent:'space-between',gap:12,marginBottom:13},headingCopy:{flex:1},kicker:{color:colors.pinkDeep,fontSize:9,fontFamily:fonts.bodyBold,letterSpacing:1.1,marginBottom:5},title:{color:colors.ink,fontSize:22,fontFamily:fonts.headingBold,letterSpacing:-.55},pathCopy:{color:colors.muted,fontSize:10.5,lineHeight:15,fontFamily:fonts.body,marginTop:4},memberTag:{height:29,borderRadius:15,backgroundColor:colors.pinkSoft,paddingHorizontal:10,flexDirection:'row',alignItems:'center',gap:5},memberTagText:{color:colors.pinkDeep,fontSize:8,fontFamily:fonts.bodyBold,letterSpacing:.7},row:{gap:11,paddingRight:14},card:{width:280,height:316,borderRadius:28,overflow:'hidden',padding:17,justifyContent:'space-between',backgroundColor:colors.ink},cardWide:{width:370,maxWidth:'100%'},image:{borderRadius:28},cardTop:{flexDirection:'row'},cliqueBadge:{height:31,borderRadius:16,backgroundColor:'rgba(15,12,14,.58)',paddingHorizontal:10,flexDirection:'row',alignItems:'center',gap:6},cliqueBadgeText:{color:'white',fontSize:8,fontFamily:fonts.bodyBold,letterSpacing:.8},cardBottom:{zIndex:1},cardEyebrow:{color:'#F5B6D1',fontSize:8.5,fontFamily:fonts.bodyBold,letterSpacing:1},cardTitle:{color:'white',fontSize:25,lineHeight:29,fontFamily:fonts.heading,letterSpacing:-.8,marginTop:5},cardCopy:{color:'rgba(255,255,255,.82)',fontSize:11,lineHeight:16,fontFamily:fonts.bodyMedium,marginTop:6},button:{height:54,borderRadius:17,backgroundColor:'white',paddingHorizontal:16,flexDirection:'row',alignItems:'center',justifyContent:'space-between',marginTop:15},buttonText:{color:colors.ink,fontSize:11.5,fontFamily:fonts.bodyBold},
});
