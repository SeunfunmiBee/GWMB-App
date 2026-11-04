import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { PageHeader } from '@/components/PageHeader';
import { Screen } from '@/components/Screen';
import { mentorshipIndustries, type Mentor } from '@/data/mentorship';
import { loadMarketplaceJourney } from '@/lib/marketplace-journey';
import { loadMentors, submitMentorshipApplication } from '@/lib/mentorship-store';
import { useAuth } from '@/providers/AuthProvider';
import { colors, fonts } from '@/theme';

const stages=['Student','NYSC','Recent graduate','Early-career professional','Entrepreneur','Other'];

export default function MentorshipApplication(){
  const {user,membership}=useAuth();
  const userId=user?.id;
  const[mentors,setMentors]=useState<Mentor[]>([]);
  const[mentorId,setMentorId]=useState<string|null>(null);
  const[recommend,setRecommend]=useState(true);
  const[industry,setIndustry]=useState('Product');
  const[guidance,setGuidance]=useState('');
  const[outcome,setOutcome]=useState('');
  const[stage,setStage]=useState('Student');
  const[supporting,setSupporting]=useState('');
  const[busy,setBusy]=useState(false);
  const[done,setDone]=useState(false);

  useEffect(()=>{
    loadMentors().then((r)=>setMentors(r.mentors.filter((m)=>m.mentorship_types.includes('one_on_one'))));
    if(userId)loadMarketplaceJourney(userId).then((r)=>{
      const picked=r.journey?.interests.find((item)=>mentorshipIndustries.includes(item));
      if(picked)setIndustry(picked);
    });
  },[userId]);

  if(!userId)return <Gate icon="person-circle-outline" title="Sign in to apply" copy="Your request and updates need to stay connected to your account." action="Sign in" route="/sign-in"/>;
  if(membership?.status!=='verified')return <Gate icon="lock-closed-outline" title="One-on-one mentorship is for verified members." copy="Explore your membership benefits or verify an existing membership to continue." action="Explore Membership" route="/membership"/>;
  if(done)return <Screen><PageHeader title="Application Received"/><View style={styles.success}><View style={styles.successIcon}><Ionicons name="checkmark" size={28} color="white"/></View><Text style={styles.successTitle}>Your request has been submitted.</Text><Text style={styles.successCopy}>Status: Submitted. The GWMB team will review it and notify you about the next step.</Text><Pressable onPress={()=>router.replace('/mentorship/my')} style={styles.cta}><Text style={styles.ctaText}>View My Mentorship</Text><Ionicons name="arrow-forward" size={18} color="white"/></Pressable></View></Screen>;

  async function submit(){
    if(guidance.trim().length<10||outcome.trim().length<10){Alert.alert('Tell us a little more','Please add at least a short sentence for your guidance need and desired outcome.');return}
    setBusy(true);
    const result=await submitMentorshipApplication({user_id:userId!,requested_mentor_id:recommend?null:mentorId,assigned_mentor_id:null,recommend_for_me:recommend,industry,guidance_request:guidance.trim(),desired_outcome:outcome.trim(),career_stage:stage,supporting_information:supporting.trim()||null});
    setBusy(false);
    if(result.error){Alert.alert('Application could not be submitted',result.error.message);return}
    setDone(true);
  }

  return <Screen><PageHeader title="Mentorship application"/><View style={styles.hero}><Text style={styles.kicker}>ONE-ON-ONE MENTORSHIP</Text><Text style={styles.title}>What would you like guidance on?</Text><Text style={styles.copy}>A short, focused request helps GWMB review your application and find the right mentor.</Text></View><Text style={styles.label}>PREFERRED MENTOR</Text><Pressable onPress={()=>{setRecommend(true);setMentorId(null)}} style={[styles.choice,recommend&&styles.choiceActive]}><Ionicons name={recommend?'radio-button-on':'radio-button-off'} size={19} color={recommend?colors.pinkDeep:colors.muted}/><Text style={styles.choiceText}>Recommend a mentor for me</Text></Pressable>{mentors.map((mentor)=><Pressable key={mentor.id} onPress={()=>{setRecommend(false);setMentorId(mentor.id)}} style={[styles.choice,mentorId===mentor.id&&styles.choiceActive]}><View style={styles.avatar}><Text style={styles.avatarText}>{mentor.full_name.split(' ').map((part)=>part[0]).join('')}</Text></View><View style={styles.choiceCopy}><Text style={styles.choiceText}>{mentor.full_name}</Text><Text style={styles.choiceMeta}>{mentor.job_title} · {mentor.industry}</Text></View><Ionicons name={mentorId===mentor.id?'radio-button-on':'radio-button-off'} size={19} color={mentorId===mentor.id?colors.pinkDeep:colors.muted}/></Pressable>)}<Text style={styles.label}>CAREER OR INDUSTRY</Text><ChoiceList items={mentorshipIndustries} selected={industry} onSelect={setIndustry}/><Text style={styles.label}>WHAT DO YOU NEED GUIDANCE ON?</Text><TextInput value={guidance} onChangeText={setGuidance} placeholder="Describe the decision, question or challenge" placeholderTextColor={colors.muted} multiline style={[styles.input,styles.notes]}/><Text style={styles.label}>WHAT ARE YOU HOPING TO ACHIEVE?</Text><TextInput value={outcome} onChangeText={setOutcome} placeholder="What would a useful outcome look like?" placeholderTextColor={colors.muted} multiline style={[styles.input,styles.notes]}/><Text style={styles.label}>CURRENT CAREER STAGE</Text><ChoiceList items={stages} selected={stage} onSelect={setStage}/><Text style={styles.label}>OPTIONAL SUPPORTING LINK OR INFORMATION</Text><TextInput value={supporting} onChangeText={setSupporting} placeholder="Portfolio, LinkedIn or relevant context" placeholderTextColor={colors.muted} style={styles.input}/><Pressable disabled={busy} onPress={submit} style={styles.cta}>{busy?<ActivityIndicator color="white"/>:<><Text style={styles.ctaText}>Submit application</Text><Ionicons name="arrow-forward" size={18} color="white"/></>}</Pressable><Text style={styles.note}>Applications are reviewed for fit and mentor availability. Membership does not guarantee approval.</Text></Screen>;
}

function ChoiceList({items,selected,onSelect}:{items:readonly string[];selected:string;onSelect:(item:string)=>void}){return <View style={styles.wrap}>{items.map((item)=><Pressable key={item} onPress={()=>onSelect(item)} style={[styles.pill,selected===item&&styles.pillActive]}><Text style={[styles.pillText,selected===item&&styles.pillTextActive]}>{item}</Text></Pressable>)}</View>}
function Gate({icon,title,copy,action,route}:{icon:'person-circle-outline'|'lock-closed-outline';title:string;copy:string;action:string;route:'/sign-in'|'/membership'}){return <Screen><PageHeader title="Mentorship application"/><View style={styles.gate}><Ionicons name={icon} size={30} color={colors.pinkDeep}/><Text style={styles.gateTitle}>{title}</Text><Text style={styles.gateCopy}>{copy}</Text><Pressable onPress={()=>router.push(route)} style={styles.cta}><Text style={styles.ctaText}>{action}</Text></Pressable></View></Screen>}

const styles=StyleSheet.create({hero:{borderRadius:24,backgroundColor:colors.ink,padding:21},kicker:{color:'#F4A2C8',fontSize:9,fontFamily:fonts.bodyBold,letterSpacing:1},title:{color:'white',fontSize:25,lineHeight:29,fontFamily:fonts.heading,marginTop:8},copy:{color:'#D2CBD0',fontSize:11,lineHeight:17,fontFamily:fonts.body,marginTop:7},label:{color:colors.ink,fontSize:9,fontFamily:fonts.bodyBold,letterSpacing:.7,marginTop:20,marginBottom:8},choice:{minHeight:62,borderRadius:17,borderWidth:1,borderColor:colors.line,backgroundColor:colors.surface,padding:12,flexDirection:'row',alignItems:'center',gap:10,marginBottom:8},choiceActive:{borderColor:colors.pink,backgroundColor:colors.pinkSoft},choiceCopy:{flex:1},choiceText:{color:colors.ink,fontSize:11,fontFamily:fonts.bodyBold},choiceMeta:{color:colors.muted,fontSize:9,fontFamily:fonts.body,marginTop:3},avatar:{width:38,height:38,borderRadius:13,backgroundColor:colors.ink,alignItems:'center',justifyContent:'center'},avatarText:{color:'white',fontSize:10,fontFamily:fonts.heading},wrap:{flexDirection:'row',flexWrap:'wrap',gap:7},pill:{minHeight:37,borderRadius:999,borderWidth:1,borderColor:colors.line,backgroundColor:colors.surface,paddingHorizontal:12,alignItems:'center',justifyContent:'center'},pillActive:{backgroundColor:colors.ink,borderColor:colors.ink},pillText:{color:colors.muted,fontSize:9,fontFamily:fonts.bodyBold},pillTextActive:{color:'white'},input:{height:53,borderRadius:16,borderWidth:1,borderColor:colors.line,backgroundColor:colors.surface,paddingHorizontal:14,fontSize:11,fontFamily:fonts.body,color:colors.ink},notes:{height:98,paddingTop:14,textAlignVertical:'top'},cta:{minHeight:55,borderRadius:17,backgroundColor:colors.pinkDeep,paddingHorizontal:17,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:9,marginTop:22},ctaText:{color:'white',fontSize:12,fontFamily:fonts.bodyBold},note:{color:colors.muted,fontSize:9,lineHeight:14,fontFamily:fonts.body,textAlign:'center',marginTop:12},gate:{borderRadius:24,borderWidth:1,borderColor:colors.line,backgroundColor:colors.surface,padding:24,alignItems:'center'},gateTitle:{color:colors.ink,fontSize:19,lineHeight:24,fontFamily:fonts.headingBold,textAlign:'center',marginTop:12},gateCopy:{color:colors.muted,fontSize:11,lineHeight:17,fontFamily:fonts.body,textAlign:'center',marginTop:7},success:{borderRadius:25,backgroundColor:colors.pinkSoft,padding:25,alignItems:'center'},successIcon:{width:56,height:56,borderRadius:20,backgroundColor:colors.pinkDeep,alignItems:'center',justifyContent:'center'},successTitle:{color:colors.ink,fontSize:21,lineHeight:26,fontFamily:fonts.headingBold,textAlign:'center',marginTop:15},successCopy:{color:colors.muted,fontSize:11,lineHeight:18,fontFamily:fonts.body,textAlign:'center',marginTop:8}});
