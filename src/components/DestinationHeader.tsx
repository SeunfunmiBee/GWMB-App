import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { useAuth } from '@/providers/AuthProvider';
import { fonts } from '@/theme';

type GradientColors = readonly [string, string, ...string[]];

export function DestinationHeader({ eyebrow, title, copy, colors, compact = false }: { eyebrow: string; title: string; copy: string; colors: GradientColors; compact?: boolean }) {
  const { user, profile, membership } = useAuth();
  const name = profile?.full_name || user?.email?.split('@')[0] || 'GWMB';
  const initials = name.split(' ').filter(Boolean).slice(0, 2).map(part => part[0]).join('').toUpperCase() || 'GW';

  return <LinearGradient colors={colors} locations={colors.length === 4 ? [0, .34, .7, 1] : undefined} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.header, compact && styles.headerCompact]}>
    <View style={styles.orbLarge}/><View style={styles.orbSmall}/>
    <View style={styles.top}>
      <Text style={styles.eyebrow}>{eyebrow}</Text>
      <Pressable accessibilityLabel="Open My GWMB" onPress={() => router.push('/profile')} style={({ pressed }) => [styles.profile, pressed && styles.profilePressed]}>
        {profile?.avatar_url ? <Image source={{ uri: profile.avatar_url }} style={styles.image}/> : user ? <Text style={styles.initials}>{initials}</Text> : <Ionicons name="person-outline" size={19} color="#17131A"/>}
        {membership?.status === 'verified' ? <View style={styles.memberDot}/> : null}
      </Pressable>
    </View>
    <View style={styles.copyWrap}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.copy}>{copy}</Text>
    </View>
  </LinearGradient>;
}

const styles = StyleSheet.create({
  header:{height:190,borderRadius:27,padding:19,overflow:'hidden',marginBottom:16,borderWidth:1,borderColor:'rgba(255,255,255,.18)'},
  headerCompact:{height:158},
  orbLarge:{position:'absolute',width:160,height:160,borderRadius:80,borderWidth:29,borderColor:'rgba(255,255,255,.11)',right:-43,top:-55},
  orbSmall:{position:'absolute',width:118,height:118,borderRadius:59,backgroundColor:'rgba(255,255,255,.08)',left:-45,bottom:-68},
  top:{flexDirection:'row',alignItems:'center',justifyContent:'space-between'},
  eyebrow:{color:'rgba(255,255,255,.78)',fontSize:8,fontFamily:fonts.bodyBold,letterSpacing:1.1},
  profile:{width:42,height:42,borderRadius:21,backgroundColor:'rgba(255,255,255,.94)',alignItems:'center',justifyContent:'center',borderWidth:1,borderColor:'rgba(255,255,255,.55)'},
  profilePressed:{transform:[{scale:.96}],opacity:.9},
  image:{width:38,height:38,borderRadius:19},
  initials:{color:'#17131A',fontSize:10,fontFamily:fonts.headingBold},
  memberDot:{position:'absolute',right:-1,bottom:0,width:11,height:11,borderRadius:6,backgroundColor:'#079267',borderWidth:2,borderColor:'white'},
  copyWrap:{marginTop:'auto',paddingRight:34},
  title:{color:'white',fontSize:27,lineHeight:31,fontFamily:fonts.headingBold,letterSpacing:-.9},
  copy:{color:'rgba(255,255,255,.80)',fontSize:10,lineHeight:15,fontFamily:fonts.bodyMedium,marginTop:6,maxWidth:320},
});
