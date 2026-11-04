import { router as expoRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { AuthField } from '@/components/AuthField';
import { AuthScreen } from '@/components/AuthScreen';
import { completeWelcome } from '@/lib/first-launch';
import { supabase } from '@/lib/supabase';
import { colors, fonts } from '@/theme';

const router={replace:(href:string)=>expoRouter.replace(href as never),push:(href:string)=>expoRouter.push(href as never)};

export default function SignInScreen(){
  const[email,setEmail]=useState('');const[password,setPassword]=useState('');const[message,setMessage]=useState<string|null>(null);const[submitting,setSubmitting]=useState(false);
  async function signIn(){
    setMessage(null);
    if(!email.trim()||!password){setMessage('Enter your email address and password.');return;}
    setSubmitting(true);
    const{data,error}=await supabase.auth.signInWithPassword({email:email.trim().toLowerCase(),password});
    if(error){setSubmitting(false);setMessage(error.message);return;}
    const{data:membership}=await supabase.from('memberships').select('status').eq('user_id',data.user.id).maybeSingle();
    if(membership?.status==='verified'&&data.user.user_metadata?.membership_intent)await supabase.auth.updateUser({data:{membership_intent:false}});
    setSubmitting(false);
    completeWelcome();
    router.replace(data.user.user_metadata?.membership_intent&&membership?.status!=='verified'?'/verify-membership':'/');
  }
  return <AuthScreen eyebrow="Welcome back" title="Sign in to GWMB" description="Continue your learning, applications and community experience."><AuthField label="Email address" value={email} onChangeText={setEmail} placeholder="you@example.com" keyboardType="email-address" autoComplete="email"/><AuthField label="Password" value={password} onChangeText={setPassword} placeholder="Enter your password" password autoComplete="current-password"/><Pressable onPress={()=>router.push('/forgot-password')} style={styles.forgot}><Text style={styles.forgotText}>Forgot password?</Text></Pressable>{message?<View style={styles.message}><Text style={styles.messageText}>{message}</Text></View>:null}<Pressable disabled={submitting} onPress={()=>void signIn()} style={[styles.submit,submitting&&styles.disabled]}>{submitting?<ActivityIndicator color="white"/>:<Text style={styles.submitText}>Sign in</Text>}</Pressable><Pressable onPress={()=>router.replace('/sign-up')} style={styles.switch}><Text style={styles.switchText}>New to GWMB? <Text style={styles.switchStrong}>Create an account</Text></Text></Pressable><Pressable onPress={()=>router.replace('/member-access')} style={styles.member}><Text style={styles.memberText}>Already a member but new to the app? Verify & continue</Text></Pressable></AuthScreen>;
}

const styles=StyleSheet.create({forgot:{alignSelf:'flex-end',paddingVertical:5},forgotText:{color:colors.pinkDeep,fontSize:10,fontFamily:fonts.bodyBold},message:{borderRadius:12,backgroundColor:'#FFF0F3',padding:11,marginTop:10},messageText:{color:'#A31D43',fontSize:10,lineHeight:15,fontFamily:fonts.body},submit:{minHeight:54,borderRadius:16,backgroundColor:colors.pinkDeep,alignItems:'center',justifyContent:'center',marginTop:17},disabled:{opacity:.6},submitText:{color:'white',fontSize:13,fontFamily:fonts.bodyBold},switch:{alignItems:'center',paddingTop:20,paddingBottom:10},switchText:{color:colors.muted,fontSize:11,fontFamily:fonts.body},switchStrong:{color:colors.pinkDeep,fontFamily:fonts.bodyBold},member:{alignItems:'center',paddingVertical:10},memberText:{color:colors.pinkDeep,fontSize:10,fontFamily:fonts.bodyBold,textAlign:'center'}});
