import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import * as Linking from 'expo-linking';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { AuthField } from '@/components/AuthField';
import { AuthScreen } from '@/components/AuthScreen';
import { completeWelcome } from '@/lib/first-launch';
import { supabase } from '@/lib/supabase';
import { colors, fonts } from '@/theme';

export default function MemberAccessScreen() {
  const [firstName,setFirstName]=useState('');
  const [lastName,setLastName]=useState('');
  const [appEmail,setAppEmail]=useState('');
  const [password,setPassword]=useState('');
  const [membershipEmail,setMembershipEmail]=useState('');
  const [memberId,setMemberId]=useState('');
  const [chapter,setChapter]=useState('');
  const [message,setMessage]=useState<string|null>(null);
  const [submitting,setSubmitting]=useState(false);
  const [success,setSuccess]=useState(false);

  async function continueAsMember() {
    setMessage(null);
    if(firstName.trim().length<2||lastName.trim().length<2){setMessage('Enter your first and last name.');return;}
    if(!appEmail.includes('@')||!membershipEmail.includes('@')){setMessage('Enter valid app and membership email addresses.');return;}
    if(memberId.trim().length<4){setMessage('Enter your GWMB Member ID.');return;}
    if(!chapter.trim()){setMessage('Enter your chapter.');return;}
    if(password.length<8){setMessage('Use at least 8 characters for your password.');return;}
    setSubmitting(true);
    const fullName=`${firstName.trim()} ${lastName.trim()}`;
    const {data,error}=await supabase.auth.signUp({
      email:appEmail.trim().toLowerCase(),password,
      options:{
        data:{
          first_name:firstName.trim(),last_name:lastName.trim(),full_name:fullName,
          membership_intent:true,
          membership_email:membershipEmail.trim().toLowerCase(),
          member_identifier:memberId.trim(),chapter:chapter.trim(),
        },
        emailRedirectTo:Linking.createURL('verify-membership'),
      },
    });
    setSubmitting(false);
    if(error){
      setMessage(error.message.toLowerCase().includes('registered')
        ? 'An app account already exists for this email. Sign in, then verify membership from My GWMB.'
        : error.message);
      return;
    }
    if(data.session){completeWelcome();router.replace('/verify-membership');return;}
    setSuccess(true);
  }

  if(success)return <AuthScreen eyebrow="Secure your account" title="Confirm your app email" description={`We sent a confirmation link to ${appEmail.trim().toLowerCase()}.`}><View style={styles.success}><View style={styles.successIcon}><Ionicons name="mail-outline" size={26} color={colors.pinkDeep}/></View><Text style={styles.successTitle}>Your membership details are ready</Text><Text style={styles.successCopy}>Confirm your app email, then sign in. GWMB will match your Member ID and membership email without creating a separate member account.</Text></View><Pressable onPress={()=>router.replace('/sign-in')} style={styles.primary}><Text style={styles.primaryText}>Go to sign in</Text></Pressable></AuthScreen>;

  return <AuthScreen eyebrow="Existing GWMB member" title="Verify & continue as a member" description="Create one secure app account, then we’ll link it to your official GWMB membership record.">
    <View style={styles.section}><Text style={styles.sectionEyebrow}>YOUR APP ACCOUNT</Text><View style={styles.nameRow}><View style={styles.nameField}><AuthField label="First name" value={firstName} onChangeText={setFirstName} placeholder="First name" autoCapitalize="words" autoComplete="given-name"/></View><View style={styles.nameField}><AuthField label="Last name" value={lastName} onChangeText={setLastName} placeholder="Last name" autoCapitalize="words" autoComplete="family-name"/></View></View><AuthField label="App account email" value={appEmail} onChangeText={setAppEmail} placeholder="Email used to sign in" keyboardType="email-address" autoComplete="email"/><AuthField label="Password" value={password} onChangeText={setPassword} placeholder="At least 8 characters" password autoComplete="new-password"/></View>
    <View style={styles.section}><Text style={styles.sectionEyebrow}>OFFICIAL MEMBERSHIP DETAILS</Text><AuthField label="Membership email" value={membershipEmail} onChangeText={setMembershipEmail} placeholder="Email registered with GWMB" keyboardType="email-address"/><AuthField label="GWMB Member ID" value={memberId} onChangeText={setMemberId} placeholder="e.g. GWMB-2026-0012" autoCapitalize="characters"/><AuthField label="Chapter" value={chapter} onChangeText={setChapter} placeholder="e.g. Lagos City Club" autoCapitalize="words"/></View>
    <View style={styles.security}><Ionicons name="shield-checkmark-outline" size={20} color={colors.pinkDeep}/><Text style={styles.securityText}>Member ID and registered membership email are the primary match. Your chapter is an additional check.</Text></View>
    {message?<View style={styles.message}><Text style={styles.messageText}>{message}</Text></View>:null}
    <Pressable disabled={submitting} onPress={()=>void continueAsMember()} style={[styles.primary,submitting&&styles.disabled]}>{submitting?<ActivityIndicator color="white"/>:<><Text style={styles.primaryText}>Create account & verify</Text><Ionicons name="arrow-forward" size={18} color="white"/></>}</Pressable>
    <Pressable onPress={()=>router.replace('/sign-in')} style={styles.signIn}><Text style={styles.signInText}>Already created an app account? <Text style={styles.signInStrong}>Sign in</Text></Text></Pressable>
  </AuthScreen>;
}

const styles=StyleSheet.create({section:{borderRadius:21,borderWidth:1,borderColor:colors.line,backgroundColor:colors.surface,padding:15,marginBottom:12},sectionEyebrow:{color:colors.pinkDeep,fontSize:9,fontFamily:fonts.bodyBold,letterSpacing:1,marginBottom:13},nameRow:{flexDirection:'row',gap:10},nameField:{flex:1,minWidth:0},security:{borderRadius:16,backgroundColor:colors.pinkSoft,padding:13,flexDirection:'row',gap:9,alignItems:'center'},securityText:{flex:1,color:colors.muted,fontSize:10,lineHeight:15,fontFamily:fonts.body},message:{borderRadius:13,backgroundColor:'#FFF0F3',padding:12,marginTop:12},messageText:{color:'#A31D43',fontSize:10,lineHeight:15,fontFamily:fonts.body},primary:{minHeight:55,borderRadius:17,backgroundColor:colors.pinkDeep,paddingHorizontal:17,flexDirection:'row',alignItems:'center',justifyContent:'space-between',marginTop:15},primaryText:{color:'white',fontSize:12,fontFamily:fonts.bodyBold},disabled:{opacity:.6},signIn:{alignItems:'center',paddingVertical:20},signInText:{color:colors.muted,fontSize:11,fontFamily:fonts.body},signInStrong:{color:colors.pinkDeep,fontFamily:fonts.bodyBold},success:{borderRadius:22,borderWidth:1,borderColor:colors.line,backgroundColor:colors.surface,padding:22,alignItems:'center'},successIcon:{width:57,height:57,borderRadius:19,backgroundColor:colors.pinkSoft,alignItems:'center',justifyContent:'center'},successTitle:{color:colors.ink,fontSize:18,fontFamily:fonts.headingBold,textAlign:'center',marginTop:14},successCopy:{color:colors.muted,fontSize:11,lineHeight:18,fontFamily:fonts.body,textAlign:'center',marginTop:8}});
