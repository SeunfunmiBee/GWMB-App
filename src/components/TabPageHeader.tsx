import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '@/providers/AuthProvider';
import { colors, fonts } from '@/theme';

export function TabPageHeader({title,eyebrow,copy}:{title:string;eyebrow?:string;copy?:string}){
  const{user,profile,membership}=useAuth();
  const name=profile?.full_name||user?.email?.split('@')[0]||'GWMB';
  const initials=name.split(' ').filter(Boolean).slice(0,2).map(part=>part[0]).join('').toUpperCase()||'GW';
  return <View style={styles.row}>
    <View style={styles.copyWrap}>
      {eyebrow?<Text style={styles.eyebrow}>{eyebrow}</Text>:null}
      <Text style={styles.title}>{title}</Text>
      {copy?<Text style={styles.copy}>{copy}</Text>:null}
    </View>
    <Pressable accessibilityLabel="Open My GWMB" onPress={()=>router.push('/profile')} style={({pressed})=>[styles.profile,pressed&&styles.pressed]}>
      {profile?.avatar_url?<Image source={{uri:profile.avatar_url}} style={styles.image}/>:user?<Text style={styles.initials}>{initials}</Text>:<Ionicons name="person-outline" size={20} color="white"/>}
      {membership?.status==='verified'?<View style={styles.memberDot}/>:null}
    </Pressable>
  </View>
}

const styles=StyleSheet.create({
  row:{flexDirection:'row',alignItems:'flex-start',justifyContent:'space-between',gap:16,marginTop:5,marginBottom:20},
  copyWrap:{flex:1,minWidth:0},
  eyebrow:{color:colors.pinkDeep,fontSize:9,fontFamily:fonts.bodyBold,letterSpacing:1.1,textTransform:'uppercase'},
  title:{color:colors.ink,fontSize:29,lineHeight:33,fontFamily:fonts.heading,letterSpacing:-1,marginTop:3},
  copy:{color:colors.muted,fontSize:11,lineHeight:17,fontFamily:fonts.body,marginTop:4,maxWidth:330},
  profile:{width:43,height:43,borderRadius:22,backgroundColor:colors.ink,alignItems:'center',justifyContent:'center',borderWidth:2,borderColor:'white'},
  pressed:{backgroundColor:colors.pinkDeep,transform:[{scale:.96}]},
  image:{width:39,height:39,borderRadius:20},
  initials:{color:'white',fontSize:10,fontFamily:fonts.headingBold},
  memberDot:{position:'absolute',right:-1,bottom:0,width:11,height:11,borderRadius:6,backgroundColor:colors.green,borderWidth:2,borderColor:'white'},
});
