import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { ImageBackground, Pressable, StyleSheet, Text, View } from 'react-native';
import { AuthScreen } from '@/components/AuthScreen';
import { completeWelcome } from '@/lib/first-launch';
import { colors, fonts } from '@/theme';

function enter(route: '/sign-up' | '/sign-in' | '/member-access' | '/') {
  completeWelcome();
  router.replace(route as never);
}

export default function WelcomeScreen() {
  return <AuthScreen showBack={false} eyebrow="Welcome to GWMB" title="Your next move starts here." description="Build your skills, career, confidence and community with Girls Who Mean Business.">
    <ImageBackground source={require('../../../assets/media/community/member-01.png')} resizeMode="cover" imageStyle={styles.visualImage} style={styles.visual}>
      <View style={styles.visualShade}/>
      <View style={styles.visualBadge}><Ionicons name="sparkles" size={15} color="#FFD100"/><Text style={styles.visualBadgeText}>MADE FOR YOUR JOURNEY</Text></View>
      <View style={styles.visualCopyWrap}><Text style={styles.visualTitle}>For the woman you&apos;re becoming.</Text><Text style={styles.visualCopy}>Discover practical support, meaningful connections and opportunities designed to move you forward.</Text></View>
    </ImageBackground>
    <Pressable accessibilityRole="button" onPress={() => enter('/sign-up')} style={({ pressed }) => [styles.primary, pressed && styles.pressed]}><Text style={styles.primaryText}>Create an account</Text><Ionicons name="arrow-forward" size={19} color="white"/></Pressable>
    <Pressable accessibilityRole="button" onPress={() => enter('/member-access')} style={({ pressed }) => [styles.member, pressed && styles.secondaryPressed]}><View style={styles.memberIcon}><Ionicons name="shield-checkmark-outline" size={20} color={colors.pinkDeep}/></View><View style={styles.memberCopy}><Text style={styles.memberEyebrow}>ALREADY A GWMB MEMBER?</Text><Text style={styles.memberText}>Verify & Continue as Member</Text></View><Ionicons name="chevron-forward" size={18} color={colors.ink}/></Pressable>
    <Pressable accessibilityRole="button" onPress={() => enter('/sign-in')} style={({ pressed }) => [styles.secondary, pressed && styles.secondaryPressed]}><Text style={styles.secondaryText}>Sign in</Text></Pressable>
    <Pressable accessibilityRole="button" onPress={() => enter('/')} style={styles.guest}><Text style={styles.guestText}>Explore as a guest</Text><Ionicons name="arrow-forward" size={16} color={colors.pinkDeep}/></Pressable>
  </AuthScreen>;
}

const styles=StyleSheet.create({visual:{height:300,borderRadius:27,padding:20,justifyContent:'space-between',overflow:'hidden',marginBottom:22},visualImage:{borderRadius:27},visualShade:{...StyleSheet.absoluteFill,backgroundColor:'rgba(17,16,17,.32)'},visualBadge:{alignSelf:'flex-start',minHeight:34,borderRadius:999,backgroundColor:'rgba(17,16,17,.62)',paddingHorizontal:11,flexDirection:'row',alignItems:'center',gap:7},visualBadgeText:{color:'white',fontSize:10,fontFamily:fonts.bodyBold,letterSpacing:.75},visualCopyWrap:{maxWidth:295},visualTitle:{color:'white',fontSize:27,lineHeight:31,fontFamily:fonts.heading,letterSpacing:-1},visualCopy:{color:'rgba(255,255,255,.9)',fontSize:13,lineHeight:19,fontFamily:fonts.bodyMedium,marginTop:8},primary:{minHeight:56,borderRadius:17,backgroundColor:colors.pinkDeep,paddingHorizontal:18,flexDirection:'row',alignItems:'center',justifyContent:'space-between'},pressed:{backgroundColor:colors.pinkDark,transform:[{scale:.99}]},primaryText:{color:'white',fontSize:14,fontFamily:fonts.bodyBold},member:{minHeight:70,borderRadius:17,borderWidth:1,borderColor:'#E8C4D5',backgroundColor:colors.pinkSoft,paddingHorizontal:13,flexDirection:'row',alignItems:'center',marginTop:10},memberIcon:{width:40,height:40,borderRadius:13,backgroundColor:'white',alignItems:'center',justifyContent:'center'},memberCopy:{flex:1,paddingHorizontal:11},memberEyebrow:{color:colors.pinkDeep,fontSize:8,fontFamily:fonts.bodyBold,letterSpacing:.7},memberText:{color:colors.ink,fontSize:12,fontFamily:fonts.headingBold,marginTop:3},secondary:{minHeight:54,borderRadius:17,borderWidth:1,borderColor:colors.ink,backgroundColor:colors.surface,alignItems:'center',justifyContent:'center',marginTop:10},secondaryPressed:{backgroundColor:colors.pinkSoft},secondaryText:{color:colors.ink,fontSize:13,fontFamily:fonts.bodyBold},guest:{minHeight:52,alignItems:'center',justifyContent:'center',flexDirection:'row',gap:7},guestText:{color:colors.pinkDeep,fontSize:12,fontFamily:fonts.bodyBold}});
