import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { PageHeader } from '@/components/PageHeader';
import { Screen } from '@/components/Screen';
import { careerStages, interestGroups, journeyGoals, loadMarketplaceJourney, saveMarketplaceJourney, type CareerStage, type JourneyGoal } from '@/lib/marketplace-journey';
import { useAuth } from '@/providers/AuthProvider';
import { colors, fonts } from '@/theme';

export default function MarketplaceJourneyScreen() {
  const { user } = useAuth();
  const [step, setStep] = useState(0);
  const [goal, setGoal] = useState<JourneyGoal | null>(null);
  const [stage, setStage] = useState<CareerStage | null>(null);
  const [interests, setInterests] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    loadMarketplaceJourney(user.id).then(({ journey }) => {
      if (!journey) return;
      setGoal(journey.primary_goal);
      setStage(journey.career_stage);
      setInterests(journey.interests);
    });
  }, [user]);

  const canContinue = step === 0 ? Boolean(goal) : step === 1 ? Boolean(stage) : interests.length > 0;

  function toggleInterest(interest: string) {
    setMessage(null);
    setInterests((current) => {
      if (current.includes(interest)) return current.filter((item) => item !== interest);
      if (current.length >= 5) { setMessage('Choose up to five interests so your recommendations stay useful.'); return current; }
      return [...current, interest];
    });
  }

  async function continueJourney() {
    setMessage(null);
    if (!canContinue) { setMessage(step === 2 ? 'Choose at least one interest.' : 'Choose one option to continue.'); return; }
    if (step < 2) { setStep((current) => current + 1); return; }
    if (!user || !goal || !stage) { router.push('/sign-in'); return; }
    setSaving(true);
    await saveMarketplaceJourney({ userId: user.id, goal, stage, interests });
    setSaving(false);
    router.replace('/');
  }

  if (!user) return <Screen><PageHeader title="Marketplace Journey"/><View style={styles.signIn}><View style={styles.signInIcon}><Ionicons name="person-outline" size={28} color={colors.pinkDeep}/></View><Text style={styles.signInTitle}>Create your personal journey</Text><Text style={styles.signInCopy}>Sign in or create an account so GWMB can remember your goal and recommend what to do next.</Text><Pressable onPress={() => router.push('/sign-in')} style={styles.primary}><Text style={styles.primaryText}>Sign in to continue</Text></Pressable></View></Screen>;

  return <Screen>
    <PageHeader title="My Marketplace Journey"/>
    <View style={styles.progressHead}><Text style={styles.progressText}>STEP {step + 1} OF 3</Text><Text style={styles.progressHint}>{step === 0 ? 'Your direction' : step === 1 ? 'Where you are' : 'What interests you'}</Text></View>
    <View style={styles.progressTrack}>{[0, 1, 2].map((item) => <View key={item} style={[styles.progressSegment, item <= step && styles.progressActive]}/>)}</View>

    <View style={styles.hero}><View style={styles.heroIcon}><Ionicons name={step === 0 ? 'navigate-outline' : step === 1 ? 'location-outline' : 'sparkles-outline'} size={25} color="white"/></View><Text style={styles.heroTitle}>{step === 0 ? 'What are you working towards right now?' : step === 1 ? 'Where are you right now?' : 'What are you interested in?'}</Text><Text style={styles.heroCopy}>{step === 0 ? 'Choose one primary goal. You can change it whenever your direction changes.' : step === 1 ? 'This helps us recommend the right level of support and opportunity.' : 'Choose up to five. We will use them to keep your recommendations focused.'}</Text></View>

    {step === 0 ? <View style={styles.optionList}>{journeyGoals.map((item) => { const selected = goal === item.id; return <Pressable key={item.id} onPress={() => setGoal(item.id)} style={[styles.option, selected && styles.optionSelected]}><View style={[styles.radio, selected && styles.radioSelected]}>{selected ? <Ionicons name="checkmark" size={13} color="white"/> : null}</View><Text style={[styles.optionText, selected && styles.optionTextSelected]}>{item.label}</Text></Pressable>; })}</View> : null}

    {step === 1 ? <View style={styles.optionList}>{careerStages.map((item) => { const selected = stage === item.id; return <Pressable key={item.id} onPress={() => setStage(item.id)} style={[styles.option, selected && styles.optionSelected]}><View style={[styles.stageIcon, selected && styles.stageIconSelected]}><Ionicons name={item.id === 'student' ? 'school-outline' : item.id === 'entrepreneur' ? 'storefront-outline' : 'briefcase-outline'} size={18} color={selected ? 'white' : colors.pinkDeep}/></View><Text style={[styles.optionText, selected && styles.optionTextSelected]}>{item.label}</Text><Ionicons name={selected ? 'checkmark-circle' : 'ellipse-outline'} size={20} color={selected ? colors.pinkDeep : '#C7C1C5'}/></Pressable>; })}</View> : null}

    {step === 2 ? <View style={styles.interestGroups}>{interestGroups.map((group) => <View key={group.title} style={styles.interestGroup}><Text style={styles.groupTitle}>{group.title}</Text><View style={styles.chips}>{group.items.map((interest) => { const selected = interests.includes(interest); return <Pressable key={interest} onPress={() => toggleInterest(interest)} style={[styles.chip, selected && styles.chipSelected]}><Text style={[styles.chipText, selected && styles.chipTextSelected]}>{interest}</Text>{selected ? <Ionicons name="checkmark" size={13} color="white"/> : null}</Pressable>; })}</View></View>)}</View> : null}

    {message ? <View style={styles.message}><Ionicons name="information-circle-outline" size={17} color={colors.pinkDeep}/><Text style={styles.messageText}>{message}</Text></View> : null}
    <View style={styles.footer}>{step > 0 ? <Pressable onPress={() => { setMessage(null); setStep((current) => current - 1); }} style={styles.back}><Ionicons name="arrow-back" size={18} color={colors.ink}/><Text style={styles.backText}>Back</Text></Pressable> : <View/>}<Pressable disabled={saving} onPress={() => void continueJourney()} style={[styles.primary, (!canContinue || saving) && styles.disabled]}>{saving ? <ActivityIndicator color="white"/> : <><Text style={styles.primaryText}>{step === 2 ? 'Create my journey' : 'Continue'}</Text><Ionicons name="arrow-forward" size={18} color="white"/></>}</Pressable></View>
  </Screen>;
}

const styles = StyleSheet.create({
  progressHead:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',marginTop:4},progressText:{color:colors.pinkDeep,fontSize:9,fontFamily:fonts.bodyBold,letterSpacing:1},progressHint:{color:colors.muted,fontSize:10,fontFamily:fonts.bodyMedium},progressTrack:{flexDirection:'row',gap:5,marginTop:9,marginBottom:18},progressSegment:{height:4,flex:1,borderRadius:2,backgroundColor:'#E4DFE2'},progressActive:{backgroundColor:colors.pinkDeep},
  hero:{borderRadius:25,backgroundColor:colors.ink,padding:19,marginBottom:16},heroIcon:{width:48,height:48,borderRadius:16,backgroundColor:colors.pink,alignItems:'center',justifyContent:'center'},heroTitle:{color:'white',fontSize:24,lineHeight:28,fontFamily:fonts.heading,letterSpacing:-.85,marginTop:22,maxWidth:400},heroCopy:{color:'#C9C2C6',fontSize:11,lineHeight:17,fontFamily:fonts.body,marginTop:8,maxWidth:390},
  optionList:{gap:8},option:{minHeight:61,borderRadius:18,borderWidth:1,borderColor:colors.line,backgroundColor:'white',paddingHorizontal:13,flexDirection:'row',alignItems:'center',gap:11},optionSelected:{borderColor:colors.pink,backgroundColor:colors.pinkSoft},radio:{width:24,height:24,borderRadius:12,borderWidth:1.5,borderColor:'#BEB7BB',alignItems:'center',justifyContent:'center'},radioSelected:{backgroundColor:colors.pinkDeep,borderColor:colors.pinkDeep},optionText:{flex:1,color:colors.ink,fontSize:12,lineHeight:16,fontFamily:fonts.bodySemibold},optionTextSelected:{fontFamily:fonts.bodyBold},stageIcon:{width:38,height:38,borderRadius:12,backgroundColor:colors.pinkSoft,alignItems:'center',justifyContent:'center'},stageIconSelected:{backgroundColor:colors.pinkDeep},
  interestGroups:{gap:18},interestGroup:{gap:9},groupTitle:{color:colors.ink,fontSize:12,fontFamily:fonts.headingBold},chips:{flexDirection:'row',flexWrap:'wrap',gap:7},chip:{minHeight:38,borderRadius:999,borderWidth:1,borderColor:colors.line,backgroundColor:'white',paddingHorizontal:12,flexDirection:'row',alignItems:'center',gap:6},chipSelected:{backgroundColor:colors.pinkDeep,borderColor:colors.pinkDeep},chipText:{color:colors.ink,fontSize:10,fontFamily:fonts.bodySemibold},chipTextSelected:{color:'white',fontFamily:fonts.bodyBold},
  message:{borderRadius:15,backgroundColor:colors.pinkSoft,padding:11,flexDirection:'row',alignItems:'center',gap:8,marginTop:14},messageText:{flex:1,color:colors.pinkDeep,fontSize:10,lineHeight:15,fontFamily:fonts.bodySemibold},footer:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:10,marginTop:20},back:{height:52,paddingHorizontal:14,flexDirection:'row',alignItems:'center',gap:7},backText:{color:colors.ink,fontSize:11,fontFamily:fonts.bodyBold},primary:{minWidth:150,height:52,borderRadius:16,backgroundColor:colors.pinkDeep,paddingHorizontal:18,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:12},primaryText:{color:'white',fontSize:11,fontFamily:fonts.bodyBold},disabled:{opacity:.48},
  signIn:{borderRadius:24,backgroundColor:'white',borderWidth:1,borderColor:colors.line,padding:22,alignItems:'center'},signInIcon:{width:58,height:58,borderRadius:19,backgroundColor:colors.pinkSoft,alignItems:'center',justifyContent:'center'},signInTitle:{color:colors.ink,fontSize:21,fontFamily:fonts.heading,marginTop:18},signInCopy:{color:colors.muted,fontSize:11,lineHeight:18,fontFamily:fonts.body,textAlign:'center',marginTop:7,marginBottom:20},
});
