import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { useAuth } from '@/providers/AuthProvider';
import { colors, fonts } from '@/theme';

export function DestinationHeader({ eyebrow, title, copy, compact = false }: { eyebrow: string; title: string; copy: string; compact?: boolean }) {
  const { user, profile, membership } = useAuth();
  const name = profile?.full_name || user?.email?.split('@')[0] || 'GWMB';
  const initials = name.split(' ').filter(Boolean).slice(0, 2).map(part => part[0]).join('').toUpperCase() || 'GW';

  return <View style={[styles.header, compact && styles.headerCompact]}>
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
  </View>;
}

const styles = StyleSheet.create({
  header:{paddingTop:8,paddingBottom:22,marginBottom:16,borderBottomWidth:1,borderBottomColor:colors.line},
  headerCompact:{paddingBottom:18},


  top:{flexDirection:'row',alignItems:'center',justifyContent:'space-between'},
  eyebrow:{color:colors.pinkDeep,fontSize:10,fontFamily:fonts.bodyBold,letterSpacing:1},
  profile:{width:44,height:44,borderRadius:22,backgroundColor:colors.surface,alignItems:'center',justifyContent:'center',borderWidth:1,borderColor:colors.line},
  profilePressed:{transform:[{scale:.96}],opacity:.9},
  image:{width:38,height:38,borderRadius:19},
  initials:{color:'#17131A',fontSize:10,fontFamily:fonts.headingBold},
  memberDot:{position:'absolute',right:-1,bottom:0,width:11,height:11,borderRadius:6,backgroundColor:'#079267',borderWidth:2,borderColor:'white'},
  copyWrap:{marginTop:12},
  title:{color:colors.ink,fontSize:27,lineHeight:32,fontFamily:fonts.headingBold,letterSpacing:-.7},
  copy:{color:colors.muted,fontSize:12,lineHeight:18,fontFamily:fonts.body,marginTop:7,maxWidth:340},
});
