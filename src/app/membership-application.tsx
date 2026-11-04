import { Ionicons } from '@expo/vector-icons';
import * as WebBrowser from 'expo-web-browser';
import { router as expoRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { AuthField } from '@/components/AuthField';
import { PageHeader } from '@/components/PageHeader';
import { Screen } from '@/components/Screen';
import { loadMembershipApplication, submitMembershipApplication } from '@/lib/account';
import { useAuth } from '@/providers/AuthProvider';
import { colors, fonts } from '@/theme';
import type { MembershipApplication as MembershipApplicationRecord } from '@/types/database';
import { firstValidationError, validators, type ValidationErrors } from '@/lib/validation';
import { ScreenSkeleton } from '@/components/states/Skeleton';

const applicationUrl = 'https://www.girlswhomeanbusiness.org/join';
const router = { replace: (href: string) => expoRouter.replace(href as never) };
const statusCopy = {
  draft: ['Application started', 'Complete your application when you are ready.'],
  submitted: ['Application received', 'The GWMB team will review your application.'],
  under_review: ['Application under review', 'Your application is currently being reviewed by the GWMB team.'],
  approved: ['Application approved', 'Your membership access will unlock after your membership record is verified.'],
  rejected: ['Application update', 'The GWMB team could not approve this application. Contact support if you need clarification.'],
} as const;

export default function MembershipApplication() {
  const { user, profile, membership, refreshAccount } = useAuth();
  const [application, setApplication] = useState<MembershipApplicationRecord | null>(null);
  const [loading, setLoading] = useState(Boolean(user));
  const [submitting, setSubmitting] = useState(false);
  const [name, setName] = useState(profile?.full_name ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [phone, setPhone] = useState('');
  const [city, setCity] = useState(profile?.city_club ?? '');
  const [occupation, setOccupation] = useState('');
  const [motivation, setMotivation] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [errors,setErrors]=useState<ValidationErrors<'name'|'email'|'phone'|'city'|'occupation'|'motivation'>>({});

  useEffect(() => {
    if (!user) return;
    loadMembershipApplication(user.id).then((record) => {
      setApplication(record); setName((value) => value || profile?.full_name || ''); setEmail((value) => value || user.email || ''); setCity((value) => value || profile?.city_club || ''); setLoading(false);
    }).catch((error: Error) => { setMessage(error.message); setLoading(false); });
  }, [profile?.city_club, profile?.full_name, user]);

  async function submit() {
    setMessage(null);
    if (!user) { router.replace('/sign-in'); return; }
    const nextErrors={name:validators.min(name,2,'Full name'),email:validators.email(email),phone:validators.min(phone,7,'Phone number'),city:validators.min(city,2,'City'),occupation:validators.min(occupation,2,'Occupation or stage'),motivation:validators.min(motivation,30,'Reason for joining')};
    setErrors(Object.fromEntries(Object.entries(nextErrors).filter(([,value])=>value)) as typeof errors);
    const invalid=firstValidationError(nextErrors);if(invalid){setMessage('Check the highlighted fields and try again.');return;}
    setSubmitting(true);
    try {
      const record = await submitMembershipApplication({ userId:user.id, fullName:name.trim(), email:email.trim().toLowerCase(), phone:phone.trim(), city:city.trim(), occupation:occupation.trim(), motivation:motivation.trim() });
      setApplication(record); await refreshAccount();
    } catch (error) { setMessage(error instanceof Error ? error.message : 'We could not submit your application.'); }
    finally { setSubmitting(false); }
  }

  if (!user) return <Screen><PageHeader title="Membership application"/><View style={styles.gate}><View style={styles.gateIcon}><Ionicons name="person-outline" size={29} color={colors.pinkDeep}/></View><Text style={styles.gateTitle}>Create or sign in to your account</Text><Text style={styles.gateCopy}>Your application status needs to stay securely connected to your GWMB account.</Text><Pressable onPress={() => router.replace('/sign-in')} style={styles.primary}><Text style={styles.primaryText}>Sign in to continue</Text><Ionicons name="arrow-forward" size={18} color="white"/></Pressable></View></Screen>;
  if (loading) return <Screen><ScreenSkeleton rows={3}/></Screen>;
  if (membership?.status === 'verified') return <Screen><PageHeader title="My Membership"/><View style={styles.success}><View style={styles.successIcon}><Ionicons name="checkmark" size={30} color="white"/></View><Text style={styles.successKicker}>VERIFIED MEMBER</Text><Text style={styles.successTitle}>Your full GWMB experience is active.</Text><Text style={styles.successCopy}>Members-only learning, events, mentorship and opportunities are available to you.</Text></View></Screen>;
  if (application) { const copy = statusCopy[application.status]; return <Screen><PageHeader title="My application"/><View style={styles.statusHero}><View style={styles.statusIcon}><Ionicons name={application.status === 'rejected' ? 'information' : 'hourglass-outline'} size={26} color="white"/></View><Text style={styles.statusKicker}>{application.status.replace('_',' ').toUpperCase()}</Text><Text style={styles.statusTitle}>{copy[0]}</Text><Text style={styles.statusCopy}>{copy[1]}</Text></View><View style={styles.timeline}><View style={styles.timelinePoint}/><View style={styles.timelineCopy}><Text style={styles.timelineTitle}>Submitted to GWMB</Text><Text style={styles.timelineText}>{new Date(application.submitted_at).toLocaleDateString()}</Text></View></View><View style={styles.note}><Ionicons name="shield-checkmark-outline" size={20} color={colors.pinkDeep}/><Text style={styles.noteText}>Submitting an application does not automatically unlock membership. Access changes only after GWMB verifies your membership record.</Text></View></Screen>; }

  return <Screen><PageHeader title="Membership application"/><View style={styles.hero}><Ionicons name="sparkles-outline" size={30} color="white"/><Text style={styles.heroTitle}>Apply to join GWMB</Text><Text style={styles.heroCopy}>Tell us a little about yourself and why you want to become part of the club.</Text></View><View style={styles.form}><AuthField label="Full name" error={errors.name} value={name} onChangeText={value=>{setName(value);setErrors(current=>({...current,name:undefined}))}} placeholder="Your full name" autoCapitalize="words"/><AuthField label="Email address" error={errors.email} value={email} onChangeText={value=>{setEmail(value);setErrors(current=>({...current,email:undefined}))}} placeholder="you@example.com" keyboardType="email-address"/><AuthField label="Phone number" error={errors.phone} value={phone} onChangeText={value=>{setPhone(value);setErrors(current=>({...current,phone:undefined}))}} placeholder="Your active phone number" keyboardType="phone-pad"/><AuthField label="City" error={errors.city} value={city} onChangeText={value=>{setCity(value);setErrors(current=>({...current,city:undefined}))}} placeholder="e.g. Lagos" autoCapitalize="words"/><AuthField label="Current occupation or stage" error={errors.occupation} value={occupation} onChangeText={value=>{setOccupation(value);setErrors(current=>({...current,occupation:undefined}))}} placeholder="e.g. Student, graduate, designer" autoCapitalize="sentences"/><Text style={styles.label}>WHY DO YOU WANT TO JOIN GWMB?</Text><TextInput value={motivation} onChangeText={value=>{setMotivation(value);setErrors(current=>({...current,motivation:undefined}))}} placeholder="Tell us what you hope to gain and contribute" placeholderTextColor="#A59FA3" multiline maxLength={1500} textAlignVertical="top" style={[styles.textarea,errors.motivation&&styles.textareaError]}/>{errors.motivation?<Text style={styles.fieldError}>{errors.motivation}</Text>:null}<Text style={styles.counter}>{motivation.length}/1500</Text></View>{message ? <View accessibilityRole="alert" style={styles.error}><Text style={styles.errorText}>{message}</Text></View> : null}<Pressable disabled={submitting} onPress={submit} style={[styles.primary,submitting&&styles.disabled]}>{submitting ? <ActivityIndicator color="white"/> : <><Text style={styles.primaryText}>Submit membership application</Text><Ionicons name="arrow-forward" size={18} color="white"/></>}</Pressable><View style={styles.note}><Ionicons name="information-circle-outline" size={20} color={colors.pinkDeep}/><Text style={styles.noteText}>Submitting does not automatically unlock member access. The GWMB team must review and verify your membership.</Text></View><Pressable onPress={() => WebBrowser.openBrowserAsync(applicationUrl)} style={styles.secondary}><Text style={styles.secondaryText}>View membership information in app</Text></Pressable><Pressable onPress={() => Linking.openURL(applicationUrl)} style={styles.website}><Text style={styles.websiteText}>Open GWMB website ↗</Text></Pressable></Screen>;
}

const styles=StyleSheet.create({loading:{flex:1,alignItems:'center',justifyContent:'center'},hero:{minHeight:205,borderRadius:24,backgroundColor:colors.ink,padding:22,justifyContent:'flex-end'},heroTitle:{color:'white',fontSize:25,fontFamily:fonts.heading,marginTop:15},heroCopy:{color:'#D6CFD3',fontSize:11,lineHeight:17,fontFamily:fonts.body,marginTop:7},form:{marginTop:18,borderRadius:21,borderWidth:1,borderColor:colors.line,backgroundColor:colors.surface,padding:15},label:{color:colors.ink,fontSize:9,fontFamily:fonts.bodyBold,letterSpacing:.7,marginTop:8,marginBottom:7},textarea:{height:120,borderRadius:16,borderWidth:1,borderColor:colors.line,backgroundColor:colors.canvas,padding:14,color:colors.ink,fontSize:11,fontFamily:fonts.body},textareaError:{borderColor:'#D33A61'},fieldError:{color:'#B62249',fontSize:9,fontFamily:fonts.bodyMedium,marginTop:5},counter:{color:colors.muted,fontSize:9,fontFamily:fonts.body,textAlign:'right',marginTop:5},note:{borderRadius:18,backgroundColor:colors.pinkSoft,padding:15,flexDirection:'row',gap:10,marginTop:12},noteText:{flex:1,color:colors.muted,fontSize:9,lineHeight:15,fontFamily:fonts.body},primary:{minHeight:54,borderRadius:16,backgroundColor:colors.pinkDeep,paddingHorizontal:16,flexDirection:'row',alignItems:'center',justifyContent:'space-between',marginTop:15},primaryText:{color:'white',fontSize:11,fontFamily:fonts.bodyBold},disabled:{opacity:.65},secondary:{height:50,borderRadius:16,borderWidth:1,borderColor:colors.line,alignItems:'center',justifyContent:'center',marginTop:12},secondaryText:{color:colors.ink,fontSize:10,fontFamily:fonts.bodyBold},website:{height:42,alignItems:'center',justifyContent:'center'},websiteText:{color:colors.pinkDeep,fontSize:9,fontFamily:fonts.bodyBold},error:{borderRadius:14,backgroundColor:'#FFF0F3',padding:12,marginTop:12},errorText:{color:'#A41449',fontSize:9,lineHeight:14,fontFamily:fonts.bodyMedium},gate:{marginTop:30,borderRadius:24,borderWidth:1,borderColor:colors.line,backgroundColor:colors.surface,padding:22,alignItems:'center'},gateIcon:{width:64,height:64,borderRadius:22,backgroundColor:colors.pinkSoft,alignItems:'center',justifyContent:'center'},gateTitle:{color:colors.ink,fontSize:20,fontFamily:fonts.heading,textAlign:'center',marginTop:17},gateCopy:{color:colors.muted,fontSize:10,lineHeight:16,fontFamily:fonts.body,textAlign:'center',marginTop:7},statusHero:{borderRadius:24,backgroundColor:colors.ink,padding:22},statusIcon:{width:50,height:50,borderRadius:17,backgroundColor:colors.pink,alignItems:'center',justifyContent:'center'},statusKicker:{color:'#F5A4CA',fontSize:9,fontFamily:fonts.bodyBold,letterSpacing:1,marginTop:22},statusTitle:{color:'white',fontSize:25,lineHeight:29,fontFamily:fonts.heading,marginTop:7},statusCopy:{color:'#D6CFD3',fontSize:10,lineHeight:17,fontFamily:fonts.body,marginTop:7},timeline:{borderRadius:18,borderWidth:1,borderColor:colors.line,backgroundColor:colors.surface,padding:15,flexDirection:'row',alignItems:'center',marginTop:14},timelinePoint:{width:12,height:12,borderRadius:6,backgroundColor:colors.pinkDeep},timelineCopy:{paddingLeft:11},timelineTitle:{color:colors.ink,fontSize:11,fontFamily:fonts.headingBold},timelineText:{color:colors.muted,fontSize:9,fontFamily:fonts.body,marginTop:3},success:{borderRadius:25,backgroundColor:colors.ink,padding:24},successIcon:{width:56,height:56,borderRadius:19,backgroundColor:'#087553',alignItems:'center',justifyContent:'center'},successKicker:{color:'#A8E8D2',fontSize:9,fontFamily:fonts.bodyBold,letterSpacing:1,marginTop:24},successTitle:{color:'white',fontSize:25,lineHeight:29,fontFamily:fonts.heading,marginTop:7},successCopy:{color:'#D6CFD3',fontSize:10,lineHeight:17,fontFamily:fonts.body,marginTop:7}});
