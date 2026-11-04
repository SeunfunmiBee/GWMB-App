import { Ionicons } from '@expo/vector-icons';
import type { PropsWithChildren } from 'react';
import { Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { goBackOr } from '@/lib/navigation';
import { colors, fonts } from '@/theme';

type Props = PropsWithChildren<{ eyebrow: string; title: string; description: string; showBack?: boolean }>;

export function AuthScreen({ eyebrow, title, description, showBack = true, children }: Props) {
  return <SafeAreaView style={styles.safe}><KeyboardAvoidingView style={styles.fill} behavior={Platform.OS === 'ios' ? 'padding' : undefined}><ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}><View style={styles.top}>{showBack ? <Pressable accessibilityLabel="Go back" onPress={() => goBackOr('/')} style={styles.back}><Ionicons name="arrow-back" size={20} color={colors.ink} /></Pressable> : <View />}<View style={styles.mark}><Image accessibilityLabel="Girls Who Mean Business" source={require('../../assets/branding/gwmb-mark-transparent.png')} style={styles.markImage} /></View></View><View style={styles.intro}><Text style={styles.eyebrow}>{eyebrow}</Text><Text style={styles.title}>{title}</Text><Text style={styles.description}>{description}</Text></View>{children}</ScrollView></KeyboardAvoidingView></SafeAreaView>;
}

const styles = StyleSheet.create({ safe:{flex:1,backgroundColor:colors.canvas},fill:{flex:1},content:{flexGrow:1,width:'100%',maxWidth:520,alignSelf:'center',padding:20,paddingBottom:36},top:{flexDirection:'row',alignItems:'center',justifyContent:'space-between'},back:{width:42,height:42,borderRadius:21,borderWidth:1,borderColor:colors.line,backgroundColor:colors.surface,alignItems:'center',justifyContent:'center'},mark:{width:44,height:44,borderRadius:22,backgroundColor:colors.surface,alignItems:'center',justifyContent:'center',overflow:'hidden'},markImage:{width:42,height:42,resizeMode:'contain'},intro:{marginTop:45,marginBottom:27},eyebrow:{color:colors.pinkDeep,fontSize:9,fontFamily:fonts.bodyBold,letterSpacing:1.2,textTransform:'uppercase'},title:{color:colors.ink,fontSize:34,lineHeight:38,fontFamily:fonts.heading,letterSpacing:-1.4,marginTop:8},description:{color:colors.muted,fontSize:13,lineHeight:20,fontFamily:fonts.body,marginTop:11,maxWidth:330} });
