import { Ionicons } from '@expo/vector-icons';
import { router as expoRouter, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject, type RefObject } from 'react';
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';

import { Screen } from '@/components/Screen';
import { PersonalizedHome } from '@/components/PersonalizedHome';
import { ScreenSkeleton } from '@/components/states/Skeleton';
import { AnimatedProgress } from '@/components/motion/AnimatedProgress';
import { FadeIn } from '@/components/motion/FadeIn';
import { SpringPressable } from '@/components/motion/SpringPressable';
import type { MentorshipSession } from '@/data/mentorship';
import { growCategoryColors } from '@/data/grow';
import { coursePercent, loadAllCourseProgress, loadCourseProgress, type CourseProgress } from '@/lib/course-progress';
import { useCourseCatalog } from '@/lib/course-runtime';
import { subscribeToCalendarChanges } from '@/lib/calendar-store';
import { loadEventRegistrations, type EventRegistration } from '@/lib/event-store';
import { loadMentorshipRegistrations, loadMentorshipSessions, type MentorshipRegistration } from '@/lib/mentorship-store';
import { tapFeedback } from '@/lib/feedback';
import { loadMarketplaceJourney, type MarketplaceJourney } from '@/lib/marketplace-journey';
import { loadOpportunityApplications, type OpportunityApplication } from '@/lib/opportunity-store';
import { eventCountdown, urgencyLabel } from '@/lib/time';
import { cmsEvent, cmsOpportunity, usePublishedContent } from '@/lib/content-runtime';
import { useUnreadNotifications } from '@/lib/use-unread-notifications';
import type { ContentItem } from '@/lib/admin-content';
import { useAuth } from '@/providers/AuthProvider';
import { colors, fonts } from '@/theme';
import { ProfileCompletionCard } from '@/components/ProfileCompletionCard';

const router = { push: (href: string) => expoRouter.push(href as never) };

const benefitVisuals = [
  { icon: 'briefcase-outline', tone: growCategoryColors.career },
  { icon: 'people-outline', tone: growCategoryColors.mentorship },
  { icon: 'play-circle-outline', tone: growCategoryColors.learning },
  { icon: 'wallet-outline', tone: growCategoryColors.money },
  { icon: 'sparkles-outline', tone: growCategoryColors.leadership },
  { icon: 'trending-up-outline', tone: growCategoryColors['personal-growth'] },
  { icon: 'heart-outline', tone: '#C91867' },
  { icon: 'telescope-outline', tone: '#078765' },
] as const;

const bySlug=(items:ContentItem[],slug:string)=>items.find(item=>item.slug===slug);
const metaText=(item:ContentItem|undefined,key:string,fallback:string)=>typeof item?.metadata?.[key]==='string'?String(item.metadata[key]):fallback;

export default function HomeScreen() {
  const { width } = useWindowDimensions();
  const { user, profile, membership, accountLoading } = useAuth();
  const homeContent=usePublishedContent('home');
  const winsContent=usePublishedContent('member-wins');
  const eventContent=usePublishedContent('events');
  const opportunityContent=usePublishedContent('opportunities');
  const resourceContent=usePublishedContent('resources');
  const courseCatalog=useCourseCatalog();
  const [courseProgress, setCourseProgress] = useState<CourseProgress | null>(null);
  const [courseProgresses, setCourseProgresses] = useState<CourseProgress[]>([]);
  const [eventRegistrations, setEventRegistrations] = useState<EventRegistration[]>([]);
  const [mentorshipRegistrations, setMentorshipRegistrations] = useState<MentorshipRegistration[]>([]);
  const [mentorshipSessions, setMentorshipSessions] = useState<MentorshipSession[]>([]);
  const [applications, setApplications] = useState<OpportunityApplication[]>([]);
  const [journey, setJourney] = useState<MarketplaceJourney | null>(null);
  const [courseDataOwner, setCourseDataOwner] = useState<string | null>(null);
  const [eventDataOwner, setEventDataOwner] = useState<string | null>(null);
  const [journeyDataOwner, setJourneyDataOwner] = useState<string | null>(null);
  const [liveRevision, setLiveRevision] = useState(0);
  const [featuredIndex, setFeaturedIndex] = useState(0);
  const [benefitIndex, setBenefitIndex] = useState(0);
  const featureScroller = useRef<ScrollView>(null);
  const resumeScroller = useRef<ScrollView>(null);
  const benefitsScroller = useRef<ScrollView>(null);
  const opportunitiesScroller = useRef<ScrollView>(null);
  const communityScroller = useRef<ScrollView>(null);
  const memberWinsScroller = useRef<ScrollView>(null);
  const todayScroller = useRef<ScrollView>(null);
  const benefitsPosition = useRef(0);
  const resumePosition = useRef(0);
  const opportunitiesPosition = useRef(0);
  const communityPosition = useRef(0);
  const memberWinsPosition = useRef(0);
  const todayPosition = useRef(0);
  const benefitsPausedUntil = useRef(0);
  const resumePausedUntil = useRef(0);
  const opportunitiesPausedUntil = useRef(0);
  const communityPausedUntil = useRef(0);
  const memberWinsPausedUntil = useRef(0);
  const todayPausedUntil = useRef(0);
  const cvCourse = courseCatalog['workplace-foundations']??null;
  const userId = user?.id;
  const unreadNotifications = useUnreadNotifications(userId);

  useEffect(()=>subscribeToCalendarChanges(()=>setLiveRevision(value=>value+1)),[]);

  const benefits=useMemo(()=>homeContent.filter(item=>item.content_type==='benefit_card'&&item.visible&&item.route).map((item,index)=>({label:item.title,icon:metaText(item,'icon',benefitVisuals[index]?.icon||'sparkles-outline') as typeof benefitVisuals[number]['icon'],promise:item.summary||'',tone:metaText(item,'color',benefitVisuals[index]?.tone||colors.pinkDeep),route:item.route!,dark:item.metadata.dark!==false})),[homeContent]);
  const memberWins=useMemo(()=>winsContent.filter(item=>item.visible).slice(0,5).map(item=>({id:item.id,category:item.eyebrow||'MEMBER SPOTLIGHT',title:item.title,copy:item.summary||'',imageUrl:item.image_url})),[winsContent]);
  const communityPhotos=useMemo(()=>homeContent.filter(item=>item.content_type==='community_photo'&&item.visible).map(item=>item.image_url?{uri:item.image_url}:null),[homeContent]);

  useFocusEffect(useCallback(() => {
    let active = true;
    if (!userId||!cvCourse) { setCourseProgress(null); setCourseProgresses([]); setCourseDataOwner(userId??null); return () => { active = false; }; }
    Promise.all([loadCourseProgress(userId, cvCourse.id),loadAllCourseProgress(userId)]).then(([result,all]) => { if (active) { setCourseProgress(result.progress); setCourseProgresses(all.progress); setCourseDataOwner(userId); } });
    return () => { active = false; };
  }, [cvCourse, userId]));

  useFocusEffect(useCallback(() => {
    void liveRevision;
    let active = true;
    if (!userId) { setEventRegistrations([]); setMentorshipRegistrations([]); setEventDataOwner(null); return () => { active = false; }; }
    Promise.all([loadEventRegistrations(userId),loadMentorshipRegistrations(userId),loadMentorshipSessions()]).then(([events,mentorship,sessions]) => { if (active) { setEventRegistrations(events.registrations); setMentorshipRegistrations(mentorship.registrations); setMentorshipSessions(sessions.sessions.filter(item=>!item.distribution_surfaces||item.distribution_surfaces.includes('home'))); setEventDataOwner(userId); } });
    return () => { active = false; };
  }, [liveRevision, userId]));

  useFocusEffect(useCallback(() => {
    let active = true;
    if (!userId) { setJourney(null); setApplications([]); setJourneyDataOwner(null); return () => { active = false; }; }
    Promise.all([loadMarketplaceJourney(userId), loadOpportunityApplications(userId)]).then(([journeyResult, applicationResult]) => {
      if (!active) return;
      setJourney(journeyResult.journey);
      setApplications(applicationResult.applications);
      setJourneyDataOwner(userId);
    });
    return () => { active = false; };
  }, [userId]));

  const cvPercent = cvCourse?coursePercent(courseProgress, cvCourse.lessons.length):0;
  const currentLessonIndex = Math.max(0, cvCourse?.lessons.findIndex((item) => !courseProgress?.completed_lesson_ids.includes(item.id))??0);
  const firstName = profile?.full_name?.split(' ')[0] || user?.email?.split('@')[0] || 'Girlie';
  const initials = profile?.full_name?.split(' ').filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || 'GW';
  const isMember = membership?.status === 'verified';
  const publishedEvents=useMemo(()=>eventContent.map(cmsEvent).filter(item=>item.lifecycle==='upcoming'&&item.startsAt).sort((a,b)=>new Date(a.startsAt??0).getTime()-new Date(b.startsAt??0).getTime()),[eventContent]);
  const publishedOpportunities=useMemo(()=>opportunityContent.map(cmsOpportunity),[opportunityContent]);
  const publishedResources=useMemo(()=>resourceContent.map(item=>({id:item.slug,title:item.title,type:item.eyebrow||String(item.metadata.resource_type??'RESOURCE'),meta:String(item.metadata.length??item.metadata.format_label??item.metadata.resource_type??'Resource')})),[resourceContent]);
  const nextRegistration = eventRegistrations.find(registration=>registration.status!=='cancelled'&&eventContent.some(item=>item.id===registration.event_id||item.slug===registration.event_id||`/event/${item.slug}`===registration.event_route));
  const nextEvent = nextRegistration?publishedEvents.find(event=>{const item=eventContent.find(content=>content.slug===event.id);return item&&(item.id===nextRegistration.event_id||item.slug===nextRegistration.event_id||`/event/${item.slug}`===nextRegistration.event_route)})??null:null;
  const soonestEvent = publishedEvents[0]??null;
  const firstOpportunity=publishedOpportunities[0]??null;
  const firstResource=publishedResources[0]??null;
  const heroWidth = Math.min(Math.max(width * 0.82, 286), 430);
  const resumeWidth = Math.min(Math.max(width * 0.66, 238), 300);
  const benefitWidth = Math.min(Math.max(width * 0.43, 156), 190);
  const heroGap = 12;
  const homeHeader=bySlug(homeContent,'page-greeting');
  const guestPrompt=bySlug(homeContent,'guest-account-prompt');
  const journeyPrompt=bySlug(homeContent,'journey-prompt');
  const todaySection=bySlug(homeContent,'today-section');
  const pickedSection=bySlug(homeContent,'picked-section');
  const activitySection=bySlug(homeContent,'activity-section');
  const benefitsHeading=bySlug(homeContent,'benefits-section');
  const benefitsCta=bySlug(homeContent,'benefits-cta');
  const spotlightSection=bySlug(homeContent,'spotlight-section');
  const opportunitiesHeading=bySlug(homeContent,'opportunities-section');
  const communityInvite=bySlug(homeContent,'community-invite');

  const featureCards = useMemo(() => {
    return homeContent.filter(item=>item.content_type==='home_feature'&&item.visible&&item.route).map(item=>({key:item.slug,route:item.route!,label:item.eyebrow||'FEATURED',title:item.title,copy:item.summary||'',image:item.image_url?{uri:item.image_url}:undefined,tone:metaText(item,'color','#111011'),action:metaText(item,'action','Explore')}));
  }, [homeContent]);

  const todaySignals = [
    ...(soonestEvent?[{ label: 'HAPPENING SOON', title: soonestEvent.title, meta: eventCountdown(soonestEvent.startsAt) || soonestEvent.dateShort, icon: 'calendar-outline' as const, tone: colors.ink, light: true, route: `/event/${soonestEvent.id}` }]:[]),
    ...(firstResource?[{ label: 'NEW RESOURCE', title: firstResource.title, meta: firstResource.meta, icon: 'document-text-outline' as const, tone: '#EFEDFF', light: false, route: `/resource/${firstResource.id}` }]:[]),
    ...(firstOpportunity?[{ label: urgencyLabel(firstOpportunity.deadlineAt) || 'OPPORTUNITY', title: firstOpportunity.title, meta: firstOpportunity.org, icon: 'briefcase-outline' as const, tone: colors.pinkSoft, light: false, route: `/opportunity/${firstOpportunity.id}` }]:[]),
  ];
  const resumeItemCount=[cvCourse,firstResource,nextEvent??soonestEvent,firstOpportunity].filter(Boolean).length;

  useEffect(() => {
    if(featureCards.length<2)return;
    const timer = setInterval(() => {
      const next = (featuredIndex + 1) % featureCards.length;
      featureScroller.current?.scrollTo({ x: next * (heroWidth + heroGap), animated: true });
      setFeaturedIndex(next);
    }, 6000);
    return () => clearInterval(timer);
  }, [featureCards.length, featuredIndex, heroWidth]);

  useEffect(() => {
    const advance = (scroller: RefObject<ScrollView | null>, position: MutableRefObject<number>, pausedUntil: MutableRefObject<number>, count: number, step: number) => {
      if(count<2)return;
      if (Date.now() < pausedUntil.current) return;
      position.current = (position.current + 1) % count;
      scroller.current?.scrollTo({ x: position.current * step, animated: position.current !== 0 });
    };
    const benefitsTimer = setInterval(() => {
      if(benefits.length<2)return;
      if (Date.now() < benefitsPausedUntil.current) return;
      benefitsPosition.current = (benefitsPosition.current + 1) % benefits.length;
      setBenefitIndex(benefitsPosition.current);
      benefitsScroller.current?.scrollTo({ x: benefitsPosition.current * (benefitWidth + 10), animated: benefitsPosition.current !== 0 });
    }, 3600);
    const resumeTimer = setInterval(() => advance(resumeScroller, resumePosition, resumePausedUntil, resumeItemCount, resumeWidth + 10), 4300);
    const opportunitiesTimer = setInterval(() => advance(opportunitiesScroller, opportunitiesPosition, opportunitiesPausedUntil, publishedOpportunities.length, 228), 3900);
    const communityTimer = setInterval(() => advance(communityScroller, communityPosition, communityPausedUntil, communityPhotos.length, 116), 2500);
    const memberWinsTimer = setInterval(() => advance(memberWinsScroller, memberWinsPosition, memberWinsPausedUntil, memberWins.length, heroWidth + heroGap), 4600);
    const todayTimer = setInterval(() => advance(todayScroller, todayPosition, todayPausedUntil, todaySignals.length, 220), 3300);
    return () => { clearInterval(benefitsTimer); clearInterval(resumeTimer); clearInterval(opportunitiesTimer); clearInterval(communityTimer); clearInterval(memberWinsTimer); clearInterval(todayTimer); };
  }, [benefitWidth, benefits.length, communityPhotos.length, heroWidth, memberWins.length, publishedOpportunities.length, resumeItemCount, resumeWidth, todaySignals.length]);

  function pauseAutoScroll(target: MutableRefObject<number>) { target.current = Date.now() + 8000; }

  function updateFeatured(event: NativeSyntheticEvent<NativeScrollEvent>) {
    const step = heroWidth + heroGap;
    setFeaturedIndex(Math.max(0, Math.min(featureCards.length - 1, Math.round(event.nativeEvent.contentOffset.x / step))));
  }

  const benefitsSection = !benefits.length||benefitsHeading?.visible===false?null:<FadeIn delay={250}><View style={styles.sectionHead}><View><Text style={styles.kicker}>{benefitsHeading?.eyebrow||'YOUR GWMB BENEFITS'}</Text><Text style={styles.sectionTitle}>{benefitsHeading?.title||'Explore your benefits'}</Text></View><Text style={styles.swipeLabel}>{metaText(benefitsHeading,'swipeLabel','Swipe')}</Text></View>
      <ScrollView ref={benefitsScroller} horizontal decelerationRate="fast" snapToInterval={benefitWidth + 10} showsHorizontalScrollIndicator={false} contentContainerStyle={styles.benefitsTrack} onScrollBeginDrag={() => pauseAutoScroll(benefitsPausedUntil)} onMomentumScrollEnd={(event) => { const next = Math.max(0, Math.min(benefits.length - 1, Math.round(event.nativeEvent.contentOffset.x / (benefitWidth + 10)))); benefitsPosition.current = next; setBenefitIndex(next); }}>
        {benefits.map((benefit, index) => <Pressable key={benefit.label} onPress={() => { void tapFeedback(); router.push(benefit.route); }} style={({ pressed }) => [styles.benefitStory, { width: benefitWidth, backgroundColor: pressed ? colors.pinkDeep : benefit.tone }, pressed && styles.benefitStoryPressed]}>
          {({ pressed }) => { const light = pressed || benefit.dark; return <><View style={styles.benefitStoryTop}><View style={styles.benefitLargeIcon}><Ionicons name={benefit.icon} size={27} color={colors.pinkDeep}/></View><Text style={[styles.benefitStoryIndex, light && styles.benefitLight]}>0{index + 1}</Text></View><View style={styles.benefitStoryBottom}><View style={styles.benefitTitleRow}><Text style={[styles.benefitStoryName, light && styles.benefitLight]}>{benefit.label}</Text><View style={[styles.benefitArrow, light && styles.benefitArrowLight]}><Ionicons name="arrow-forward" size={15} color={light ? colors.ink : 'white'}/></View></View><Text numberOfLines={2} style={[styles.benefitPromise, light && styles.benefitPromiseLight]}>{benefit.promise}</Text></View></>; }}
        </Pressable>)}
      </ScrollView>
      <View style={styles.benefitProgress}><Text style={styles.benefitProgressCount}>0{benefitIndex + 1}</Text><View style={styles.benefitProgressTrack}>{benefits.map((benefit, index) => <View key={benefit.label} style={[styles.benefitProgressDot, index === benefitIndex && styles.benefitProgressDotActive]}/>)}</View><Text style={styles.benefitProgressCount}>{String(benefits.length).padStart(2,'0')}</Text></View>
      {benefitsCta?.route?<SpringPressable onPress={() => { void tapFeedback(); router.push(benefitsCta.route!); }} style={styles.benefitsCta} contentStyle={styles.benefitsCtaContent}><View><Text style={styles.benefitsCtaLabel}>{benefitsCta.eyebrow||'THE FULL GWMB EXPERIENCE'}</Text><Text style={styles.benefitsCtaTitle}>{benefitsCta.title}</Text></View><View style={styles.whiteArrow}><Ionicons name="arrow-forward" size={17} color={colors.ink}/></View></SpringPressable>:null}</FadeIn>;

  const opportunitiesSection = opportunitiesHeading?.visible===false||!publishedOpportunities.length?null:<FadeIn delay={320}><View style={styles.sectionHead}><View><Text style={styles.kicker}>{opportunitiesHeading?.eyebrow||'CURATED FOR YOUR NEXT MOVE'}</Text><Text style={styles.sectionTitle}>{opportunitiesHeading?.title||'Opportunities Corner'}</Text></View><Pressable onPress={() => router.push(opportunitiesHeading?.route||'/opportunities')}><Text style={styles.sectionLink}>{metaText(opportunitiesHeading,'link','See all')}</Text></Pressable></View>
      <ScrollView ref={opportunitiesScroller} horizontal decelerationRate="fast" snapToInterval={228} showsHorizontalScrollIndicator={false} contentContainerStyle={styles.opportunityTrack} onScrollBeginDrag={() => pauseAutoScroll(opportunitiesPausedUntil)} onMomentumScrollEnd={(event) => { opportunitiesPosition.current = Math.round(event.nativeEvent.contentOffset.x / 228); }}>
        {publishedOpportunities.map((item, index) => <SpringPressable key={item.id} onPress={() => { void tapFeedback(); router.push(`/opportunity/${item.id}`); }} style={styles.opportunityCard} contentStyle={styles.opportunityContent}>
          <View style={styles.opportunityTop}><View style={[styles.brandMark, index === 1 && styles.brandMarkPink]}><Text style={[styles.brandInitials, index === 1 && styles.brandInitialsLight]}>{item.initials}</Text></View><View style={[styles.deadlinePill, urgencyLabel(item.deadlineAt) && styles.urgentPill]}><Text style={[styles.deadlineText, urgencyLabel(item.deadlineAt) && styles.urgentText]}>{urgencyLabel(item.deadlineAt) || item.deadline.replace('Closes ', '')}</Text></View></View>
          <Text style={styles.opportunityType}>{item.type.toUpperCase()}</Text>
          <Text numberOfLines={2} style={styles.opportunityTitle}>{item.title}</Text>
          <Text style={styles.opportunityOrg}>{item.org}</Text>
          <View style={styles.opportunityFooter}><Text style={styles.opportunityLocation}>{item.location}</Text><Ionicons name="arrow-forward" size={16} color={colors.pinkDeep}/></View>
        </SpringPressable>)}
      </ScrollView></FadeIn>;

  const signedInHomeReady=!userId||(!accountLoading&&courseDataOwner===userId&&eventDataOwner===userId&&journeyDataOwner===userId);

  if(userId&&!signedInHomeReady)return <Screen><ScreenSkeleton rows={3}/></Screen>;

  if (user && journey?.onboarding_completed) {
    return <PersonalizedHome firstName={firstName} initials={initials} avatarUrl={profile?.avatar_url} isMember={isMember} journey={journey} courseProgress={courseProgress} courseProgresses={courseProgresses} registrations={eventRegistrations} mentorshipRegistrations={mentorshipRegistrations} mentorshipSessions={mentorshipSessions} applications={applications} unreadNotifications={unreadNotifications}/>;
  }

  return (
    <Screen>
      <FadeIn delay={40}><View style={styles.header}>
        <View style={styles.headerCopy}>
          <Text style={styles.dateLabel}>{homeHeader?.eyebrow||'YOUR GWMB TODAY'}</Text>
          <Text numberOfLines={1} style={styles.greeting}>{(homeHeader?.title||'Hey, {firstName}').replace('{firstName}',firstName)} <Text style={styles.wave}>✦</Text></Text>
          <Text style={styles.subGreeting}>{homeHeader?.summary||'You’re one step closer to the woman you’re becoming.'}</Text>
        </View>
        <View style={styles.headerActions}>
          <Pressable accessibilityLabel="Notifications" onPress={() => router.push('/notifications')} style={({ pressed }) => [styles.roundButton, pressed && styles.actionPressed]}>
            <Ionicons name="notifications-outline" size={20} color={colors.ink} />
            {unreadNotifications>0?<View style={styles.notificationDot} />:null}
          </Pressable>
          <Pressable accessibilityLabel="Open profile" onPress={() => router.push('/profile')} style={({ pressed }) => [styles.avatar, pressed && styles.avatarPressed]}>
            {profile?.avatar_url ? <Image source={{ uri: profile.avatar_url }} style={styles.avatarImage}/> : <Text style={styles.avatarText}>{initials}</Text>}
            {isMember ? <View style={styles.onlineDot}/> : null}
          </Pressable>
        </View>
      </View></FadeIn>

      {!user ? <Pressable onPress={() => router.push(guestPrompt?.route||'/welcome')} style={styles.guestStrip}><View style={styles.guestIcon}><Ionicons name="sparkles" size={16} color={colors.pinkDeep}/></View><View style={styles.guestCopy}><Text style={styles.guestTitle}>{guestPrompt?.title||'Make GWMB yours'}</Text><Text style={styles.guestText}>{guestPrompt?.summary||'Create an account to save courses, events and opportunities.'}</Text></View><Ionicons name="arrow-forward" size={17} color={colors.ink}/></Pressable> : null}
      {user?<ProfileCompletionCard userId={user.id} profile={profile} journey={journey}/>:null}

      {user && !journey ? <FadeIn delay={65}><Pressable onPress={() => router.push(journeyPrompt?.route||'/marketplace-journey')} style={({ pressed }) => [styles.journeyInvite, pressed && styles.journeyInvitePressed]}><View style={styles.journeyInviteTop}><View style={styles.journeyInviteIcon}><Ionicons name="navigate" size={22} color={colors.pinkDeep}/></View><Text style={styles.journeyInviteCount}>{metaText(journeyPrompt,'meta','3 QUICK STEPS')}</Text></View><Text style={styles.journeyInviteKicker}>{journeyPrompt?.eyebrow||'MAKE HOME WORK FOR YOU'}</Text><Text style={styles.journeyInviteTitle}>{journeyPrompt?.title||'Tell us where you’re trying to go.'}</Text><Text style={styles.journeyInviteCopy}>{journeyPrompt?.summary||'Choose your goal, career stage and interests. We’ll recommend the most useful thing to do next.'}</Text><View style={styles.journeyInviteAction}><Text style={styles.journeyInviteActionText}>{metaText(journeyPrompt,'cta','Find my next move')}</Text><Ionicons name="arrow-forward" size={17} color={colors.ink}/></View></Pressable></FadeIn> : null}

      {todaySignals.length?<FadeIn delay={75}>
        <View style={styles.todayHead}><Text style={styles.kicker}>{todaySection?.eyebrow||'TODAY IN GWMB'}</Text><View style={styles.freshPill}><View style={styles.freshDot}/><Text style={styles.freshText}>{metaText(todaySection,'badge','FRESH')}</Text></View></View>
        <ScrollView ref={todayScroller} horizontal decelerationRate="fast" snapToInterval={220} showsHorizontalScrollIndicator={false} contentContainerStyle={styles.todayTrack} onScrollBeginDrag={() => pauseAutoScroll(todayPausedUntil)} onMomentumScrollEnd={(event) => { todayPosition.current = Math.round(event.nativeEvent.contentOffset.x / 220); }}>
          {todaySignals.map((signal) => <SpringPressable key={signal.title} onPress={() => { void tapFeedback(); router.push(signal.route); }} style={[styles.todayCard, { backgroundColor: signal.tone }]} contentStyle={styles.todayContent}>
            <View style={[styles.todayIcon, signal.light && styles.todayIconDark]}><Ionicons name={signal.icon} size={19} color={signal.light ? 'white' : colors.pinkDeep}/></View>
            <View style={styles.todayCopy}><Text style={[styles.todayLabel, signal.light && styles.todayLight]}>{signal.label}</Text><Text numberOfLines={2} style={[styles.todayTitle, signal.light && styles.todayLight]}>{signal.title}</Text><Text style={[styles.todayMeta, signal.light && styles.todayMetaLight]}>{signal.meta}</Text></View>
          </SpringPressable>)}
        </ScrollView>
      </FadeIn>:null}

      {featureCards.length?<FadeIn delay={110}><View style={styles.featureHeading}>
        <View><Text style={styles.kicker}>{pickedSection?.eyebrow||'PICKED FOR YOU'}</Text><Text style={styles.featureTitle}>{pickedSection?.title||'What’s worth your time'}</Text></View>
        <Text style={styles.featureCount}>0{featuredIndex + 1} / 0{featureCards.length}</Text>
      </View>
      <ScrollView ref={featureScroller} horizontal decelerationRate="fast" snapToInterval={heroWidth + heroGap} showsHorizontalScrollIndicator={false} contentContainerStyle={styles.featureTrack} onMomentumScrollEnd={updateFeatured}>
        {featureCards.map((item, index) => <SpringPressable key={item.key} onPress={() => { void tapFeedback(); router.push(item.route); }} style={[styles.featureCard, { width: heroWidth, backgroundColor: item.tone }]} contentStyle={styles.featureContent}>
          {item.image ? <Image source={item.image} resizeMode="cover" style={styles.featureImage}/> : <View style={styles.typographicArt}><Text style={styles.artLetters}>CV</Text><View style={styles.artStar}><Ionicons name="sparkles" size={24} color="#FFD100"/></View></View>}
          <View style={styles.featureShade}/>
          <View style={styles.featureTop}><Text style={styles.featureLabel}>{item.label}</Text><View style={styles.featureNumber}><Text style={styles.featureNumberText}>0{index + 1}</Text></View></View>
          <View style={styles.featureBottom}><Text style={styles.featureCardTitle}>{item.title}</Text><Text style={styles.featureCopy}>{item.copy}</Text><View style={styles.featureAction}><Text style={styles.featureActionText}>{item.action}</Text><Ionicons name="arrow-forward" size={16} color={colors.ink}/></View></View>
        </SpringPressable>)}
      </ScrollView>
      <View style={styles.dots}>{featureCards.map((item, index) => <View key={item.key} style={[styles.paginationDot, index === featuredIndex && styles.paginationDotActive]}/>)}</View></FadeIn>:null}

      {!isMember ? benefitsSection : null}

      {isMember&&resumeItemCount ? <FadeIn delay={180}><View style={styles.sectionHead}><View><Text style={styles.kicker}>{activitySection?.eyebrow||'YOUR ACTIVITY'}</Text><Text style={styles.sectionTitle}>{activitySection?.title||'Pick up where you left off'}</Text></View><Pressable onPress={() => router.push(activitySection?.route||'/activity')}><Text style={styles.sectionLink}>{metaText(activitySection,'link','View all')}</Text></Pressable></View>
      <ScrollView ref={resumeScroller} horizontal decelerationRate="fast" snapToInterval={resumeWidth + 10} showsHorizontalScrollIndicator={false} contentContainerStyle={styles.resumeTrack} onScrollBeginDrag={() => pauseAutoScroll(resumePausedUntil)} onMomentumScrollEnd={(event) => { resumePosition.current = Math.round(event.nativeEvent.contentOffset.x / (resumeWidth + 10)); }}>
        {cvCourse?<SpringPressable onPress={() => { void tapFeedback(); router.push(`/course/${cvCourse.id}`); }} style={[styles.resumeCard, styles.resumeCardDark, { width: resumeWidth }]} contentStyle={styles.resumeContent}>
          <View style={styles.progressTop}><View style={styles.progressRing}><Text style={styles.progressNumber}>{cvPercent}%</Text></View><Ionicons name="arrow-up-outline" size={18} color="white"/></View>
          <Text style={styles.progressEyebrow}>{cvPercent === 100 ? 'CERTIFICATE READY' : courseProgress ? 'CONTINUE LEARNING' : 'START LEARNING'}</Text>
          <Text style={styles.progressTitle}>CV that gets noticed</Text>
          <Text style={styles.resumeMeta}>{cvPercent === 100 ? 'Course complete' : courseProgress ? `Lesson ${currentLessonIndex + 1} of ${cvCourse.lessons.length}` : '6 practical lessons'}</Text>
          <AnimatedProgress value={Math.max(cvPercent, 4)} height={4} color={colors.pink} trackColor="#3B3739" style={styles.progressTrack}/>
        </SpringPressable>:null}
        {firstResource?<SpringPressable onPress={() => { void tapFeedback(); router.push(`/resource/${firstResource.id}`); }} style={[styles.resumeCard, styles.resumeCardLavender, { width: resumeWidth }]} contentStyle={styles.resumeContent}>
          <View style={styles.resumeTop}><View style={styles.resumeIcon}><Ionicons name="document-text-outline" size={22} color="#6745D9"/></View><Ionicons name="arrow-forward" size={18} color={colors.ink}/></View>
          <Text style={[styles.resumeEyebrow, styles.resumeEyebrowPurple]}>{firstResource.type}</Text>
          <Text style={styles.resumeTitle}>{firstResource.title}</Text>
          <Text style={styles.resumeMetaLight}>{firstResource.meta}</Text>
        </SpringPressable>:null}
        {nextEvent||soonestEvent?<SpringPressable onPress={() => { const event=nextEvent??soonestEvent; if(event){void tapFeedback();router.push(`/event/${event.id}`)}}} style={[styles.resumeCard, styles.resumeCardPink, { width: resumeWidth }]} contentStyle={styles.resumeContent}>
          <View style={styles.resumeTop}><View style={styles.nextMoveIcon}><Ionicons name={nextEvent ? 'calendar' : 'calendar-outline'} size={21} color={colors.pinkDeep}/></View><Ionicons name="arrow-forward" size={18} color={colors.ink}/></View>
          <Text style={styles.nextMoveEyebrow}>{nextEvent ? 'YOUR NEXT EVENT' : 'HAPPENING SOON'}</Text>
          <Text numberOfLines={2} style={styles.nextMoveTitle}>{(nextEvent??soonestEvent)?.title}</Text>
          <Text style={styles.nextMoveMeta}>{eventCountdown((nextEvent??soonestEvent)?.startsAt) || (nextEvent??soonestEvent)?.dateShort}</Text>
        </SpringPressable>:null}
        {firstOpportunity?<SpringPressable onPress={() => { void tapFeedback(); router.push(`/opportunity/${firstOpportunity.id}`); }} style={[styles.resumeCard, styles.resumeCardWhite, { width: resumeWidth }]} contentStyle={styles.resumeContent}>
          <View style={styles.resumeTop}><View style={styles.resumeIconPink}><Ionicons name="briefcase-outline" size={22} color={colors.pinkDeep}/></View><Ionicons name="arrow-forward" size={18} color={colors.ink}/></View>
          <Text style={styles.nextMoveEyebrow}>CONTINUE EXPLORING</Text>
          <Text numberOfLines={2} style={styles.nextMoveTitle}>{firstOpportunity.title}</Text>
          <Text style={styles.resumeMetaLight}>{firstOpportunity.org}</Text>
        </SpringPressable>:null}
      </ScrollView></FadeIn> : null}

      {isMember ? opportunitiesSection : null}

      {memberWins.length?<FadeIn delay={230}><View style={styles.sectionHead}><View><Text style={styles.kicker}>{spotlightSection?.eyebrow||'SPOTLIGHT'}</Text><Text style={styles.sectionTitle}>{spotlightSection?.title||'GWMB Girls Making Moves'}</Text></View><Pressable onPress={() => router.push(spotlightSection?.route||'/member-wins')}><Text style={styles.sectionLink}>{metaText(spotlightSection,'link','See all wins')}</Text></Pressable></View>
      <ScrollView ref={memberWinsScroller} horizontal decelerationRate="fast" snapToInterval={heroWidth + heroGap} showsHorizontalScrollIndicator={false} contentContainerStyle={styles.spotlightTrack} onScrollBeginDrag={() => pauseAutoScroll(memberWinsPausedUntil)} onMomentumScrollEnd={(event) => { memberWinsPosition.current = Math.round(event.nativeEvent.contentOffset.x / (heroWidth + heroGap)); }}>
        {memberWins.map((win, index) => <SpringPressable key={win.id} onPress={() => { void tapFeedback(); router.push('/member-wins'); }} style={[styles.spotlightCard, { width: heroWidth }]} contentStyle={styles.spotlightContent}>
          {win.imageUrl?<Image source={{uri:win.imageUrl}} resizeMode="cover" style={styles.spotlightImage}/>:<View style={[styles.spotlightImage,styles.spotlightPlaceholder]}><Ionicons name="person-outline" size={48} color="white"/></View>}
          <View style={styles.spotlightShade}/>
          <View style={styles.spotlightTop}><View style={styles.spotlightBadge}><Ionicons name="star" size={13} color={colors.pinkDeep}/><Text style={styles.spotlightBadgeText}>{win.category}</Text></View><Text style={styles.spotlightIssue}>0{index + 1}</Text></View>
          <View style={styles.spotlightBottom}><Text style={styles.spotlightTitle}>{win.title}</Text><Text style={styles.spotlightCopy}>{win.copy}</Text><View style={styles.spotlightAction}><Ionicons name="arrow-forward" size={19} color={colors.ink}/></View></View>
        </SpringPressable>)}
      </ScrollView></FadeIn>:null}

      {isMember ? benefitsSection : opportunitiesSection}

      {communityPhotos.length?<FadeIn delay={390}>
        <View
          style={[styles.communityCard,{backgroundColor:metaText(communityInvite,'color','#A81455')}]}
        >
        <View style={styles.communityPatternOne}/><View style={styles.communityPatternTwo}/>
        <View style={styles.communityHeader}><View style={styles.communityIcon}><Ionicons name="people" size={22} color={colors.pinkDeep}/></View><Text style={styles.communityLive}>{communityInvite?.eyebrow||'REAL WOMEN · REAL COMMUNITY'}</Text></View>
        <Text style={styles.communityTitle}>{communityInvite?.title||'There’s room for you here.'}</Text>
        <Text style={styles.communityCopy}>{communityInvite?.summary||'Meet women learning, building and becoming together.'}</Text>
        <ScrollView ref={communityScroller} horizontal decelerationRate="fast" snapToInterval={116} showsHorizontalScrollIndicator={false} contentContainerStyle={styles.communityPhotoTrack} onScrollBeginDrag={() => pauseAutoScroll(communityPausedUntil)} onMomentumScrollEnd={(event) => { communityPosition.current = Math.round(event.nativeEvent.contentOffset.x / 116); }}>
          {communityPhotos.map((source,index)=><Pressable key={index} accessibilityLabel="Open the GWMB community" onPress={() => { void tapFeedback(); router.push('/community'); }} style={[styles.communityPhoto,index%3===1&&styles.communityPhotoRaised]}>{source?<Image source={source} resizeMode="cover" style={styles.communityImage}/>:<View style={[styles.communityImage,styles.communityImagePlaceholder]}><Ionicons name="image-outline" size={26} color="rgba(255,255,255,.72)"/></View>}<View style={styles.communityPhotoShade}/></Pressable>)}
        </ScrollView>
        <SpringPressable onPress={() => { void tapFeedback(); router.push(communityInvite?.route||'/community'); }} style={styles.communityButton} contentStyle={styles.communityButtonContent}><Text style={styles.communityButtonText}>{metaText(communityInvite,'cta','Join the community')}</Text><View style={styles.communityButtonArrow}><Ionicons name="arrow-forward" size={16} color={colors.ink}/></View></SpringPressable>
      </View></FadeIn>:null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  homeResolving:{flex:1,alignItems:'center',justifyContent:'center',paddingHorizontal:28},
  homeResolvingMark:{width:58,height:58,borderRadius:20,backgroundColor:colors.pinkSoft,alignItems:'center',justifyContent:'center'},
  homeResolvingTitle:{color:colors.ink,fontSize:18,fontFamily:fonts.headingBold,textAlign:'center',marginTop:17},
  homeResolvingCopy:{color:colors.muted,fontSize:11,lineHeight:17,fontFamily:fonts.body,textAlign:'center',marginTop:6,maxWidth:280},
  header:{flexDirection:'row',alignItems:'flex-start',justifyContent:'space-between',gap:12,marginTop:4,marginBottom:20},
  headerCopy:{flex:1,minWidth:0},dateLabel:{color:colors.pinkDeep,fontSize:10,fontFamily:fonts.bodyBold,letterSpacing:1.2},
  greeting:{color:colors.ink,fontSize:28,lineHeight:33,fontFamily:fonts.heading,letterSpacing:-1.15,marginTop:4},wave:{color:colors.pink},
  subGreeting:{color:colors.muted,fontSize:10,fontFamily:fonts.body,marginTop:4},headerActions:{flexDirection:'row',gap:8},
  roundButton:{width:41,height:41,borderRadius:21,backgroundColor:colors.surface,borderWidth:1,borderColor:colors.line,alignItems:'center',justifyContent:'center'},actionPressed:{backgroundColor:colors.pinkSoft},
  notificationDot:{position:'absolute',right:8,top:7,width:8,height:8,borderRadius:4,backgroundColor:colors.pink,borderWidth:2,borderColor:'white'},
  avatar:{width:41,height:41,borderRadius:21,backgroundColor:colors.ink,alignItems:'center',justifyContent:'center',borderWidth:2,borderColor:'white'},avatarPressed:{backgroundColor:colors.pinkDeep,transform:[{scale:.97}]},avatarImage:{width:37,height:37,borderRadius:19},avatarText:{color:'white',fontSize:10,fontFamily:fonts.heading},onlineDot:{position:'absolute',right:-1,bottom:0,width:11,height:11,borderRadius:6,backgroundColor:colors.green,borderWidth:2,borderColor:'white'},
  guestStrip:{minHeight:76,borderRadius:19,backgroundColor:colors.pinkSoft,padding:12,flexDirection:'row',alignItems:'center',marginBottom:20},guestIcon:{width:42,height:42,borderRadius:14,backgroundColor:'white',alignItems:'center',justifyContent:'center'},guestCopy:{flex:1,paddingHorizontal:11},guestTitle:{fontSize:13,fontFamily:fonts.headingBold,color:colors.ink},guestText:{fontSize:10,lineHeight:15,fontFamily:fonts.body,color:colors.muted,marginTop:3},
  journeyInvite:{minHeight:282,borderRadius:27,backgroundColor:colors.pinkDeep,padding:18,marginBottom:22,overflow:'hidden'},journeyInvitePressed:{backgroundColor:colors.pinkDark,transform:[{scale:.99}]},journeyInviteTop:{flexDirection:'row',alignItems:'center',justifyContent:'space-between'},journeyInviteIcon:{width:52,height:52,borderRadius:17,backgroundColor:'white',alignItems:'center',justifyContent:'center'},journeyInviteCount:{color:'#F7BED8',fontSize:9,fontFamily:fonts.bodyBold,letterSpacing:.9},journeyInviteKicker:{color:'#F7BED8',fontSize:9,fontFamily:fonts.bodyBold,letterSpacing:1,marginTop:25},journeyInviteTitle:{color:'white',fontSize:27,lineHeight:30,fontFamily:fonts.heading,letterSpacing:-1,marginTop:6,maxWidth:350},journeyInviteCopy:{color:'rgba(255,255,255,.82)',fontSize:11,lineHeight:17,fontFamily:fonts.body,marginTop:8,maxWidth:350},journeyInviteAction:{alignSelf:'flex-start',minHeight:43,borderRadius:14,backgroundColor:'white',paddingHorizontal:14,flexDirection:'row',alignItems:'center',gap:17,marginTop:17},journeyInviteActionText:{color:colors.ink,fontSize:11,fontFamily:fonts.bodyBold},
  todayHead:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',marginBottom:9},freshPill:{height:24,borderRadius:12,backgroundColor:'#EAF8F2',paddingHorizontal:8,flexDirection:'row',alignItems:'center',gap:5},freshDot:{width:6,height:6,borderRadius:3,backgroundColor:colors.green},freshText:{color:colors.green,fontSize:8,fontFamily:fonts.bodyBold,letterSpacing:.7},todayTrack:{gap:10,paddingRight:18,marginBottom:22},todayCard:{width:210,height:104,borderRadius:20,overflow:'hidden'},todayContent:{padding:12,flexDirection:'row',alignItems:'flex-start',gap:10},todayIcon:{width:38,height:38,borderRadius:13,backgroundColor:'white',alignItems:'center',justifyContent:'center'},todayIconDark:{backgroundColor:'rgba(255,255,255,.14)'},todayCopy:{flex:1,minWidth:0},todayLabel:{color:colors.pinkDeep,fontSize:8,fontFamily:fonts.bodyBold,letterSpacing:.75},todayTitle:{color:colors.ink,fontSize:12,lineHeight:15,fontFamily:fonts.headingBold,marginTop:3},todayMeta:{color:colors.muted,fontSize:9,fontFamily:fonts.bodyMedium,marginTop:'auto'},todayLight:{color:'white'},todayMetaLight:{color:'#C9C2C6'},
  featureHeading:{flexDirection:'row',alignItems:'flex-end',justifyContent:'space-between',marginBottom:12},kicker:{color:colors.pinkDeep,fontSize:10,fontFamily:fonts.bodyBold,letterSpacing:1.05},featureTitle:{color:colors.ink,fontSize:20,fontFamily:fonts.heading,letterSpacing:-.75,marginTop:4},featureCount:{color:colors.muted,fontSize:10,fontFamily:fonts.bodyBold,letterSpacing:.7},
  featureTrack:{gap:12,paddingRight:20},featureCard:{height:360,borderRadius:27,overflow:'hidden'},featureContent:{padding:18},featurePressed:{transform:[{scale:.985}]},featureImage:{position:'absolute',width:'100%',height:'100%'},featureShade:{position:'absolute',top:0,right:0,bottom:0,left:0,backgroundColor:'rgba(0,0,0,.29)'},typographicArt:{position:'absolute',top:0,right:0,bottom:0,left:0,overflow:'hidden'},artLetters:{position:'absolute',right:-15,top:45,color:'rgba(255,255,255,.09)',fontSize:150,fontFamily:fonts.heading,letterSpacing:-14},artStar:{position:'absolute',right:28,top:28},featureTop:{flexDirection:'row',justifyContent:'space-between',alignItems:'center'},featureLabel:{color:'white',fontSize:10,fontFamily:fonts.bodyBold,letterSpacing:1.05},featureNumber:{width:35,height:35,borderRadius:18,backgroundColor:'rgba(255,255,255,.17)',alignItems:'center',justifyContent:'center'},featureNumberText:{color:'white',fontSize:10,fontFamily:fonts.headingBold},featureBottom:{marginTop:'auto'},featureCardTitle:{color:'white',fontSize:28,lineHeight:30,fontFamily:fonts.heading,letterSpacing:-1.15,maxWidth:330},featureCopy:{color:'rgba(255,255,255,.88)',fontSize:12,lineHeight:18,fontFamily:fonts.body,marginTop:8,maxWidth:285},featureAction:{alignSelf:'flex-start',minHeight:42,borderRadius:14,backgroundColor:'white',paddingHorizontal:14,flexDirection:'row',alignItems:'center',gap:18,marginTop:17},featureActionText:{color:colors.ink,fontSize:11,fontFamily:fonts.bodyBold},dots:{height:27,flexDirection:'row',alignItems:'center',gap:5},paginationDot:{width:5,height:5,borderRadius:3,backgroundColor:'#D4CFD2'},paginationDotActive:{width:22,backgroundColor:colors.pink},
  sectionHead:{flexDirection:'row',alignItems:'flex-end',justifyContent:'space-between',marginTop:24,marginBottom:12},sectionTitle:{color:colors.ink,fontSize:19,fontFamily:fonts.heading,letterSpacing:-.65,marginTop:4},sectionLink:{color:colors.pinkDeep,fontSize:11,fontFamily:fonts.bodyBold,paddingBottom:2},swipeLabel:{color:colors.muted,fontSize:10,fontFamily:fonts.bodySemibold,paddingBottom:2},
  resumeTrack:{gap:10,paddingRight:20},resumeCard:{minHeight:190,borderRadius:23,overflow:'hidden'},resumeCardDark:{backgroundColor:colors.ink},resumeCardLavender:{backgroundColor:'#F0EFFF',borderWidth:1,borderColor:'#E0DDF7'},resumeCardPink:{backgroundColor:colors.pinkSoft,borderWidth:1,borderColor:'#F6DCE8'},resumeCardWhite:{backgroundColor:colors.surface,borderWidth:1,borderColor:colors.line},resumeContent:{padding:15},resumeTop:{flexDirection:'row',justifyContent:'space-between',alignItems:'flex-start'},resumeIcon:{width:43,height:43,borderRadius:14,backgroundColor:'white',alignItems:'center',justifyContent:'center'},resumeIconPink:{width:43,height:43,borderRadius:14,backgroundColor:colors.pinkSoft,alignItems:'center',justifyContent:'center'},resumeEyebrow:{fontSize:9,fontFamily:fonts.bodyBold,letterSpacing:.7,marginTop:18},resumeEyebrowPurple:{color:'#5741B8'},resumeTitle:{color:colors.ink,fontSize:15,lineHeight:19,fontFamily:fonts.headingBold,marginTop:5,maxWidth:230},resumeMeta:{color:'#BEB7BB',fontSize:10,fontFamily:fonts.bodyMedium,marginTop:5},resumeMetaLight:{color:colors.muted,fontSize:10,fontFamily:fonts.bodyMedium,marginTop:'auto'},progressTop:{flexDirection:'row',justifyContent:'space-between',alignItems:'flex-start'},progressRing:{width:53,height:53,borderRadius:27,borderWidth:5,borderColor:colors.pink,alignItems:'center',justifyContent:'center'},progressNumber:{color:'white',fontSize:11,fontFamily:fonts.headingBold},progressEyebrow:{color:'#F29BC3',fontSize:9,fontFamily:fonts.bodyBold,letterSpacing:.7,marginTop:15},progressTitle:{color:'white',fontSize:15,lineHeight:19,fontFamily:fonts.headingBold,marginTop:5},progressTrack:{marginTop:'auto'},progressFill:{height:'100%',backgroundColor:colors.pink},nextMoveIcon:{width:43,height:43,borderRadius:14,backgroundColor:'white',alignItems:'center',justifyContent:'center'},nextMoveEyebrow:{color:colors.pinkDeep,fontSize:9,fontFamily:fonts.bodyBold,letterSpacing:.7,marginTop:18},nextMoveTitle:{color:colors.ink,fontSize:15,lineHeight:19,fontFamily:fonts.headingBold,marginTop:5,maxWidth:230},nextMoveMeta:{color:colors.muted,fontSize:10,fontFamily:fonts.bodyBold,marginTop:'auto'},
  spotlightTrack:{gap:12,paddingRight:20},spotlightCard:{height:350,borderRadius:26,backgroundColor:colors.ink,overflow:'hidden'},spotlightContent:{padding:18},spotlightImage:{position:'absolute',top:0,right:0,bottom:0,width:'100%',height:'100%'},spotlightPlaceholder:{alignItems:'center',justifyContent:'center',backgroundColor:'#5A2B47'},spotlightShade:{position:'absolute',top:0,right:0,bottom:0,left:0,backgroundColor:'rgba(17,16,17,.48)'},spotlightTop:{flexDirection:'row',alignItems:'center',justifyContent:'space-between'},spotlightBadge:{minHeight:34,borderRadius:999,backgroundColor:'white',paddingHorizontal:11,flexDirection:'row',alignItems:'center',gap:6},spotlightBadgeText:{color:colors.ink,fontSize:9,fontFamily:fonts.bodyBold,letterSpacing:.55},spotlightIssue:{color:'white',fontSize:9,fontFamily:fonts.bodyBold,letterSpacing:.8},spotlightBottom:{marginTop:'auto'},spotlightTitle:{color:'white',fontSize:27,lineHeight:30,fontFamily:fonts.heading,letterSpacing:-1,maxWidth:300},spotlightCopy:{color:'rgba(255,255,255,.88)',fontSize:11,lineHeight:17,fontFamily:fonts.body,marginTop:8,maxWidth:315},spotlightTags:{flexDirection:'row',flexWrap:'wrap',gap:6,marginTop:13},spotlightTag:{borderRadius:999,backgroundColor:'rgba(255,255,255,.17)',paddingHorizontal:9,paddingVertical:6},spotlightTagText:{color:'white',fontSize:9,fontFamily:fonts.bodyBold},spotlightAction:{width:44,height:44,borderRadius:22,backgroundColor:'white',alignItems:'center',justifyContent:'center',marginTop:15},spotlightActionText:{color:colors.ink,fontSize:11,fontFamily:fonts.bodyBold},
  benefitsTrack:{gap:9,paddingRight:18},benefitStory:{height:184,borderRadius:22,padding:14,borderWidth:1,borderColor:'rgba(17,16,17,.06)',overflow:'hidden'},benefitStoryPressed:{transform:[{translateY:-2}]},benefitStoryTop:{flexDirection:'row',alignItems:'flex-start',justifyContent:'space-between'},benefitLargeIcon:{width:56,height:56,borderRadius:18,backgroundColor:'white',alignItems:'center',justifyContent:'center'},benefitStoryIndex:{color:'#918A8F',fontSize:9,fontFamily:fonts.bodyBold,letterSpacing:.7,marginTop:3},benefitStoryBottom:{marginTop:'auto'},benefitTitleRow:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:6},benefitStoryName:{flex:1,color:colors.ink,fontSize:16,lineHeight:20,fontFamily:fonts.headingBold,letterSpacing:-.4},benefitPromise:{color:colors.muted,fontSize:10,lineHeight:14,fontFamily:fonts.bodyMedium,marginTop:4},benefitLight:{color:'white'},benefitPromiseLight:{color:'rgba(255,255,255,.76)'},benefitArrow:{width:27,height:27,borderRadius:14,backgroundColor:colors.ink,alignItems:'center',justifyContent:'center'},benefitArrowLight:{backgroundColor:'white'},benefitProgress:{height:27,flexDirection:'row',alignItems:'center',gap:8,paddingHorizontal:4},benefitProgressCount:{color:colors.muted,fontSize:9,fontFamily:fonts.bodyBold},benefitProgressTrack:{flex:1,flexDirection:'row',alignItems:'center',gap:4},benefitProgressDot:{height:3,flex:1,borderRadius:2,backgroundColor:'#DED9DC'},benefitProgressDotActive:{backgroundColor:colors.pinkDeep},
  benefitsCta:{minHeight:70,borderRadius:19,backgroundColor:colors.ink,marginTop:11,overflow:'hidden'},benefitsCtaContent:{paddingHorizontal:16,flexDirection:'row',alignItems:'center',justifyContent:'space-between'},benefitsCtaPressed:{backgroundColor:colors.pinkDark},benefitsCtaLabel:{color:'#C4BDC1',fontSize:9,fontFamily:fonts.bodyBold,letterSpacing:.85},benefitsCtaTitle:{color:'white',fontSize:14,fontFamily:fonts.headingBold,marginTop:4},whiteArrow:{width:36,height:36,borderRadius:18,backgroundColor:'white',alignItems:'center',justifyContent:'center'},
  opportunityTrack:{gap:10,paddingRight:16},opportunityCard:{width:218,minHeight:224,borderRadius:23,backgroundColor:colors.surface,borderWidth:1,borderColor:colors.line,overflow:'hidden'},opportunityContent:{padding:15},opportunityCardPressed:{borderColor:colors.pink,backgroundColor:colors.blush,transform:[{translateY:-2}]},opportunityTop:{flexDirection:'row',justifyContent:'space-between',alignItems:'flex-start'},brandMark:{width:48,height:48,borderRadius:15,backgroundColor:colors.ink,alignItems:'center',justifyContent:'center'},brandMarkPink:{backgroundColor:colors.pinkDeep},brandInitials:{color:'white',fontSize:12,fontFamily:fonts.heading},brandInitialsLight:{color:'white'},deadlinePill:{borderRadius:999,backgroundColor:'#FFF0D8',paddingHorizontal:8,paddingVertical:6},urgentPill:{backgroundColor:colors.pinkDeep},deadlineText:{color:'#855900',fontSize:9,fontFamily:fonts.bodyBold},urgentText:{color:'white'},opportunityType:{color:colors.pinkDeep,fontSize:9,fontFamily:fonts.bodyBold,letterSpacing:.85,marginTop:17},opportunityTitle:{color:colors.ink,fontSize:15,lineHeight:19,fontFamily:fonts.headingBold,marginTop:6},opportunityOrg:{color:colors.muted,fontSize:10,fontFamily:fonts.bodyMedium,marginTop:5},opportunityFooter:{marginTop:'auto',paddingTop:13,borderTopWidth:1,borderTopColor:colors.line,flexDirection:'row',alignItems:'center',justifyContent:'space-between'},opportunityLocation:{color:colors.muted,fontSize:10,fontFamily:fonts.body},
  communityCard:{minHeight:475,borderRadius:26,backgroundColor:colors.pink,overflow:'hidden',marginTop:28,padding:20},communityPatternOne:{position:'absolute',width:190,height:190,borderRadius:95,borderWidth:36,borderColor:'rgba(255,255,255,.12)',right:-42,top:-57},communityPatternTwo:{position:'absolute',width:120,height:120,borderRadius:60,backgroundColor:'rgba(116,16,61,.2)',left:-38,bottom:-42},communityHeader:{flexDirection:'row',alignItems:'center',gap:10},communityIcon:{width:44,height:44,borderRadius:15,backgroundColor:'white',alignItems:'center',justifyContent:'center'},communityLive:{color:'#FFF0F7',fontSize:9,fontFamily:fonts.bodyBold,letterSpacing:.9},communityTitle:{color:'white',fontSize:25,lineHeight:28,fontFamily:fonts.heading,letterSpacing:-.9,marginTop:20,maxWidth:310},communityCopy:{color:'rgba(255,255,255,.9)',fontSize:11,lineHeight:17,fontFamily:fonts.body,marginTop:7,maxWidth:320},communityPhotoTrack:{gap:8,paddingRight:16,marginTop:18,minHeight:154},communityPhoto:{width:108,height:140,borderRadius:18,overflow:'hidden',backgroundColor:'#7A0D3E'},communityPhotoRaised:{marginTop:12},communityImage:{width:'100%',height:'100%'},communityImagePlaceholder:{backgroundColor:'rgba(17,16,17,.32)',alignItems:'center',justifyContent:'center'},communityPhotoShade:{position:'absolute',top:0,right:0,bottom:0,left:0,backgroundColor:'rgba(17,16,17,.08)'},communityButton:{height:58,borderRadius:18,backgroundColor:colors.ink,overflow:'hidden',marginTop:20},communityButtonContent:{paddingHorizontal:16,flexDirection:'row',alignItems:'center',justifyContent:'space-between'},communityButtonText:{color:'white',fontSize:12,fontFamily:fonts.bodyBold},communityButtonArrow:{width:34,height:34,borderRadius:17,backgroundColor:'white',alignItems:'center',justifyContent:'center'},
});
