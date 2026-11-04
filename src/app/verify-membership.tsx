import { Ionicons } from '@expo/vector-icons';
import { router as expoRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { AuthField } from '@/components/AuthField';
import { PageHeader } from '@/components/PageHeader';
import { Screen } from '@/components/Screen';
import { loadMyMembershipDetails, loadVerificationRequest, requestMembershipLink, sendMembershipEmailCode, verifyMembershipEmailCode, type MembershipLinkResult } from '@/lib/account';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/AuthProvider';
import { colors, fonts } from '@/theme';
import type { MembershipDetails, MembershipVerificationRequest } from '@/types/database';
import { ScreenSkeleton } from '@/components/states/Skeleton';
import { validators, type ValidationErrors } from '@/lib/validation';

const router={replace:(href:string)=>expoRouter.replace(href as never),push:(href:string)=>expoRouter.push(href as never)};

export default function VerifyMembership(){
  const{user,membership,refreshAccount}=useAuth();
  const[request,setRequest]=useState<MembershipVerificationRequest|null>(null);
  const[details,setDetails]=useState<MembershipDetails|null>(null);
  const[email,setEmail]=useState(String(user?.user_metadata?.membership_email??user?.email??''));
  const[memberId,setMemberId]=useState(String(user?.user_metadata?.member_identifier??''));
  const[chapter,setChapter]=useState(String(user?.user_metadata?.chapter??''));
  const[loading,setLoading]=useState(Boolean(user));
  const[submitting,setSubmitting]=useState(false);
  const[message,setMessage]=useState<string|null>(null);
  const[result,setResult]=useState<MembershipLinkResult|null>(null);
  const[otpCode,setOtpCode]=useState('');
  const[otpSent,setOtpSent]=useState(false);
  const[rechecking,setRechecking]=useState(false);
  const autoRechecked=useRef(false);
  const[errors,setErrors]=useState<ValidationErrors<'email'|'memberId'|'chapter'|'code'>>({});

  useEffect(()=>{if(!user)return;Promise.all([loadVerificationRequest(user.id),loadMyMembershipDetails()]).then(([record,memberDetails])=>{setRequest(record);setDetails(memberDetails);setEmail(record?.membership_email||String(user.user_metadata?.membership_email??user.email??''));setMemberId(record?.member_identifier||String(user.user_metadata?.member_identifier??''));setChapter(record?.chapter||String(user.user_metadata?.chapter??''));setLoading(false)}).catch((error:Error)=>{setMessage(error.message);setLoading(false)})},[user]);

  useEffect(()=>{
    if(loading||!user||!request||request.status!=='needs_review'||!request.member_identifier||autoRechecked.current)return;
    autoRechecked.current=true;setRechecking(true);setMessage(null);
    requestMembershipLink({email:request.membership_email,memberIdentifier:request.member_identifier,chapter:request.chapter??''}).then(async response=>{
      setResult(response);
      if(response.result==='email_confirmation_required'){const sent=await sendMembershipEmailCode();setOtpSent(true);setMessage(sent.message)}
      await refreshAccount();const[record,memberDetails]=await Promise.all([loadVerificationRequest(user.id),loadMyMembershipDetails()]);setRequest(record);setDetails(memberDetails);
      if(response.result==='verified')await supabase.auth.updateUser({data:{membership_intent:false}});
    }).catch(error=>setMessage(error instanceof Error?error.message:'We could not check the official member record again.')).finally(()=>setRechecking(false));
  },[loading,request,refreshAccount,user]);

  async function submit(){
    setMessage(null);if(!user){router.replace('/sign-in');return;}
    const nextErrors={email:validators.email(email),memberId:validators.min(memberId,4,'GWMB Member ID'),chapter:validators.required(chapter,'Chapter')};setErrors(Object.fromEntries(Object.entries(nextErrors).filter(([,value])=>value)) as typeof errors);if(Object.values(nextErrors).some(Boolean)){setMessage('Check the highlighted details and try again.');return;}
    setSubmitting(true);
    try{
      const response=await requestMembershipLink({email,memberIdentifier:memberId,chapter});setResult(response);
      if(response.result==='email_confirmation_required'){
        const sent=await sendMembershipEmailCode();setOtpSent(true);setMessage(sent.message);
      }
      await refreshAccount();
      const[record,memberDetails]=await Promise.all([loadVerificationRequest(user.id),loadMyMembershipDetails()]);setRequest(record);setDetails(memberDetails);
      if(response.result==='verified')await supabase.auth.updateUser({data:{membership_intent:false}});
    }catch(error){setMessage(error instanceof Error?error.message:'We could not verify this membership.')}finally{setSubmitting(false)}
  }

  async function confirmCode(){
    if(otpCode.trim().length!==6){setErrors(current=>({...current,code:'Enter the complete 6-digit code.'}));setMessage('Check the verification code and try again.');return;}
    setSubmitting(true);setMessage(null);
    try{const response=await verifyMembershipEmailCode(otpCode);setMessage(response.message);await supabase.auth.updateUser({data:{membership_intent:false}});await refreshAccount();setDetails(await loadMyMembershipDetails())}
    catch(error){setMessage(error instanceof Error?error.message:'That verification code could not be confirmed.')}
    finally{setSubmitting(false)}
  }

  async function resendCode(){setSubmitting(true);setMessage(null);try{const response=await sendMembershipEmailCode();setMessage(response.message);setOtpSent(true)}catch(error){setMessage(error instanceof Error?error.message:'A new code could not be sent.')}finally{setSubmitting(false)}}

  if(!user)return <Screen><PageHeader title="Verify Membership"/><View style={styles.gate}><Ionicons name="person-outline" size={30} color={colors.pinkDeep}/><Text style={styles.gateTitle}>Use your existing app account</Text><Text style={styles.gateCopy}>Sign in first so membership can be added to the same account without losing your courses, applications or activity.</Text><Pressable onPress={()=>router.replace('/sign-in')} style={styles.cta}><Text style={styles.ctaText}>Sign in</Text></Pressable></View></Screen>;
  if(loading)return <Screen><ScreenSkeleton rows={3}/></Screen>;
  if(membership?.status==='verified')return <Screen><PageHeader title="My Membership"/><View style={styles.verified}><View style={styles.verifiedIcon}><Ionicons name="checkmark" size={30} color="white"/></View><Text style={styles.verifiedKicker}>MEMBERSHIP VERIFIED</Text><Text style={styles.verifiedTitle}>Welcome to the GWMB app.</Text><Text style={styles.verifiedCopy}>Your membership has been successfully linked. Members-only access will load automatically whenever you sign in.</Text></View>{details?<View style={styles.details}><Detail label="GWMB MEMBER ID" value={details.member_identifier}/><Detail label="CHAPTER" value={details.chapter||'Not specified'}/><Detail label="MEMBERSHIP STATUS" value={details.record_status}/><Detail label="DUES STATUS" value={details.dues_status}/></View>:null}<Pressable onPress={()=>router.replace('/membership')} style={styles.cta}><Text style={styles.ctaText}>Explore member benefits</Text><Ionicons name="arrow-forward" size={18} color="white"/></Pressable></Screen>;

  if(result||request&&request.status!=='rejected'){
    const alreadyLinked=result?.result==='already_linked';const needsReview=result?.result==='needs_review'||request?.status==='needs_review';
    return <Screen><PageHeader title="Verification status"/>{rechecking?<View style={styles.rechecking}><ActivityIndicator color={colors.ink}/><View style={{flex:1}}><Text style={styles.recheckingTitle}>Checking the latest member records</Text><Text style={styles.recheckingCopy}>This page updates automatically when an administrator adds your record.</Text></View></View>:<View style={[styles.statusCard,alreadyLinked&&styles.statusError]}><View style={styles.statusTop}><View style={[styles.statusIcon,alreadyLinked&&styles.statusIconError]}><Ionicons name={alreadyLinked?'alert-circle-outline':needsReview?'search-outline':'mail-outline'} size={22} color="white"/></View><View style={styles.statusHeading}><Text style={styles.statusKicker}>{alreadyLinked?'ACCOUNT RECOVERY':needsReview?'MANUAL REVIEW':'EMAIL CHECK'}</Text><Text style={styles.statusTitle}>{alreadyLinked?'Already linked':needsReview?'Review needed':'Details matched'}</Text></View></View><Text style={styles.statusCopy}>{result?.message||request?.review_note||'GWMB is reviewing your membership details.'}</Text></View>}<Text style={styles.summaryTitle}>Submitted details</Text><View style={styles.summary}><Detail label="MEMBERSHIP EMAIL" value={request?.membership_email||email}/><Detail label="MEMBER ID" value={request?.member_identifier||memberId}/><Detail label="CHAPTER" value={request?.chapter||chapter}/></View>{otpSent?<View style={otpStyles.card}><Text style={otpStyles.title}>Enter your email code</Text><Text style={otpStyles.copy}>The 6-digit code expires in 10 minutes.</Text><AuthField label="Verification code" error={errors.code} value={otpCode} onChangeText={value=>{setOtpCode(value.replace(/\D/g,''));setErrors(current=>({...current,code:undefined}))}} placeholder="000000" keyboardType="number-pad" maxLength={6}/>{message?<Text style={otpStyles.message}>{message}</Text>:null}<Pressable disabled={submitting} onPress={()=>void confirmCode()} style={[styles.cta,submitting&&styles.disabled]}>{submitting?<ActivityIndicator color="white"/>:<Text style={styles.ctaText}>Confirm & Link Membership</Text>}</Pressable><Pressable disabled={submitting} onPress={()=>void resendCode()} style={styles.support}><Text style={styles.supportText}>Send a new code</Text></Pressable></View>:null}{!otpSent&&!rechecking?<><Pressable disabled={submitting} onPress={()=>void submit()} style={styles.secondary}><Text style={styles.secondaryText}>Check official records again</Text></Pressable><Pressable onPress={()=>{setResult(null);setRequest(null)}} style={styles.support}><Text style={styles.supportText}>Edit submitted details</Text></Pressable></>:null}<Pressable onPress={()=>router.push('/help')} style={styles.support}><Text style={styles.supportText}>{needsReview?'Contact membership support':'Recover Account / Membership Support'}</Text></Pressable></Screen>;
  }

  return <Screen><PageHeader title="Verify Membership"/><Text style={styles.title}>{request?.status==='rejected'?'Update your membership details':'Link membership to this account'}</Text><Text style={styles.copy}>Use the Member ID and email registered in the official GWMB membership database. Your app-account email may be different.</Text>{request?.review_note?<View style={styles.reviewNote}><Text style={styles.reviewLabel}>GWMB REVIEW NOTE</Text><Text style={styles.reviewText}>{request.review_note}</Text></View>:null}<View style={styles.form}><AuthField label="Membership email" error={errors.email} value={email} onChangeText={value=>{setEmail(value);setErrors(current=>({...current,email:undefined}))}} placeholder="Email registered with GWMB" keyboardType="email-address"/><AuthField label="GWMB Member ID" error={errors.memberId} value={memberId} onChangeText={value=>{setMemberId(value);setErrors(current=>({...current,memberId:undefined}))}} placeholder="e.g. GWMB-2026-0012" autoCapitalize="characters"/><AuthField label="Chapter" error={errors.chapter} value={chapter} onChangeText={value=>{setChapter(value);setErrors(current=>({...current,chapter:undefined}))}} placeholder="e.g. Lagos City Club" autoCapitalize="words"/></View><View style={styles.note}><Ionicons name="shield-checkmark-outline" size={19} color={colors.pinkDeep}/><Text style={styles.noteText}>One Member ID can be linked to only one app account. Your current app activity and profile will remain unchanged.</Text></View>{message?<View accessibilityRole="alert" style={styles.error}><Text style={styles.errorText}>{message}</Text></View>:null}<Pressable disabled={submitting} onPress={()=>void submit()} style={[styles.cta,submitting&&styles.disabled]}>{submitting?<ActivityIndicator color="white"/>:<><Text style={styles.ctaText}>Verify My Membership</Text><Ionicons name="arrow-forward" size={18} color="white"/></>}</Pressable><Pressable onPress={()=>router.push('/help')} style={styles.support}><Text style={styles.supportText}>Request Membership Support</Text></Pressable></Screen>;
}

const otpStyles=StyleSheet.create({card:{borderRadius:20,borderWidth:1,borderColor:colors.line,backgroundColor:colors.surface,padding:16,marginTop:14},title:{color:colors.ink,fontSize:16,fontFamily:fonts.headingBold},copy:{color:colors.muted,fontSize:10,lineHeight:16,fontFamily:fonts.body,marginTop:5,marginBottom:7},message:{color:colors.pinkDeep,fontSize:9,lineHeight:14,fontFamily:fonts.bodyMedium,marginTop:5}});

function Detail({label,value}:{label:string;value:string}){return <View style={styles.detail}><Text style={styles.detailLabel}>{label}</Text><Text style={styles.detailValue}>{value}</Text></View>}

const styles=StyleSheet.create({loading:{flex:1,alignItems:'center',justifyContent:'center'},title:{color:colors.ink,fontSize:24,lineHeight:29,fontFamily:fonts.heading,marginTop:8},copy:{color:colors.muted,fontSize:11,lineHeight:18,fontFamily:fonts.body,marginTop:8},form:{marginTop:20,borderRadius:18,borderWidth:1,borderColor:'#DEDADD',backgroundColor:'#F7F6F7',padding:15},note:{borderRadius:15,backgroundColor:'#F2F0F2',padding:14,flexDirection:'row',gap:9,alignItems:'center',marginTop:13},noteText:{color:colors.muted,fontSize:9.5,lineHeight:15,fontFamily:fonts.body,flex:1},cta:{minHeight:53,borderRadius:14,backgroundColor:colors.ink,paddingHorizontal:17,flexDirection:'row',alignItems:'center',justifyContent:'space-between',marginTop:14},disabled:{opacity:.65},ctaText:{color:'white',fontSize:11,fontFamily:fonts.bodyBold},secondary:{minHeight:50,borderRadius:14,borderWidth:1,borderColor:'#DCD8DB',backgroundColor:colors.surface,alignItems:'center',justifyContent:'center',marginTop:14},secondaryText:{color:colors.ink,fontSize:11,fontFamily:fonts.bodyBold},support:{alignItems:'center',paddingVertical:18},supportText:{color:colors.ink,fontSize:10,fontFamily:fonts.bodyBold},error:{borderRadius:14,backgroundColor:'#FFF0F3',padding:12,marginTop:12},errorText:{color:'#A41449',fontSize:9,lineHeight:14,fontFamily:fonts.bodyMedium},reviewNote:{borderRadius:16,backgroundColor:'#FFF3DA',padding:14,marginTop:14},reviewLabel:{color:'#875B00',fontSize:9,fontFamily:fonts.bodyBold,letterSpacing:.8},reviewText:{color:'#6A5424',fontSize:9,lineHeight:15,fontFamily:fonts.body,marginTop:5},gate:{borderRadius:20,borderWidth:1,borderColor:colors.line,backgroundColor:colors.surface,padding:23,alignItems:'center',marginTop:30},gateTitle:{color:colors.ink,fontSize:20,fontFamily:fonts.heading,textAlign:'center',marginTop:16},gateCopy:{color:colors.muted,fontSize:10,lineHeight:16,fontFamily:fonts.body,textAlign:'center',marginTop:7},rechecking:{minHeight:92,borderRadius:18,borderWidth:1,borderColor:'#DEDADD',backgroundColor:'#F5F4F5',padding:17,flexDirection:'row',alignItems:'center',gap:13},recheckingTitle:{color:colors.ink,fontSize:13,fontFamily:fonts.headingBold},recheckingCopy:{color:colors.muted,fontSize:9,lineHeight:14,fontFamily:fonts.body,marginTop:4},statusCard:{borderRadius:18,borderWidth:1,borderColor:'#DEDADD',backgroundColor:'#F5F4F5',padding:17},statusError:{backgroundColor:'#FFF3F6',borderColor:'#EEC8D5'},statusTop:{flexDirection:'row',alignItems:'center',gap:11},statusHeading:{flex:1},statusIcon:{width:45,height:45,borderRadius:14,backgroundColor:colors.ink,alignItems:'center',justifyContent:'center'},statusIconError:{backgroundColor:'#A9184D'},statusKicker:{color:'#6D686C',fontSize:8,fontFamily:fonts.bodyBold,letterSpacing:.9},statusTitle:{color:colors.ink,fontSize:18,lineHeight:22,fontFamily:fonts.headingBold,marginTop:3},statusCopy:{color:colors.muted,fontSize:10,lineHeight:16,fontFamily:fonts.body,marginTop:13},summaryTitle:{color:colors.ink,fontSize:17,fontFamily:fonts.headingBold,marginTop:22},summary:{borderRadius:17,borderWidth:1,borderColor:'#DEDADD',backgroundColor:colors.surface,paddingHorizontal:15,marginTop:9},details:{borderRadius:17,borderWidth:1,borderColor:'#DEDADD',backgroundColor:colors.surface,paddingHorizontal:15,marginTop:13},detail:{paddingVertical:14,borderBottomWidth:1,borderBottomColor:'#ECEAEC'},detailLabel:{color:'#767075',fontSize:8,fontFamily:fonts.bodyBold,letterSpacing:.75},detailValue:{color:colors.ink,fontSize:13,fontFamily:fonts.bodyBold,marginTop:5},verified:{borderRadius:20,backgroundColor:colors.ink,padding:22},verifiedIcon:{width:52,height:52,borderRadius:16,backgroundColor:'#087553',alignItems:'center',justifyContent:'center'},verifiedKicker:{color:'#A8E8D2',fontSize:9,fontFamily:fonts.bodyBold,letterSpacing:1,marginTop:20},verifiedTitle:{color:'white',fontSize:24,lineHeight:29,fontFamily:fonts.heading,marginTop:7},verifiedCopy:{color:'#D6CFD3',fontSize:10,lineHeight:17,fontFamily:fonts.body,marginTop:7}});
