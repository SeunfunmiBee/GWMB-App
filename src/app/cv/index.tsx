import { Ionicons } from '@expo/vector-icons';
import { router as expoRouter, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { PageHeader } from '@/components/PageHeader';
import { Screen } from '@/components/Screen';
import { FadeIn } from '@/components/motion/FadeIn';
import { loadCv, type CvRecord } from '@/lib/cv-store';
import { useAuth } from '@/providers/AuthProvider';
import { colors, fonts } from '@/theme';

const router = { push: (href: string) => expoRouter.push((href==='/cv/review'?'/cv/review?new=1':href) as never) };

function ToolTile({kind,onPress}:{kind:'build'|'edit';onPress:()=>void}){
  const build=kind==='build';
  return <Pressable onPress={onPress} style={({pressed})=>[styles.tool,build?styles.buildTool:styles.editTool,pressed&&styles.toolPressed]}>
    <View style={[styles.toolBlob,build?styles.buildBlob:styles.editBlob]}/>
    <View style={[styles.toolWave,build?styles.buildWave:styles.editWave]}/>
    <View style={styles.toolIcon}><Ionicons name={build?'create-outline':'document-attach-outline'} size={23} color={colors.ink}/></View>
    <View style={styles.toolCopy}>
      <Text style={styles.toolKicker}>{build?'START FROM SCRATCH':'USE WHAT YOU HAVE'}</Text>
      <Text style={styles.toolTitle}>{build?'Build My CV':'Edit My CV'}</Text>
      <Text style={styles.toolText}>{build?'Create a clear professional CV step by step.':'Import, review and improve an existing CV.'}</Text>
    </View>
    <View style={styles.toolArrow}><Ionicons name="arrow-forward" size={16} color={colors.ink}/></View>
  </Pressable>
}

export default function CvLanding(){
  const{user}=useAuth();
  const[cv,setCv]=useState<CvRecord|null>(null);
  useFocusEffect(useCallback(()=>{let active=true;if(user)loadCv(user.id).then(result=>{if(active)setCv(result.cv)});return()=>{active=false}},[user]));

  if(!user)return <Screen><PageHeader title="CV Tool"/><View style={styles.gate}><Ionicons name="lock-closed-outline" size={29} color={colors.pinkDeep}/><Text style={styles.gateTitle}>Sign in to build and save your CV</Text><Text style={styles.gateCopy}>Your CV is private and stays connected to your GWMB account.</Text><Pressable onPress={()=>router.push('/sign-in')} style={styles.primary}><Text style={styles.primaryText}>Sign in</Text></Pressable></View></Screen>;

  return <Screen>
    <PageHeader title="CV Builder" eyebrow="Grow · Career"/>
    <FadeIn>
      <View style={styles.intro}>
        <View style={styles.introIcon}><Ionicons name="document-text-outline" size={22} color={colors.pinkDeep}/></View>
        <Text style={styles.introKicker}>GWMB CV TOOL</Text>
        <Text style={styles.introTitle}>Get your CV ready.</Text>
        <Text style={styles.introCopy}>Build your first CV or strengthen the one you already have for the opportunities you want.</Text>
      </View>
    </FadeIn>

    <View style={styles.sectionHead}>
      <Text style={styles.sectionTitle}>Quick access</Text>
      <Text style={styles.sectionMeta}>Choose one</Text>
    </View>
    <View style={styles.tools}>
      <ToolTile kind="build" onPress={()=>router.push('/cv/build')}/>
      <ToolTile kind="edit" onPress={()=>router.push('/cv/import')}/>
    </View>

    {cv?<>
      <View style={styles.sectionHead}>
        <Text style={styles.sectionTitle}>Your CV</Text>
        <Text style={styles.sectionMeta}>Recently updated</Text>
      </View>
      <Pressable onPress={()=>router.push('/cv/my')} style={({pressed})=>[styles.saved,pressed&&styles.savedPressed]}>
        <View style={styles.savedIcon}><Ionicons name="document-text-outline" size={21} color={colors.pinkDeep}/></View>
        <View style={styles.savedCopy}>
          <Text style={styles.savedKicker}>PRIMARY CV</Text>
          <Text style={styles.savedTitle}>{cv.name}</Text>
          <Text style={styles.savedMeta}>{cv.target_role||'General professional CV'} · Updated {new Date(cv.updated_at).toLocaleDateString()}</Text>
        </View>
        <View style={styles.savedArrow}><Ionicons name="arrow-forward" size={16} color="white"/></View>
      </Pressable>
    </>:null}

    <View style={styles.note}><Ionicons name="shield-checkmark-outline" size={19} color={colors.pinkDeep}/><Text style={styles.noteText}>Your CV is private and is never shown publicly or shared with other members.</Text></View>
  </Screen>
}

const styles=StyleSheet.create({
  intro:{paddingTop:8,paddingBottom:5},
  introIcon:{width:45,height:45,borderRadius:15,backgroundColor:colors.pinkSoft,alignItems:'center',justifyContent:'center',marginBottom:18},
  introKicker:{color:colors.pinkDeep,fontSize:8,fontFamily:fonts.bodyBold,letterSpacing:1},
  introTitle:{color:colors.ink,fontSize:31,lineHeight:35,fontFamily:fonts.heading,letterSpacing:-1.1,marginTop:7},
  introCopy:{color:colors.muted,fontSize:11,lineHeight:17,fontFamily:fonts.body,marginTop:8,maxWidth:330},
  sectionHead:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',marginTop:25,marginBottom:11},
  sectionTitle:{color:colors.ink,fontSize:16,fontFamily:fonts.headingBold},
  sectionMeta:{color:colors.muted,fontSize:9,fontFamily:fonts.bodyMedium},
  tools:{flexDirection:'row',gap:11},
  tool:{flex:1,minHeight:218,borderRadius:25,padding:14,overflow:'hidden'},
  toolPressed:{transform:[{scale:.98}]},
  buildTool:{backgroundColor:'#21142E'},
  editTool:{backgroundColor:'#17335C'},
  toolBlob:{position:'absolute',width:150,height:150,borderRadius:75,right:-50,top:-38},
  buildBlob:{backgroundColor:'#EF45BE'},
  editBlob:{backgroundColor:'#39A7E8'},
  toolWave:{position:'absolute',width:190,height:92,borderRadius:46,left:-35,bottom:-37,transform:[{rotate:'14deg'}],opacity:.9},
  buildWave:{backgroundColor:'#6B3AE4'},
  editWave:{backgroundColor:'#175CC7'},
  toolIcon:{width:45,height:45,borderRadius:15,backgroundColor:'white',alignItems:'center',justifyContent:'center'},
  toolCopy:{marginTop:'auto',paddingBottom:38},
  toolKicker:{color:'rgba(255,255,255,.72)',fontSize:8,fontFamily:fonts.bodyBold,letterSpacing:.65},
  toolTitle:{color:'white',fontSize:19,lineHeight:22,fontFamily:fonts.headingBold,marginTop:5},
  toolText:{color:'rgba(255,255,255,.82)',fontSize:10,lineHeight:15,fontFamily:fonts.body,marginTop:5,paddingRight:4},
  toolArrow:{position:'absolute',right:13,bottom:13,width:33,height:33,borderRadius:17,backgroundColor:'white',alignItems:'center',justifyContent:'center'},
  saved:{minHeight:91,borderRadius:20,backgroundColor:'white',borderWidth:1,borderColor:colors.line,padding:13,flexDirection:'row',alignItems:'center',gap:11},
  savedPressed:{borderColor:colors.pinkDeep},
  savedIcon:{width:45,height:45,borderRadius:15,backgroundColor:colors.pinkSoft,alignItems:'center',justifyContent:'center'},
  savedCopy:{flex:1},
  savedKicker:{color:colors.pinkDeep,fontSize:7,fontFamily:fonts.bodyBold,letterSpacing:.8},
  savedTitle:{color:colors.ink,fontSize:13,fontFamily:fonts.headingBold,marginTop:3},
  savedMeta:{color:colors.muted,fontSize:8,lineHeight:12,fontFamily:fonts.body,marginTop:3},
  savedArrow:{width:34,height:34,borderRadius:17,backgroundColor:colors.ink,alignItems:'center',justifyContent:'center'},
  note:{borderRadius:17,backgroundColor:colors.pinkSoft,padding:13,flexDirection:'row',gap:10,marginTop:17,marginBottom:8},
  noteText:{flex:1,color:colors.muted,fontSize:10,lineHeight:15,fontFamily:fonts.body},
  gate:{marginTop:50,alignItems:'center'},
  gateTitle:{color:colors.ink,fontSize:20,fontFamily:fonts.heading,textAlign:'center',marginTop:15},
  gateCopy:{color:colors.muted,fontSize:10,lineHeight:16,fontFamily:fonts.body,textAlign:'center',marginTop:7},
  primary:{height:50,borderRadius:15,backgroundColor:colors.pinkDeep,alignSelf:'stretch',alignItems:'center',justifyContent:'center',marginTop:20},
  primaryText:{color:'white',fontSize:11,fontFamily:fonts.bodyBold},
});
