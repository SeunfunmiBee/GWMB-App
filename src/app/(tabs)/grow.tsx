import { Ionicons } from '@expo/vector-icons';
import { router, type Href, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Screen } from '@/components/Screen';
import { AnimatedProgress } from '@/components/motion/AnimatedProgress';
import { FadeIn } from '@/components/motion/FadeIn';
import { SpringPressable } from '@/components/motion/SpringPressable';
import { growCategories, growCategoryColors, type GrowSlug } from '@/data/grow';
import { coursePercent, loadCourseProgress, type CourseProgress } from '@/lib/course-progress';
import { useCourseCatalog } from '@/lib/course-runtime';
import { tapFeedback } from '@/lib/feedback';
import { usePublishedContent } from '@/lib/content-runtime';
import { loadMentors } from '@/lib/mentorship-store';
import type { Mentor } from '@/data/mentorship';
import { useAuth } from '@/providers/AuthProvider';
import { colors, fonts } from '@/theme';

const challengeActions = ['Improve one section of your CV', 'Complete one focused lesson', 'Save one opportunity'] as const;

export default function GrowScreen() {
  const [progress, setProgress] = useState<CourseProgress | null>(null);
  const [focusSlug, setFocusSlug] = useState<GrowSlug>('career');
  const [challengeDone, setChallengeDone] = useState([true, false, false]);
  const continueScroller = useRef<ScrollView>(null);
  const continuePosition = useRef(0);
  const continuePausedUntil = useRef(0);
  const { user } = useAuth();
  const userId = user?.id;
  const courseCatalog=useCourseCatalog();
  const cvCourse = courseCatalog['workplace-foundations']??null;
  const publishedResources=usePublishedContent('resources');
  const firstResource=publishedResources[0]??null;
  const[firstMentor,setFirstMentor]=useState<Mentor|null>(null);

  useEffect(()=>{let active=true;loadMentors().then(result=>{if(active)setFirstMentor(result.mentors[0]??null)});return()=>{active=false}},[]);

  useFocusEffect(useCallback(() => {
    let active = true;
    if (!userId||!cvCourse) { setProgress(null); return () => { active = false; }; }
    loadCourseProgress(userId, cvCourse.id).then((result) => { if (active) setProgress(result.progress); });
    return () => { active = false; };
  }, [cvCourse, userId]));

  useEffect(() => {
    const timer = setInterval(() => {
      if (Date.now() < continuePausedUntil.current) return;
      const count=[cvCourse,firstResource,firstMentor].filter(Boolean).length;
      if(count<2)return;
      continuePosition.current = (continuePosition.current + 1) % count;
      continueScroller.current?.scrollTo({ x: continuePosition.current * 262, animated: continuePosition.current !== 0 });
    }, 4300);
    return () => clearInterval(timer);
  }, [cvCourse,firstMentor,firstResource]);

  const percent = cvCourse?coursePercent(progress, cvCourse.lessons.length):0;
  const currentIndex = Math.max(0, cvCourse?.lessons.findIndex((item) => !progress?.completed_lesson_ids.includes(item.id))??0);
  const focus = growCategories.find((item) => item.slug === focusSlug) ?? growCategories[0];
  const challengePercent = Math.round((challengeDone.filter(Boolean).length / challengeActions.length) * 100);

  function selectFocus(slug: GrowSlug) { void tapFeedback(); setFocusSlug(slug); }
  function toggleChallenge(index: number) { void tapFeedback(); setChallengeDone((current) => current.map((done, itemIndex) => itemIndex === index ? !done : done)); }

  return <Screen>
    <FadeIn delay={30}><Text style={styles.eyebrow}>Your development</Text><Text style={styles.title}>Grow.</Text><Text style={styles.copy}>There’s something here to help you grow today.</Text></FadeIn>

    <FadeIn delay={75}>
      <View style={[styles.focusHero, { backgroundColor: growCategoryColors[focus.slug] }]}>
        <View style={styles.focusOrbit}/><Ionicons name={focus.icon} size={128} color="rgba(255,255,255,.10)" style={styles.focusWatermark}/>
        <Text style={[styles.focusKicker, focus.slug === 'money' && styles.focusDarkText]}>WHAT DO YOU WANT TO GROW TODAY?</Text>
        <View style={styles.focusIcon}><Ionicons name={focus.icon} size={30} color={colors.pinkDeep}/></View>
        <Text style={[styles.focusTitle, focus.slug === 'money' && styles.focusDarkText]}>{focus.shortTitle}</Text>
        <Text style={[styles.focusCopy, focus.slug === 'money' && styles.focusDarkMuted]}>{focus.description}</Text>
        <Pressable onPress={() => router.push(`/grow/${focus.slug}` as Href)} style={styles.focusAction}><Text style={styles.focusActionText}>Explore this focus</Text><Ionicons name="arrow-forward" size={16} color={colors.ink}/></Pressable>
      </View>
    </FadeIn>

    <FadeIn delay={105}>
      <View style={styles.sectionHead}><View><Text style={styles.sectionKicker}>YOUR GROWTH PATHS</Text><Text style={styles.sectionTitle}>Explore every way to grow</Text></View><Text style={styles.sectionHint}>Swipe</Text></View>
      <ScrollView horizontal decelerationRate="fast" snapToInterval={170} showsHorizontalScrollIndicator={false} contentContainerStyle={styles.growthTrack}>
        {growCategories.map((item, index) => {
          const money = item.slug === 'money';
          return <Pressable key={item.slug} accessibilityLabel={`Open ${item.shortTitle}`} onPress={() => { selectFocus(item.slug); router.push(`/grow/${item.slug}` as Href); }} style={({ pressed }) => [styles.growthCard, { backgroundColor: growCategoryColors[item.slug] }, focusSlug === item.slug && styles.growthCardSelected, pressed && styles.growthCardPressed]}>
            <View style={styles.growthTop}><View style={styles.growthIcon}><Ionicons name={item.icon} size={25} color={colors.pinkDeep}/></View><Text style={[styles.growthIndex, money && styles.growthDarkMuted]}>0{index + 1}</Text></View>
            <View style={styles.growthBottom}><Text style={[styles.growthTitle, money && styles.growthDarkText]}>{item.shortTitle}</Text><Text numberOfLines={2} style={[styles.growthCopy, money && styles.growthDarkMuted]}>{item.description}</Text><View style={[styles.growthArrow, money && styles.growthArrowDark]}><Ionicons name="arrow-forward" size={16} color={money ? 'white' : colors.ink}/></View></View>
          </Pressable>;
        })}
      </ScrollView>
    </FadeIn>

    {cvCourse||firstResource||firstMentor?<FadeIn delay={125}>
      <View style={styles.sectionHead}><Text style={styles.sectionTitle}>Continue your growth</Text><Text style={styles.sectionHint}>Swipe</Text></View>
      <ScrollView ref={continueScroller} horizontal decelerationRate="fast" snapToInterval={262} showsHorizontalScrollIndicator={false} contentContainerStyle={styles.continueTrack} onScrollBeginDrag={() => { continuePausedUntil.current = Date.now() + 8000; }} onMomentumScrollEnd={(event) => { continuePosition.current = Math.round(event.nativeEvent.contentOffset.x / 262); }}>
        {cvCourse?<SpringPressable onPress={() => { void tapFeedback(); router.push(`/course/${cvCourse.id}`); }} style={[styles.continueCard, styles.continueDark]} contentStyle={styles.continueContent}>
          <View style={styles.continueTop}><View style={styles.continueIcon}><Ionicons name="play-circle-outline" size={25} color={colors.pinkDeep}/></View><Text style={styles.continueCount}>{percent}%</Text></View>
          <Text style={styles.continueEyebrow}>{progress ? 'CONTINUE LEARNING' : 'START LEARNING'}</Text><Text style={styles.continueTitle}>CV that gets noticed</Text><Text style={styles.continueMeta}>{progress ? percent === 100 ? 'Complete · Certificate ready' : `Lesson ${currentIndex + 1} of ${cvCourse.lessons.length}` : '6 practical lessons'}</Text>
          <AnimatedProgress value={percent} height={4} color={colors.pink} trackColor="#3B3739" style={styles.continueProgress}/>
        </SpringPressable>:null}
        {firstResource?<SpringPressable onPress={() => { void tapFeedback(); router.push(`/resource/${firstResource.slug}`); }} style={[styles.continueCard, styles.continuePurple]} contentStyle={styles.continueContent}>
          <View style={styles.continueTop}><View style={styles.continueIcon}><Ionicons name="document-text-outline" size={24} color="#6841D8"/></View><Ionicons name="arrow-forward" size={18} color={colors.ink}/></View><Text style={styles.purpleEyebrow}>{firstResource.eyebrow||'RESOURCE'}</Text><Text style={styles.continueTitleDark}>{firstResource.title}</Text><Text style={styles.continueMetaDark}>{String(firstResource.metadata.length??firstResource.metadata.resource_type??'Open resource')}</Text>
        </SpringPressable>:null}
        {firstMentor?<SpringPressable onPress={() => { void tapFeedback(); router.push(`/mentor/${firstMentor.id}`); }} style={[styles.continueCard, styles.continuePink]} contentStyle={styles.continueContent}>
          <View style={styles.continueTop}><View style={styles.continueIcon}><Ionicons name="people-outline" size={24} color={colors.pinkDeep}/></View><Ionicons name="arrow-forward" size={18} color={colors.ink}/></View><Text style={styles.pinkEyebrow}>MEET A MENTOR</Text><Text style={styles.continueTitleDark}>{firstMentor.full_name}</Text><Text style={styles.continueMetaDark}>{firstMentor.job_title} · {firstMentor.organisation}</Text>
        </SpringPressable>:null}
      </ScrollView>
    </FadeIn>:null}

    <FadeIn delay={180}>
      <View style={styles.challengeCard}>
        <View style={styles.challengeHeader}><View><Text style={styles.challengeKicker}>YOUR WEEKLY GROWTH CHALLENGE</Text><Text style={styles.challengeTitle}>One stronger step this week</Text></View><View style={styles.challengeRing}><Text style={styles.challengePercent}>{challengePercent}%</Text></View></View>
        <AnimatedProgress value={challengePercent} height={5} color="#FFD13D" trackColor="rgba(255,255,255,.20)" style={styles.challengeProgress}/>
        <View style={styles.challengeList}>{challengeActions.map((action, index) => <Pressable key={action} onPress={() => toggleChallenge(index)} style={styles.challengeAction}><View style={[styles.challengeCheck, challengeDone[index] && styles.challengeCheckDone]}><Ionicons name={challengeDone[index] ? 'checkmark' : 'add'} size={15} color={challengeDone[index] ? colors.pinkDeep : 'white'}/></View><Text style={[styles.challengeActionText, challengeDone[index] && styles.challengeActionDone]}>{action}</Text></Pressable>)}</View>
      </View>
    </FadeIn>

  </Screen>;
}

const styles = StyleSheet.create({
  eyebrow:{color:colors.pinkDeep,fontSize:10,fontFamily:fonts.bodyBold,letterSpacing:1.1,textTransform:'uppercase',marginTop:8},title:{fontSize:32,lineHeight:36,fontFamily:fonts.heading,color:colors.ink,letterSpacing:-1.2,marginTop:6},copy:{fontSize:13,lineHeight:19,fontFamily:fonts.body,color:colors.muted,marginTop:5},
  focusHero:{height:315,borderRadius:29,overflow:'hidden',padding:20,marginTop:22},focusOrbit:{position:'absolute',width:190,height:190,borderRadius:95,borderWidth:42,borderColor:'rgba(255,255,255,.10)',right:-48,top:-58},focusWatermark:{position:'absolute',right:-18,bottom:-13},focusKicker:{color:'rgba(255,255,255,.82)',fontSize:9,fontFamily:fonts.bodyBold,letterSpacing:1},focusIcon:{width:60,height:60,borderRadius:20,backgroundColor:'white',alignItems:'center',justifyContent:'center',marginTop:24},focusTitle:{color:'white',fontSize:30,lineHeight:35,fontFamily:fonts.heading,letterSpacing:-1,marginTop:18},focusCopy:{color:'rgba(255,255,255,.84)',fontSize:12,lineHeight:18,fontFamily:fonts.bodyMedium,maxWidth:290,marginTop:5},focusDarkText:{color:colors.ink},focusDarkMuted:{color:'rgba(17,16,17,.68)'},focusAction:{height:42,alignSelf:'flex-start',borderRadius:14,backgroundColor:'white',flexDirection:'row',alignItems:'center',gap:18,paddingHorizontal:14,marginTop:'auto'},focusActionText:{color:colors.ink,fontSize:11,fontFamily:fonts.bodyBold},
  sectionHead:{width:'100%',flexDirection:'row',alignItems:'flex-end',justifyContent:'space-between',marginTop:27,marginBottom:12},sectionKicker:{color:colors.pinkDeep,fontSize:9,fontFamily:fonts.bodyBold,letterSpacing:1,marginBottom:4},sectionTitle:{flexShrink:1,color:colors.ink,fontSize:18,fontFamily:fonts.heading},sectionLink:{flexShrink:0,color:colors.pinkDeep,fontSize:11,fontFamily:fonts.bodyBold},sectionHint:{color:colors.muted,fontSize:10,fontFamily:fonts.bodySemibold},
  growthTrack:{gap:10,paddingRight:18},growthCard:{width:160,height:200,borderRadius:24,padding:14,overflow:'hidden',borderWidth:2,borderColor:'transparent'},growthCardSelected:{borderColor:'rgba(255,255,255,.78)'},growthCardPressed:{transform:[{translateY:-2}]},growthTop:{flexDirection:'row',alignItems:'flex-start',justifyContent:'space-between'},growthIcon:{width:49,height:49,borderRadius:16,backgroundColor:'white',alignItems:'center',justifyContent:'center'},growthIndex:{color:'rgba(255,255,255,.72)',fontSize:9,fontFamily:fonts.bodyBold,letterSpacing:.7,marginTop:3},growthBottom:{flex:1,justifyContent:'flex-end'},growthTitle:{color:'white',fontSize:17,lineHeight:20,fontFamily:fonts.headingBold,letterSpacing:-.35,paddingRight:28},growthCopy:{color:'rgba(255,255,255,.78)',fontSize:10,lineHeight:14,fontFamily:fonts.bodyMedium,marginTop:5,paddingRight:4},growthArrow:{position:'absolute',right:0,bottom:0,width:30,height:30,borderRadius:15,backgroundColor:'white',alignItems:'center',justifyContent:'center'},growthArrowDark:{backgroundColor:colors.ink},growthDarkText:{color:colors.ink},growthDarkMuted:{color:'rgba(17,16,17,.62)'},
  continueTrack:{gap:10,paddingRight:18},continueCard:{width:252,height:196,borderRadius:23,overflow:'hidden'},continueContent:{padding:15},continueDark:{backgroundColor:colors.ink},continuePurple:{backgroundColor:'#EFEDFF'},continuePink:{backgroundColor:colors.pinkSoft},continueTop:{flexDirection:'row',alignItems:'flex-start',justifyContent:'space-between'},continueIcon:{width:46,height:46,borderRadius:15,backgroundColor:'white',alignItems:'center',justifyContent:'center'},continueCount:{color:'white',fontSize:12,fontFamily:fonts.headingBold},continueEyebrow:{color:'#F3A2C6',fontSize:9,fontFamily:fonts.bodyBold,letterSpacing:.8,marginTop:17},purpleEyebrow:{color:'#6841D8',fontSize:9,fontFamily:fonts.bodyBold,letterSpacing:.8,marginTop:17},pinkEyebrow:{color:colors.pinkDeep,fontSize:9,fontFamily:fonts.bodyBold,letterSpacing:.8,marginTop:17},continueTitle:{color:'white',fontSize:17,lineHeight:21,fontFamily:fonts.headingBold,marginTop:5},continueTitleDark:{color:colors.ink,fontSize:17,lineHeight:21,fontFamily:fonts.headingBold,marginTop:5,maxWidth:205},continueMeta:{color:'#BEB7BB',fontSize:10,fontFamily:fonts.bodyMedium,marginTop:4},continueMetaDark:{color:colors.muted,fontSize:10,fontFamily:fonts.bodyMedium,marginTop:5},continueProgress:{marginTop:'auto'},
  challengeCard:{borderRadius:27,backgroundColor:colors.pinkDeep,padding:19,overflow:'hidden'},challengeHeader:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:12},challengeKicker:{color:'#FFC4DE',fontSize:9,fontFamily:fonts.bodyBold,letterSpacing:.9},challengeTitle:{color:'white',fontSize:20,lineHeight:25,fontFamily:fonts.headingBold,marginTop:5,maxWidth:270},challengeRing:{width:54,height:54,borderRadius:27,borderWidth:5,borderColor:'#FFD13D',alignItems:'center',justifyContent:'center'},challengePercent:{color:'white',fontSize:10,fontFamily:fonts.headingBold},challengeProgress:{marginTop:17},challengeList:{gap:7,marginTop:15},challengeAction:{minHeight:42,borderRadius:14,backgroundColor:'rgba(255,255,255,.11)',flexDirection:'row',alignItems:'center',gap:10,paddingHorizontal:11},challengeCheck:{width:24,height:24,borderRadius:12,borderWidth:1,borderColor:'rgba(255,255,255,.45)',alignItems:'center',justifyContent:'center'},challengeCheckDone:{backgroundColor:'white',borderColor:'white'},challengeActionText:{flex:1,color:'white',fontSize:11,fontFamily:fonts.bodySemibold},challengeActionDone:{color:'rgba(255,255,255,.58)',textDecorationLine:'line-through'},
  search:{height:54,borderRadius:17,borderWidth:1,borderColor:colors.line,backgroundColor:colors.surface,flexDirection:'row',alignItems:'center',paddingLeft:14,marginTop:25},input:{flex:1,minWidth:0,height:'100%',paddingHorizontal:10,color:colors.ink,fontSize:12,fontFamily:fonts.body},filterIcon:{width:38,height:38,borderRadius:13,backgroundColor:'#F0EDEF',alignItems:'center',justifyContent:'center',marginRight:6},
  grid:{width:'100%',flexDirection:'row',flexWrap:'wrap',gap:10},card:{width:'48%',maxWidth:'48%',minWidth:0,minHeight:142,borderRadius:20,overflow:'hidden'},cardContent:{padding:15},cardDark:{backgroundColor:colors.ink},cardPink:{backgroundColor:colors.pinkSoft},cardLavender:{backgroundColor:'#F0EFFF'},cardCream:{backgroundColor:'#FFF4DF'},icon:{width:36,height:36,borderRadius:18,backgroundColor:'rgba(230,43,127,.14)',alignItems:'center',justifyContent:'center'},iconDark:{backgroundColor:colors.pink},cardTitle:{color:colors.ink,fontSize:14,lineHeight:18,fontFamily:fonts.headingBold,marginTop:17},cardCopy:{flexShrink:1,color:colors.muted,fontSize:10,lineHeight:15,fontFamily:fonts.body,marginTop:6,maxWidth:140},white:{color:'white'},darkMuted:{color:'#C7C1C4'},empty:{borderRadius:20,backgroundColor:colors.pinkSoft,padding:24,alignItems:'center'},emptyTitle:{color:colors.ink,fontSize:14,fontFamily:fonts.headingBold,marginTop:9},emptyCopy:{color:colors.muted,fontSize:11,fontFamily:fonts.body,marginTop:4},
});
