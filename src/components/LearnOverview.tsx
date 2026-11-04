import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, usePathname, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { PageHeader } from '@/components/PageHeader';
import { Screen } from '@/components/Screen';
import { CliquePromoStrip } from '@/components/CliquePromoStrip';
import { DestinationHeader } from '@/components/DestinationHeader';
import type { Course } from '@/data/courses';
import type { CliqueCategory as CommunityCliqueCategory } from '@/data/cliques';
import { upcomingEvents, type GwmbEvent } from '@/data/events';
import { demoMentorshipSessions, type MentorshipSession } from '@/data/mentorship';
import { coursePercent, loadAllCourseProgress, type CourseProgress } from '@/lib/course-progress';
import { useCourseCatalog } from '@/lib/course-runtime';
import { loadEventRegistrations, type EventRegistration } from '@/lib/event-store';
import { loadMentorshipRegistrations, loadMentorshipSessions, type MentorshipRegistration } from '@/lib/mentorship-store';
import { useAuth } from '@/providers/AuthProvider';
import { colors, fonts } from '@/theme';
import { AppStateView } from '@/components/states/AppStateView';
import { CareerReadinessHub } from '@/components/CareerReadinessHub';
import { cmsEvent, usePublishedContent } from '@/lib/content-runtime';

type LearnSection = 'courses' | 'career-readiness' | 'live' | 'templates' | 'resources';
type CourseArea = 'tech-digital' | 'business' | 'creative' | 'professional' | 'personal-growth' | 'smart-money' | 'leadership';
type ProgrammeCategory = 'All' | 'Career Support' | 'Discovery Mentorship' | 'Personal Growth' | 'Smart Money Girl' | 'Leadership' | 'Clique Firesides' | 'Professional Learning';
type AccessFilter = 'All access' | 'Registered' | 'Members Only' | 'Open';

const sections: { id: LearnSection; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { id: 'courses', label: 'Certificate Courses', icon: 'ribbon-outline' },
  { id: 'career-readiness', label: 'Career Readiness', icon: 'briefcase-outline' },
  { id: 'live', label: 'Live sessions', icon: 'radio-outline' },
  { id: 'templates', label: 'Templates', icon: 'copy-outline' },
  { id: 'resources', label: 'Resources', icon: 'library-outline' },
];

const learningHubLoadedAt = Date.now();

const categoryGroups: { title: string; items: { id: CourseArea; label: string; icon: keyof typeof Ionicons.glyphMap }[] }[] = [
  { title: 'Learning areas', items: [
    { id: 'tech-digital', label: 'Tech & Digital', icon: 'hardware-chip-outline' },
    { id: 'creative', label: 'Creative', icon: 'color-palette-outline' },
    { id: 'business', label: 'Business', icon: 'briefcase-outline' },
    { id: 'professional', label: 'Professional', icon: 'ribbon-outline' },
  ] },
  { title: 'Development courses', items: [
    { id: 'personal-growth', label: 'Personal growth', icon: 'leaf-outline' },
    { id: 'smart-money', label: 'Smart Money Girl', icon: 'wallet-outline' },
    { id: 'leadership', label: 'Leadership', icon: 'people-outline' },
  ] },
];

const courseSubcategories: Record<CourseArea, string[]> = {
  'tech-digital': ['Career Discovery', 'Software', 'Data & AI', 'Product', 'Marketing', 'Social Media', 'No-code'],
  creative: ['Creative Practice', 'Design', 'Writing', 'Media'],
  business: ['Business Foundations', 'Entrepreneurship', 'Operations', 'Sales'],
  professional: ['Career Readiness', 'Communication', 'Workplace Skills'],
  'personal-growth': ['Confidence', 'Goals', 'Wellbeing'],
  'smart-money': ['Budgeting', 'Income', 'Saving'],
  leadership: ['Self Leadership', 'Teams', 'Community'],
};

const categoryPalettes: Record<CourseArea, { surface:string; accent:string }> = {
  'tech-digital':{surface:'#DDEBFF',accent:'#1266D6'},
  creative:{surface:'#FFE4EC',accent:'#C83D61'},
  business:{surface:'#DDF5EF',accent:'#168A72'},
  professional:{surface:'#FFF0C9',accent:'#A96900'},
  'personal-growth':{surface:'#FCE3EF',accent:'#A81455'},
  'smart-money':{surface:'#FFF0C9',accent:'#A96900'},
  leadership:{surface:'#E6F3E9',accent:'#16724F'},
};

const programmeCategories: ProgrammeCategory[] = ['All','Career Support','Discovery Mentorship','Personal Growth','Smart Money Girl','Leadership','Clique Firesides','Professional Learning'];

function eventProgramme(type: string, title: string): ProgrammeCategory {
  const value = `${type} ${title}`.toLowerCase();
  if (value.includes('cv') || value.includes('career clinic')) return 'Career Support';
  if (value.includes('mentorship') || value.includes('product manager')) return 'Discovery Mentorship';
  if (value.includes('money') || value.includes('income')) return 'Smart Money Girl';
  if (value.includes('leadership')) return 'Leadership';
  if (value.includes('clique') || value.includes('sister circle') || value.includes('community')) return 'Clique Firesides';
  if (value.includes('growth') || value.includes('progress') || value.includes('accountability')) return 'Personal Growth';
  return 'Professional Learning';
}

function courseMatchesArea(course: Course, area: CourseArea | null) {
  if (!area) return true;
  if (area === 'tech-digital') return course.category === 'tech' || course.category === 'digital';
  return course.category === area;
}

const coursePalettes: Record<string, { surface: string; accent: string }> = {
  'workplace-foundations': { surface: '#F8CADF', accent: '#8F174B' },
  'public-speaking': { surface: '#D6DEFF', accent: '#294ED1' },
  budgeting: { surface: '#FFE3A3', accent: '#8A5700' },
  'self-leadership': { surface: '#CDEBDD', accent: '#116343' },
  'tech-foundations': { surface: '#C7DBFF', accent: '#0E55BB' },
  'digital-marketing': { surface: '#DFD0FF', accent: '#6537C7' },
  'creative-thinking': { surface: '#FBCBD8', accent: '#B62D53' },
  'business-basics': { surface: '#C7EBDD', accent: '#10745F' },
  'confidence-in-action': { surface: '#F6CBDF', accent: '#94154B' },
};

const resources = [
  { id: 'cv-application-guide', type: 'GUIDE', title: 'The CV Application Guide', meta: 'PDF · 9 pages', icon: 'document-text-outline' as const, surface: '#FCE3EF', accent: '#A81455' },
  { id: 'weekly-planning', type: 'TEMPLATE', title: 'The Weekly Planning Template', meta: 'PDF · 5 pages', icon: 'calendar-outline' as const, surface: '#EFE8FF', accent: '#6035A6' },
  { id: 'monthly-budget-workbook', type: 'WORKBOOK', title: 'Your Monthly Money Workbook', meta: 'Editable · 12 pages', icon: 'wallet-outline' as const, surface: '#FFF0C9', accent: '#9A6100' },
  { id: 'first-job-playbook', type: 'BOOK', title: 'The First Job Playbook', meta: 'Digital book · 28 pages', icon: 'book-outline' as const, surface: '#E2F2FF', accent: '#1767A0' },
  { id: 'presentation-practice', type: 'WORKBOOK', title: 'Presentation Practice Planner', meta: 'PDF · 8 pages', icon: 'mic-outline' as const, surface: '#FCE3EF', accent: '#A81455' },
  { id: 'better-goals', type: 'GUIDE', title: 'A Better Way to Set Goals', meta: '8 min read', icon: 'flag-outline' as const, surface: '#E6F7EE', accent: '#14704C' },
  { id: 'conflict-guide', type: 'GUIDE', title: 'Communicating Through Conflict', meta: '12 min read', icon: 'chatbubbles-outline' as const, surface: '#F1ECE8', accent: '#6C4632' },
];

function rowsOfTwo<T>(items: T[]) {
  const rows: T[][] = [];
  for (let index = 0; index < items.length; index += 2) rows.push(items.slice(index, index + 2));
  return rows;
}

function SectionHeading({ eyebrow, title, action }: { eyebrow?: string; title: string; action?: string }) {
  return <View style={styles.sectionHeading}><View>{eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}<Text style={styles.sectionTitle}>{title}</Text></View>{action ? <Text style={styles.headingAction}>{action}</Text> : null}</View>;
}

function FeaturedCourse({ course, progress }: { course: Course; progress: number }) {
  const router = useRouter();
  const { user, membership } = useAuth();
  const locked = course.access === 'MEMBERS ONLY' && membership?.status !== 'verified';
  const hasMembershipRecord = Boolean(membership);
  const open = () => router.push(!user ? '/sign-in' : locked ? (hasMembershipRecord ? '/verify-membership' : '/membership') : `/course/${course.id}`);
  return <Pressable onPress={open} style={[styles.featuredCourse, { backgroundColor: course.tone }, locked && styles.featuredCourseLocked]}>
    <View style={styles.featuredOrbLarge} /><View style={styles.featuredOrbSmall} />
    <View style={styles.featuredTop}><View style={[styles.featuredIcon,{borderRadius:999}]}><Ionicons name="play" size={20} color={course.tone} style={{marginLeft:2}}/></View><View style={styles.arrowCircle}><Ionicons name="arrow-forward" size={19} color="white" /></View></View>
    <Text style={styles.featuredEyebrow}>{locked ? 'MEMBERS ONLY · UNLOCK TO LEARN' : progress > 0 ? 'CONTINUE LEARNING' : 'RECOMMENDED FOR YOU'}</Text>
    <Text style={styles.featuredTitle}>{course.title}</Text>
    <View style={styles.courseSourceRow}><Text style={styles.featuredSource}>{course.source}</Text>{course.benefits.slice(0,2).map(item=><Text key={item} style={styles.featuredBenefit}>{item}</Text>)}</View>
    <View style={styles.featuredMeta}><Ionicons name="time-outline" size={14} color="white" /><Text style={styles.featuredMetaText}>{course.duration}</Text><View style={styles.metaDot} /><Ionicons name="reader-outline" size={14} color="white" /><Text style={styles.featuredMetaText}>{course.lessons.length} lessons</Text></View>
    {locked ? <View style={styles.featuredLock}><Ionicons name="lock-closed" size={14} color={colors.ink}/><Text style={styles.featuredLockText}>{!user ? 'Sign in to unlock' : hasMembershipRecord ? 'Verify Membership' : 'Explore Membership'}</Text><Ionicons name="arrow-forward" size={15} color={colors.ink}/></View> : progress > 0 ? <View style={styles.progressRow}><View style={styles.progressTrack}><View style={[styles.progressFill, { width: `${progress}%` }]} /></View><Text style={styles.progressLabel}>{progress}%</Text></View> : null}
  </Pressable>;
}

function CourseTile({ course }: { course: Course }) {
  const router = useRouter();
  const { user, membership } = useAuth();
  const locked = course.access === 'MEMBERS ONLY' && membership?.status !== 'verified';
  const palette = coursePalettes[course.id] ?? { surface: '#F2EFF1', accent: course.tone };
  const hasMembershipRecord = Boolean(membership);
  const open = () => router.push(!user ? '/sign-in' : locked ? (hasMembershipRecord ? '/verify-membership' : '/membership') : `/course/${course.id}`);
  return <Pressable onPress={open} style={[styles.courseTile, { backgroundColor: palette.surface }, locked && styles.courseTileLocked]}>
    <View style={[styles.courseTileShape, { backgroundColor: palette.accent }]} />
    <View style={styles.courseTileTop}><View style={[styles.courseTileIcon,{borderRadius:999,borderWidth:1,borderColor:`${palette.accent}24`}]}><Ionicons name="play" size={21} color={palette.accent} style={{marginLeft:2}}/></View>{locked ? <View style={styles.accessBadgeLocked}><Ionicons name="lock-closed" size={9} color="white"/><Text style={styles.courseAccessLocked}>MEMBERS</Text></View> : <View style={{width:27,height:27,borderRadius:14,backgroundColor:'rgba(255,255,255,.42)',alignItems:'center',justifyContent:'center'}}><Ionicons name="arrow-forward" size={14} color={palette.accent}/></View>}</View>
    <Text style={styles.courseTileTitle}>{course.title}</Text>
    <Text style={[styles.courseSource, { color: palette.accent }]}>{course.source}</Text>
    <View style={styles.courseTileMeta}>
      <View style={styles.courseTileMetaRow}><Ionicons name="time-outline" size={13} color={palette.accent} /><Text style={styles.courseTileMetaText}>{course.duration}</Text></View>
      <View style={styles.courseTileMetaRow}><Ionicons name="reader-outline" size={13} color={palette.accent} /><Text style={styles.courseTileMetaText}>{course.lessons.length} lessons</Text></View>
    </View>
    <View style={styles.courseBenefits}>{course.benefits.slice(0,2).map(item=><Text key={item} style={styles.courseBenefit}>{item}</Text>)}</View>
    {locked ? <View style={styles.tileUnlock}><Text style={styles.tileUnlockText}>{!user ? 'Sign in to unlock' : hasMembershipRecord ? 'Verify Membership' : 'Explore Membership'}</Text><Ionicons name="arrow-forward" size={14} color={palette.accent}/></View> : null}
  </Pressable>;
}

function ProgressCourse({ course, progress }: { course: Course; progress: number }) {
  const router = useRouter();
  return <Pressable onPress={() => router.push(`/course/${course.id}`)} style={[styles.progressCourse, { backgroundColor: course.tone }]}>
    <View style={styles.progressCourseCopy}><Text style={styles.progressCourseLabel}>{course.eyebrow}</Text><Text style={styles.progressCourseTitle}>{course.title}</Text><View style={styles.progressRow}><View style={styles.progressTrack}><View style={[styles.progressFill, { width: `${progress}%` }]} /></View><Text style={styles.progressLabel}>{progress}%</Text></View></View>
    <View style={styles.progressArrow}><Ionicons name="arrow-forward" size={19} color="white" /></View>
  </Pressable>;
}

function MyCoursesPanel({ progress }: { progress: CourseProgress[] }) {
  const router = useRouter();
  const { user } = useAuth();
  const courseCatalog=useCourseCatalog();
  const [view, setView] = useState<'current' | 'completed'>('current');
  const enrolled = progress.map(item => ({ progress:item, course:courseCatalog[item.course_id] })).filter(item => Boolean(item.course));
  const visible = enrolled.filter(item => view === 'completed' ? Boolean(item.progress.completed_at) : !item.progress.completed_at);
  return <View style={styles.myCourses}>
    <View style={styles.myCoursesHead}><View><Text style={styles.eyebrow}>YOUR LEARNING</Text><Text style={styles.myCoursesTitle}>My Courses</Text></View><Text style={styles.myCoursesCount}>{enrolled.length} {enrolled.length === 1 ? 'course' : 'courses'}</Text></View>
    <View style={styles.myCourseTabs}><Pressable onPress={() => setView('current')} style={[styles.myCourseTab, view === 'current' && styles.myCourseTabActive]}><Text style={[styles.myCourseTabText, view === 'current' && styles.myCourseTabTextActive]}>Current</Text></Pressable><Pressable onPress={() => setView('completed')} style={[styles.myCourseTab, view === 'completed' && styles.myCourseTabActive]}><Text style={[styles.myCourseTabText, view === 'completed' && styles.myCourseTabTextActive]}>Completed</Text></Pressable><View style={styles.myCoursesViewIcon}><Ionicons name="grid-outline" size={16} color={colors.ink}/></View></View>
    {visible.length ? <View style={styles.stack}>{visible.map(item => <ProgressCourse key={item.course.id} course={item.course} progress={coursePercent(item.progress,item.course.lessons.length)} />)}</View> : <Pressable onPress={() => { if (!user) router.push('/sign-in'); }} style={styles.myCoursesEmpty}><View style={styles.myCoursesEmptyIcon}><Ionicons name={view === 'completed' ? 'ribbon-outline' : 'book-outline'} size={21} color={colors.pinkDeep}/></View><View style={styles.myCoursesEmptyCopy}><Text style={styles.myCoursesEmptyTitle}>{!user ? 'Sign in to save your learning' : view === 'completed' ? 'No completed courses yet' : 'Your courses will appear here'}</Text><Text style={styles.myCoursesEmptyText}>{!user ? 'Keep your course progress available across devices.' : view === 'completed' ? 'Finish every lesson to move a course here.' : 'Start any course below and return exactly where you stopped.'}</Text></View>{!user?<Ionicons name="arrow-forward" size={17} color={colors.ink}/>:null}</Pressable>}
  </View>;
}

function CourseCategoryPicker({ selected, subcategory, onSelect, onSelectSubcategory }: { selected: CourseArea | null; subcategory: string | null; onSelect: (value: CourseArea | null) => void; onSelectSubcategory: (value: string | null) => void }) {
  const subcategories = selected ? courseSubcategories[selected] : [];
  const [showAll, setShowAll] = useState(false);
  const [hoveredCategory, setHoveredCategory] = useState<CourseArea | null>(null);
  const developmentIds = categoryGroups[1].items.map(item => item.id);
  const toggleAll = () => {
    if (showAll && selected && developmentIds.includes(selected)) { onSelect(null); onSelectSubcategory(null); }
    setShowAll(value => !value);
  };
  const renderCategory = (item:typeof categoryGroups[number]['items'][number], compact=false) => {
    const active=selected===item.id;
    const palette=categoryPalettes[item.id];
    return <Pressable key={item.id} onHoverIn={()=>setHoveredCategory(item.id)} onHoverOut={()=>setHoveredCategory(current=>current===item.id?null:current)} onPress={()=>{onSelect(active?null:item.id);onSelectSubcategory(null)}} style={({pressed})=>[compact?styles.categoryItemCompact:styles.categoryItem,{backgroundColor:active||hoveredCategory===item.id||pressed?palette.surface:'#F8F7F8',borderColor:active?palette.accent:colors.line},active&&styles.categoryItemActive]}><Ionicons name={item.icon} size={compact?22:25} color={active||hoveredCategory===item.id?palette.accent:'#575257'}/><Text style={[styles.categoryLabel,compact&&styles.categoryLabelCompact]} numberOfLines={2}>{item.label}</Text></Pressable>;
  };
  return <View style={styles.categoryArea}>
    <View style={styles.categoryIntro}><View><Text style={styles.eyebrow}>BROWSE BY CATEGORY</Text><Text style={styles.categoryTitle}>Course categories</Text></View><Pressable onPress={toggleAll} hitSlop={8}><Text style={styles.clearCategory}>{showAll ? 'See less' : 'View all'}</Text></Pressable></View>
    <View style={styles.categoryGroup}>
      <View style={styles.categoryRailHead}><Text style={styles.categoryGroupTitle}>CAREER LEARNING AREAS</Text><Text style={styles.categoryRailMeta}>4 areas</Text></View>
      <View style={styles.categoryCoreRow}>{categoryGroups[0].items.map(item=>renderCategory(item,true))}</View>
    </View>
    {showAll?<View style={styles.categoryExtraGroup}><View style={styles.categoryExtraHead}><View><Text style={styles.categoryGroupTitle}>GROWTH & DEVELOPMENT</Text><Text style={styles.categoryExtraCopy}>Learning beyond your career path</Text></View><View style={styles.categoryExtraCount}><Text style={styles.categoryExtraCountText}>3</Text></View></View><View style={styles.categoryExtraRow}>{categoryGroups[1].items.map(item=>renderCategory(item))}</View></View>:null}
    {selected && subcategories.length ? <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.subcategories}>
      <Pressable onPress={() => onSelectSubcategory(null)} style={[styles.subcategory, !subcategory && styles.subcategoryActive]}><Text style={[styles.subcategoryText, !subcategory && styles.subcategoryTextActive]}>All</Text></Pressable>
      {subcategories.map(item => <Pressable key={item} onPress={() => onSelectSubcategory(item)} style={[styles.subcategory, subcategory === item && styles.subcategoryActive]}><Text style={[styles.subcategoryText, subcategory === item && styles.subcategoryTextActive]}>{item}</Text></Pressable>)}
    </ScrollView> : null}
  </View>;
}

function CoursesPanel({ query, progress, category, subcategory, onSelectCategory, onSelectSubcategory }: { query: string; progress: CourseProgress[]; category: CourseArea | null; subcategory: string | null; onSelectCategory: (value: CourseArea | null) => void; onSelectSubcategory: (value: string | null) => void }) {
  const courseCatalog=useCourseCatalog();
  const list = useMemo(() => Object.values(courseCatalog).filter(course => {
    const matchesQuery = `${course.title} ${course.eyebrow} ${course.category} ${course.subcategory}`.toLowerCase().includes(query.toLowerCase());
    return matchesQuery && courseMatchesArea(course, category) && (!subcategory || course.subcategory === subcategory);
  }), [category,courseCatalog,query,subcategory]);
  const progressFor = (course: Course) => coursePercent(progress.find(item => item.course_id === course.id) ?? null, course.lessons.length);
  const recommended = list.find(course => progressFor(course) > 0) ?? list[0];
  return <View>
    <CourseCategoryPicker selected={category} subcategory={subcategory} onSelect={onSelectCategory} onSelectSubcategory={onSelectSubcategory} />
    <MyCoursesPanel progress={progress} />
    {!recommended ? <EmptyState icon="search-outline" title="No courses found" copy="Try another topic, category or skill." /> : <>
    <SectionHeading eyebrow="START HERE" title="Recommended for you" />
    <FeaturedCourse course={recommended} progress={progressFor(recommended)} />
    <SectionHeading title="Explore courses" action={`${list.length} courses`} />
    <View style={styles.courseGrid}>{rowsOfTwo(list).map((row, rowIndex) => <View key={`course-row-${rowIndex}`} style={styles.twoColumnRow}>
      {row.map(course => <CourseTile key={course.id} course={course} />)}
      {row.length === 1 ? <View style={styles.twoColumnSpacer} /> : null}
    </View>)}</View>
    </>}
    {category && ['tech-digital','creative','business','professional'].includes(category) ? <CliquePromoStrip category={(category === 'tech-digital' ? 'tech' : category) as CommunityCliqueCategory} /> : null}
  </View>;
}

function FilterRail<T extends string>({ items, selected, onSelect }: { items: readonly T[]; selected: T; onSelect: (item:T)=>void }) {
  return <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRail}>{items.map(item=><Pressable key={item} onPress={()=>onSelect(item)} style={[styles.filterChip,selected===item&&styles.filterChipActive]}><Text style={[styles.filterChipText,selected===item&&styles.filterChipTextActive]}>{item}</Text></Pressable>)}</ScrollView>;
}

function LivePanel({ query, registrations, mentorshipRegistrations, mentorshipSessions, cmsEvents, cmsRegistrationIds }: { query: string; registrations: EventRegistration[]; mentorshipRegistrations:MentorshipRegistration[]; mentorshipSessions:MentorshipSession[];cmsEvents:GwmbEvent[];cmsRegistrationIds:Record<string,string> }) {
  const router = useRouter();
  const [programme,setProgramme]=useState<ProgrammeCategory>('All');
  const [access,setAccess]=useState<AccessFilter>('All access');
  const registeredIds=useMemo(()=>new Set(registrations.filter(item=>item.status!=='cancelled').map(item=>item.event_id)),[registrations]);
  const now=learningHubLoadedAt;
  const liveEvents=[...cmsEvents,...upcomingEvents.filter(event=>!cmsEvents.some(item=>item.id===event.id))];
  const list = liveEvents.filter(event => {
    const start=event.startsAt?new Date(event.startsAt).getTime():Number.NaN;
    const current=Number.isFinite(start)&&start+2*60*60*1000>=now;
    const registered=registeredIds.has(event.id)||registeredIds.has(cmsRegistrationIds[event.id]);
    const matchesAccess=access==='All access'||(access==='Registered'&&registered)||(access==='Members Only'&&event.access==='Members Only')||(access==='Open'&&event.access==='Open Access');
    return current&&(programme==='All'||eventProgramme(event.type,event.title)===programme)&&matchesAccess&&`${event.title} ${event.type} ${event.copy} ${eventProgramme(event.type,event.title)}`.toLowerCase().includes(query.toLowerCase());
  }).sort((a,b)=>new Date(a.startsAt??a.date).getTime()-new Date(b.startsAt??b.date).getTime());
  const cardColors=[{border:'#D990B0',surface:'#FFF0F7'},{border:'#D4B45B',surface:'#FFF6D9'},{border:'#829FE1',surface:'#EEF3FF'},{border:'#75BEA7',surface:'#EAF8F3'}];
  const mentorshipIds=new Set(mentorshipRegistrations.filter(item=>item.status!=='cancelled').map(item=>item.session_id));
  const mentorshipList=mentorshipSessions.filter(item=>item.status!=='completed'&&(programme==='All'||programme==='Discovery Mentorship')&&(access==='All access'||(access==='Registered'&&mentorshipIds.has(item.id))||(access==='Members Only'&&item.access_level==='members')||(access==='Open'&&item.access_level==='open'))&&`${item.title} ${item.industry} ${item.description}`.toLowerCase().includes(query.toLowerCase()));
  const empty=!list.length&&!mentorshipList.length;
  return <View><SectionHeading eyebrow="LEARN TOGETHER" title="Upcoming live sessions"/><Text style={styles.sectionCopy}>Interactive workshops, clinics, mentorship conversations and community sessions.</Text><Text style={styles.filterLabel}>PROGRAMME</Text><FilterRail items={programmeCategories} selected={programme} onSelect={setProgramme}/><Text style={styles.filterLabel}>ACCESS & STATUS</Text><FilterRail items={['All access','Registered','Members Only','Open'] as const} selected={access} onSelect={setAccess}/>{empty?<EmptyState icon="calendar-outline" title="No live sessions found" copy="Try another programme or access filter."/>:<View style={styles.stack}>{mentorshipList.map((item,index)=>{const date=new Date(item.starts_at);const registered=mentorshipIds.has(item.id);return <Pressable key={item.id} onPress={()=>router.push(`/mentorship-session/${item.id}`)} style={[styles.liveCard,{borderColor:cardColors[index%cardColors.length].border,backgroundColor:cardColors[index%cardColors.length].surface}]}><View style={[styles.dateTile,{backgroundColor:'#7047D8'}]}><Text style={[styles.dateDay,styles.whiteText]}>{date.getDate()}</Text><Text style={[styles.dateMonth,styles.whiteText]}>{date.toLocaleDateString('en-NG',{month:'short'}).toUpperCase()}</Text></View><View style={styles.liveCopy}><View style={styles.liveStateRow}><Text style={[styles.liveType,{color:'#7047D8'}]}>DISCOVERY MENTORSHIP</Text><Text style={[styles.sessionState,registered&&styles.sessionStateStrong]}>{registered?'Seat Saved ✓':'Save My Seat'}</Text></View><Text style={styles.liveTitle}>{item.title}</Text><View style={styles.detailRow}><Ionicons name="time-outline" size={14} color={colors.muted}/><Text style={styles.detailText}>{date.toLocaleDateString('en-NG',{weekday:'short',day:'numeric',month:'short',hour:'numeric',minute:'2-digit'})}</Text></View><View style={styles.detailRow}><Ionicons name={item.access_level==='members'?'lock-closed-outline':'lock-open-outline'} size={14} color={colors.muted}/><Text style={styles.detailText}>{item.access_level==='members'?'Members Only':'Open Access'}</Text></View></View><Ionicons name="chevron-forward" size={20} color={colors.ink}/></Pressable>})}{list.map((event,index)=>{const start=event.startsAt?new Date(event.startsAt).getTime():Number.NaN;const registered=registeredIds.has(event.id);const live=Number.isFinite(start)&&start<=now&&start+2*60*60*1000>=now;const startsSoon=Number.isFinite(start)&&start>now&&start-now<=24*60*60*1000;const state=live?'Live Now':registered?'Registered ✓':startsSoon?'Starts Soon':'Open for Registration';return <Pressable key={event.id} onPress={()=>router.push(`/event/${event.id}`)} style={[styles.liveCard,{borderColor:cardColors[(index+mentorshipList.length)%cardColors.length].border,backgroundColor:cardColors[(index+mentorshipList.length)%cardColors.length].surface}]}><View style={[styles.dateTile,{backgroundColor:event.tone}]}><Text style={[styles.dateDay,styles.whiteText]}>{event.day}</Text><Text style={[styles.dateMonth,styles.whiteText]}>{event.month}</Text></View><View style={styles.liveCopy}><View style={styles.liveStateRow}><Text style={[styles.liveType,{color:event.tone}]}>{eventProgramme(event.type,event.title).toUpperCase()}</Text><Text style={[styles.sessionState,(live||registered)&&styles.sessionStateStrong]}>{state}</Text></View><Text style={styles.liveTitle}>{event.title}</Text><View style={styles.detailRow}><Ionicons name="time-outline" size={14} color={colors.muted}/><Text style={styles.detailText}>{event.dateShort}</Text></View><View style={styles.detailRow}><Ionicons name="lock-open-outline" size={14} color={colors.muted}/><Text style={styles.detailText}>{event.access}</Text></View></View><Ionicons name="chevron-forward" size={20} color={colors.ink}/></Pressable>})}</View>}</View>;
}

function ResourcesPanel({ query,mode }: { query: string;mode:'templates'|'resources' }) {
  const router = useRouter();
  const templateTypes=new Set(['TEMPLATE','WORKBOOK']);
  const list = resources.filter(item => (mode==='templates'?templateTypes.has(item.type):!templateTypes.has(item.type))&&`${item.title} ${item.type}`.toLowerCase().includes(query.toLowerCase()));
  if (!list.length) return <EmptyState icon={mode==='templates'?'copy-outline':'library-outline'} title={mode==='templates'?'No templates found':'No resources found'} copy="Try a different title or format." />;
  return <View>
    <SectionHeading eyebrow={mode==='templates'?'READY TO USE':'READ, WATCH & EXPLORE'} title={mode==='templates'?'Templates & workbooks':'Resources'} />
    <Text style={styles.sectionCopy}>{mode==='templates'?'Practical tools you can save, complete and reuse.':'Guides, books and supporting material for your growth.'}</Text>
    <View style={styles.resourceGrid}>{rowsOfTwo(list).map((row, rowIndex) => <View key={`resource-row-${rowIndex}`} style={styles.twoColumnRow}>
      {row.map(item => <Pressable key={item.id} onPress={() => router.push(`/resource/${item.id}`)} style={[styles.resourceCard, { backgroundColor: item.surface }]}> 
        <View style={[styles.resourceIcon, { backgroundColor: item.accent }]}><Ionicons name={item.icon} size={23} color="white" /></View><Text style={[styles.resourceType, { color: item.accent }]}>{item.type}</Text><Text style={styles.resourceTitle}>{item.title}</Text><Text style={styles.resourceMeta}>{item.meta}</Text><Ionicons name="arrow-forward" size={19} color={item.accent} />
      </Pressable>)}
      {row.length === 1 ? <View style={styles.twoColumnSpacer} /> : null}
    </View>)}</View>
  </View>;
}

function SearchResultsPanel({ query, mentorshipSessions }: { query: string; mentorshipSessions:MentorshipSession[] }) {
  const router=useRouter();
  const courseCatalog=useCourseCatalog();
  const term=query.trim().toLowerCase();
  const courseResults=Object.values(courseCatalog).filter(course=>`${course.title} ${course.promise} ${course.eyebrow} ${course.subcategory} ${course.source}`.toLowerCase().includes(term));
  const liveResults=upcomingEvents.filter(event=>{const start=event.startsAt?new Date(event.startsAt).getTime():Number.NaN;return Number.isFinite(start)&&start+2*60*60*1000>=learningHubLoadedAt&&`${event.title} ${event.copy} ${event.type} ${eventProgramme(event.type,event.title)}`.toLowerCase().includes(term)}).sort((a,b)=>new Date(a.startsAt!).getTime()-new Date(b.startsAt!).getTime());
  const replayResults=mentorshipSessions.filter(item=>item.status==='completed'&&item.replay_url&&`${item.title} ${item.description} ${item.industry}`.toLowerCase().includes(term));
  const resourceResults=resources.filter(item=>`${item.title} ${item.type} ${item.meta}`.toLowerCase().includes(term));
  const total=courseResults.length+liveResults.length+replayResults.length+resourceResults.length;
  const row=(key:string,label:string,title:string,meta:string,route:string,icon:keyof typeof Ionicons.glyphMap)=><Pressable key={key} onPress={()=>router.push(route as never)} style={styles.searchResult}><View style={styles.searchResultIcon}><Ionicons name={icon} size={19} color={colors.pinkDeep}/></View><View style={styles.searchResultCopy}><Text style={styles.searchResultType}>{label}</Text><Text style={styles.searchResultTitle}>{title}</Text><Text style={styles.searchResultMeta}>{meta}</Text></View><Ionicons name="arrow-forward" size={17} color={colors.ink}/></Pressable>;
  return <View><SectionHeading eyebrow="SEARCHING ALL OF LEARN" title={total?`${total} ${total===1?'result':'results'}`:'No results'}/>{!total?<AppStateView kind="no-results" compact title={`Nothing matched “${query}”`} copy="Try a broader skill, topic or programme name."/>:<View style={styles.searchResults}>{courseResults.map(item=>row(`course-${item.id}`,'COURSE',item.title,`${item.source} · ${item.duration}`,`/course/${item.id}`,'school-outline'))}{liveResults.map(item=>row(`live-${item.id}`,'LIVE SESSION',item.title,`${eventProgramme(item.type,item.title)} · ${item.dateShort}`,`/event/${item.id}`,'radio-outline'))}{replayResults.map(item=>row(`replay-${item.id}`,'REPLAY',item.title,`${item.mentors?.[0]?.full_name??'GWMB Speaker'} · 48 min`,`/mentorship-session/${item.id}`,'play-circle-outline'))}{resourceResults.map(item=>row(`resource-${item.id}`,'RESOURCE',item.title,item.meta,`/resource/${item.id}`,'library-outline'))}</View>}</View>;
}

function EmptyState({ icon, title, copy }: { icon: keyof typeof Ionicons.glyphMap; title: string; copy: string }) {
  return <View style={styles.empty}><Ionicons name={icon} size={28} color={colors.pinkDeep} /><Text style={styles.emptyTitle}>{title}</Text><Text style={styles.emptyCopy}>{copy}</Text></View>;
}

export function LearnOverview() {
  const { user } = useAuth();
  const publishedEvents=usePublishedContent('events');
  const cmsEvents=useMemo(()=>publishedEvents.map(item=>cmsEvent(item)),[publishedEvents]);
  const cmsRegistrationIds=useMemo(()=>Object.fromEntries(publishedEvents.map(item=>[item.slug,item.id])),[publishedEvents]);
  const pathname = usePathname();
  const [active, setActive] = useState<LearnSection>('courses');
  const [query, setQuery] = useState('');
  const [progress, setProgress] = useState<CourseProgress[]>([]);
  const [registrations,setRegistrations]=useState<EventRegistration[]>([]);
  const [mentorshipRegistrations,setMentorshipRegistrations]=useState<MentorshipRegistration[]>([]);
  const [mentorshipSessions,setMentorshipSessions]=useState<MentorshipSession[]>(demoMentorshipSessions);
  const [category, setCategory] = useState<CourseArea | null>(null);
  const [subcategory, setSubcategory] = useState<string | null>(null);
  useFocusEffect(useCallback(() => {
    let mounted = true;
    if (!user?.id) { setProgress([]); setRegistrations([]); setMentorshipRegistrations([]); return () => { mounted = false; }; }
    void Promise.all([loadAllCourseProgress(user.id),loadEventRegistrations(user.id),loadMentorshipRegistrations(user.id),loadMentorshipSessions()]).then(([progressResult,registrationResult,mentorshipResult,sessionResult]) => { if (mounted) { setProgress(progressResult.progress); setRegistrations(registrationResult.registrations); setMentorshipRegistrations(mentorshipResult.registrations); setMentorshipSessions(sessionResult.sessions.filter(item=>!item.distribution_surfaces||item.distribution_surfaces.includes('learn'))); } });
    return () => { mounted = false; };
  }, [user]));

  return <Screen contentContainerStyle={styles.screenContent}>
    {pathname !== '/learn' ? <PageHeader title="Learn" eyebrow="Learning & Skills" /> : null}
    {pathname === '/learn' ? <DestinationHeader compact eyebrow="GWMB LEARN" title="Build skills for your next move." copy="Certificate courses, career readiness, live sessions, templates and resources." colors={['#8F174B','#E35491','#9B72E8','#3150E8']}/> : null}
    <View style={styles.search}>
      <TextInput value={query} onChangeText={setQuery} placeholder="Search courses, sessions and resources" placeholderTextColor="#746F72" style={styles.searchInput} />
      <View pointerEvents="none" style={styles.searchLeading}><Ionicons name="search-outline" size={21} color={colors.muted} /></View>
      <View pointerEvents="none" style={styles.searchTrailing}><Ionicons name="options-outline" size={21} color={colors.ink} /></View>
    </View>
    <View style={styles.swipeHint}><Ionicons name="swap-horizontal-outline" size={15} color={colors.muted}/><Text style={styles.swipeHintText}>Swipe</Text></View>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs}>
      {sections.map(section => <Pressable key={section.id} onPress={() => { setActive(section.id);setQuery(''); }} style={[styles.tab, active === section.id && styles.tabActive]}><Ionicons name={section.icon} size={17} color={active === section.id ? 'white' : colors.ink} /><Text style={[styles.tabText, active === section.id && styles.tabTextActive]}>{section.label}</Text></Pressable>)}
    </ScrollView>
    {query.trim()?<SearchResultsPanel query={query} mentorshipSessions={mentorshipSessions}/>:<>{active === 'courses' ? <CoursesPanel query="" progress={progress} category={category} subcategory={subcategory} onSelectCategory={setCategory} onSelectSubcategory={setSubcategory} /> : null}{active === 'career-readiness'?<CareerReadinessHub/>:null}{active === 'live' ? <LivePanel query="" registrations={registrations} mentorshipRegistrations={mentorshipRegistrations} mentorshipSessions={mentorshipSessions} cmsEvents={cmsEvents} cmsRegistrationIds={cmsRegistrationIds}/> : null}{active === 'templates'?<ResourcesPanel query="" mode="templates"/>:null}{active === 'resources' ? <ResourcesPanel query="" mode="resources" /> : null}</>}
  </Screen>;
}

const styles = StyleSheet.create({
  screenContent: { paddingBottom: 24 },
  search: { height: 58, borderRadius: 18, backgroundColor: '#FCFAFC', borderWidth: 1, borderColor: '#DCD3DA', overflow: 'hidden', marginBottom:14 },
  searchInput: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, width: '100%', height: '100%', color: colors.ink, fontSize: 15, fontFamily: fonts.bodyMedium, paddingLeft: 49, paddingRight: 49, paddingVertical: 0, borderWidth: 0 },
  searchLeading: { position: 'absolute', left: 16, top: 0, bottom: 0, justifyContent: 'center' },
  searchTrailing: { position: 'absolute', right: 16, top: 0, bottom: 0, justifyContent: 'center' },
  swipeHint:{height:22,flexDirection:'row',alignItems:'center',justifyContent:'flex-end',gap:5,paddingRight:3},swipeHintText:{fontFamily:fonts.bodyBold,fontSize:8.5,color:colors.muted},
  tabs: { gap: 8, paddingRight: 18, paddingBottom: 18 },
  tab: { height: 41, borderRadius: 21, paddingHorizontal: 14, borderWidth: 1, borderColor: '#DCD4DA', backgroundColor: '#FCFAFC', flexDirection: 'row', alignItems: 'center', gap: 7 },
  tabActive: { backgroundColor: colors.ink, borderColor: colors.ink }, tabText: { color: colors.ink, fontSize: 10, fontFamily: fonts.bodyBold }, tabTextActive: { color: 'white' },
  sectionHeading: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: 4, marginBottom: 11 },
  eyebrow: { color: colors.pinkDeep, fontSize: 8, letterSpacing: 1.25, fontFamily: fonts.bodyBold, marginBottom: 4 }, sectionTitle: { color: colors.ink, fontSize: 20, letterSpacing: -.55, fontFamily: fonts.heading }, headingAction: { color: colors.muted, fontSize: 9, fontFamily: fonts.bodyBold, marginBottom: 3 },
  sectionCopy: { color: colors.muted, fontSize: 11, lineHeight: 17, fontFamily: fonts.body, marginTop: -4, marginBottom: 16, maxWidth: 400 },
  categoryArea: { backgroundColor: '#FCFAFC', borderRadius: 26, borderWidth: 1, borderColor: '#DDD4DB', padding: 16, marginBottom: 22, overflow: 'hidden' },
  categoryIntro: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 16 },
  categoryTitle: { color: colors.ink, fontSize: 19, letterSpacing: -.5, fontFamily: fonts.headingBold },
  clearCategory: { color: colors.pinkDeep, fontSize: 9, fontFamily: fonts.bodyBold, paddingBottom: 3 },
  categoryGroup:{marginBottom:13},categoryRailHead:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',marginBottom:9},categoryGroupTitle:{color:colors.muted,fontSize:7.5,letterSpacing:.95,fontFamily:fonts.bodyBold,textTransform:'uppercase'},categoryRailMeta:{color:colors.muted,fontSize:7.5,fontFamily:fonts.bodySemibold},categoryCoreRow:{flexDirection:'row',gap:6},
  categoryItem:{flex:1,height:96,borderRadius:17,padding:8,alignItems:'center',justifyContent:'center',gap:9,borderWidth:1},categoryItemCompact:{flex:1,height:88,borderRadius:16,paddingHorizontal:4,paddingVertical:8,alignItems:'center',justifyContent:'center',gap:8,borderWidth:1},categoryItemActive:{borderWidth:1.5},categoryLabel:{color:colors.ink,fontSize:9.5,lineHeight:12,fontFamily:fonts.headingBold,letterSpacing:-.15,textAlign:'center'},categoryLabelCompact:{fontSize:8,lineHeight:10},
  categoryExtraGroup:{borderRadius:20,backgroundColor:'#F3F0F4',borderWidth:1,borderColor:'#E1D9E0',padding:12,marginTop:2,marginBottom:12},categoryExtraHead:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',marginBottom:10},categoryExtraCopy:{color:colors.muted,fontSize:8,fontFamily:fonts.bodyMedium,marginTop:3},categoryExtraCount:{width:25,height:25,borderRadius:13,backgroundColor:'white',alignItems:'center',justifyContent:'center'},categoryExtraCountText:{color:colors.pinkDeep,fontSize:8,fontFamily:fonts.bodyBold},categoryExtraRow:{flexDirection:'row',gap:7},
  subcategories: { gap: 7, paddingTop: 2, paddingRight: 4 }, subcategory: { height: 31, borderRadius: 16, paddingHorizontal: 12, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.canvas, alignItems: 'center', justifyContent: 'center' }, subcategoryActive: { backgroundColor: colors.ink, borderColor: colors.ink }, subcategoryText: { color: colors.muted, fontSize: 8, fontFamily: fonts.bodyBold }, subcategoryTextActive: { color: 'white' },
  myCourses:{borderRadius:26,backgroundColor:'#FCFAFC',borderWidth:1,borderColor:'#DDD4DB',padding:16,marginBottom:24},myCoursesHead:{flexDirection:'row',alignItems:'flex-end',justifyContent:'space-between'},myCoursesTitle:{color:colors.ink,fontSize:21,fontFamily:fonts.heading,letterSpacing:-.55},myCoursesCount:{color:colors.muted,fontSize:8,fontFamily:fonts.bodyBold,marginBottom:3},myCourseTabs:{height:42,borderRadius:14,backgroundColor:'#ECE8EC',padding:4,flexDirection:'row',alignItems:'center',marginTop:14,marginBottom:12},myCourseTab:{height:34,borderRadius:11,paddingHorizontal:16,alignItems:'center',justifyContent:'center'},myCourseTabActive:{backgroundColor:'white'},myCourseTabText:{color:colors.muted,fontSize:9,fontFamily:fonts.bodyBold},myCourseTabTextActive:{color:colors.ink},myCoursesViewIcon:{marginLeft:'auto',width:34,height:34,alignItems:'center',justifyContent:'center'},myCoursesEmpty:{minHeight:83,borderRadius:18,backgroundColor:'#F8E5EE',padding:12,flexDirection:'row',alignItems:'center',gap:10,borderWidth:1,borderColor:'#E9CEDA'},myCoursesEmptyIcon:{width:46,height:46,borderRadius:15,backgroundColor:'white',alignItems:'center',justifyContent:'center'},myCoursesEmptyCopy:{flex:1},myCoursesEmptyTitle:{color:colors.ink,fontSize:11,fontFamily:fonts.headingBold},myCoursesEmptyText:{color:colors.muted,fontSize:8,lineHeight:12,fontFamily:fonts.body,marginTop:3},
  featuredCourse: { minHeight: 178, borderRadius: 24, padding: 17, overflow: 'hidden', marginBottom: 22 }, featuredCourseLocked:{borderWidth:2,borderColor:'#FFD0E5'}, featuredOrbLarge: { position: 'absolute', width: 170, height: 170, borderRadius: 85, borderWidth: 30, borderColor: 'rgba(255,255,255,.10)', right: -48, top: -47 }, featuredOrbSmall: { position: 'absolute', width: 90, height: 90, borderRadius: 45, backgroundColor: 'rgba(255,255,255,.09)', right: 78, bottom: -30 }, featuredTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 11 }, featuredIcon: { width: 38, height: 38, borderRadius: 13, backgroundColor: 'white', alignItems: 'center', justifyContent: 'center' }, arrowCircle: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, borderColor: 'rgba(255,255,255,.45)', alignItems: 'center', justifyContent: 'center' }, featuredEyebrow: { color: 'rgba(255,255,255,.76)', fontSize: 7, letterSpacing: 1.1, fontFamily: fonts.bodyBold }, featuredTitle: { color: 'white', fontSize: 20, lineHeight: 23, letterSpacing: -.6, fontFamily: fonts.heading, marginTop: 5, maxWidth: 330 }, featuredPromise: { color: 'rgba(255,255,255,.82)', fontSize: 10, lineHeight: 15, fontFamily: fonts.bodyMedium, marginTop: 6, maxWidth: 330 }, featuredMeta: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 10 }, featuredMetaText: { color: 'white', fontSize: 8, fontFamily: fonts.bodyBold }, metaDot: { width: 3, height: 3, borderRadius: 2, backgroundColor: 'rgba(255,255,255,.6)', marginHorizontal: 3 }, featuredLock:{height:34,borderRadius:12,backgroundColor:'white',paddingHorizontal:10,flexDirection:'row',alignItems:'center',gap:7,marginTop:9},featuredLockText:{flex:1,color:colors.ink,fontSize:8,fontFamily:fonts.bodyBold},courseSourceRow:{flexDirection:'row',alignItems:'center',gap:6,marginTop:8},featuredSource:{color:'white',fontSize:7.5,fontFamily:fonts.bodyBold},featuredBenefit:{color:'white',fontSize:7,backgroundColor:'rgba(255,255,255,.16)',borderRadius:9,paddingHorizontal:7,paddingVertical:3,fontFamily:fonts.bodyBold},
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 16 }, progressTrack: { flex: 1, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,.28)', overflow: 'hidden' }, progressFill: { height: '100%', borderRadius: 2, backgroundColor: 'white' }, progressLabel: { color: 'white', fontSize: 9, fontFamily: fonts.bodyBold },
  courseGrid: { gap: 10, marginBottom: 25 }, twoColumnRow:{flexDirection:'row',gap:10,alignItems:'stretch'},twoColumnSpacer:{flex:1,minWidth:0},courseTile: { flex:1,minWidth:0,minHeight: 218, borderRadius: 23, padding: 15, overflow: 'hidden', borderWidth:1, borderColor:'rgba(17,16,17,.08)' }, courseTileLocked:{borderWidth:2,borderColor:'#D987AC'}, courseTileShape: { position: 'absolute', width: 110, height: 110, borderRadius: 55, opacity: .10, right: -32, bottom: -36 }, courseTileTop: { minHeight: 35, flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 5 }, courseTileIcon: { width: 34, height: 34, borderRadius:12,backgroundColor:'rgba(255,255,255,.64)',alignItems:'center',justifyContent:'center' }, accessBadgeLocked:{height:22,borderRadius:11,paddingHorizontal:7,backgroundColor:colors.pinkDeep,flexDirection:'row',alignItems:'center',gap:3}, courseAccessLocked: { color:'white',fontSize: 5.5, letterSpacing: .45, fontFamily: fonts.bodyBold }, courseTileTitle: { color: colors.ink, fontSize: 14, lineHeight: 17, letterSpacing: -.3, fontFamily: fonts.headingBold, marginTop: 8, minHeight: 38, maxWidth:'96%' }, courseTileMeta: { gap: 5, marginTop: 8 }, courseTileMetaRow:{flexDirection:'row',alignItems:'center',gap:6}, courseTileMetaText: { color: '#514B4E', fontSize: 8.5, fontFamily: fonts.bodyBold }, tileUnlock:{minHeight:29,borderRadius:10,backgroundColor:'rgba(255,255,255,.78)',paddingHorizontal:8,flexDirection:'row',alignItems:'center',justifyContent:'space-between',marginTop:9},tileUnlockText:{color:colors.ink,fontSize:7,fontFamily:fonts.bodyBold},courseSource:{fontSize:7.5,letterSpacing:.3,fontFamily:fonts.bodyBold,marginTop:3},courseBenefits:{flexDirection:'row',flexWrap:'wrap',gap:4,marginTop:8},courseBenefit:{color:colors.ink,fontSize:6.5,fontFamily:fonts.bodyBold,backgroundColor:'rgba(255,255,255,.62)',borderRadius:8,paddingHorizontal:6,paddingVertical:3},
  stack: { gap: 10, marginBottom: 25 }, progressCourse: { minHeight: 126, borderRadius: 22, padding: 18, flexDirection: 'row', alignItems: 'center', overflow: 'hidden' }, progressCourseCopy: { flex: 1, paddingRight: 12 }, progressCourseLabel: { color: 'rgba(255,255,255,.7)', fontSize: 7, letterSpacing: 1, fontFamily: fonts.bodyBold }, progressCourseTitle: { color: 'white', fontSize: 18, lineHeight: 21, fontFamily: fonts.headingBold, marginTop: 6 }, progressArrow: { width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(255,255,255,.14)', alignItems: 'center', justifyContent: 'center' },
  filterLabel:{color:colors.muted,fontSize:7,letterSpacing:1,fontFamily:fonts.bodyBold,marginTop:2,marginBottom:7},filterRail:{gap:7,paddingRight:18,paddingBottom:13},filterChip:{height:32,borderRadius:16,paddingHorizontal:12,borderWidth:1,borderColor:colors.line,backgroundColor:'#FCFAFC',alignItems:'center',justifyContent:'center'},filterChipActive:{backgroundColor:colors.ink,borderColor:colors.ink},filterChipText:{color:colors.muted,fontSize:8,fontFamily:fonts.bodyBold},filterChipTextActive:{color:'white'},
  liveCard: { minHeight: 150, borderRadius: 23, borderWidth: 1.5, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 13, overflow:'hidden' }, dateTile: { width: 66, height: 86, borderRadius: 19, alignItems: 'center', justifyContent: 'center' }, dateDay: { color: colors.ink, fontSize: 23, fontFamily: fonts.heading }, dateMonth: { color: colors.muted, fontSize: 8, letterSpacing: 1.2, fontFamily: fonts.bodyBold, marginTop: 1 }, whiteText: { color: 'white' }, liveCopy: { flex: 1 }, liveStateRow:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:5},liveType: { fontSize: 7, lineHeight: 11, letterSpacing: .8, fontFamily: fonts.bodyBold, marginBottom: 5 }, sessionState:{color:colors.muted,fontSize:6.5,fontFamily:fonts.bodyBold,backgroundColor:'rgba(255,255,255,.65)',paddingHorizontal:7,paddingVertical:4,borderRadius:9},sessionStateStrong:{color:'#087553',backgroundColor:'#DCF5EA'},liveTitle: { color: colors.ink, fontSize: 15, lineHeight: 18, fontFamily: fonts.headingBold, marginBottom: 8 }, detailRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 3 }, detailText: { color: '#514B4E', fontSize: 8, fontFamily: fonts.bodyMedium },
  replayCard: { minHeight: 250, borderRadius: 26, padding: 19, overflow: 'hidden' }, replayVisual: { height: 88, borderRadius: 19, backgroundColor: colors.ink, padding: 15, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 17 }, replayPlay: { width: 45, height: 45, borderRadius: 23, backgroundColor: colors.pink, alignItems: 'center', justifyContent: 'center' }, replayLength: { color: 'rgba(255,255,255,.7)', fontSize: 8, letterSpacing: 1, fontFamily: fonts.bodyBold }, replayType: { color: colors.pinkDeep, fontSize: 7, letterSpacing: 1, fontFamily: fonts.bodyBold }, replayTitle: { color: colors.ink, fontSize: 20, lineHeight: 23, fontFamily: fonts.heading, letterSpacing: -.5, marginTop: 6 }, replayCopy: { color: colors.muted, fontSize: 10, lineHeight: 15, fontFamily: fonts.body, marginTop: 6 }, replayFacts:{flexDirection:'row',flexWrap:'wrap',gap:6,marginTop:10},replayFact:{color:'#514B4E',fontSize:7.5,fontFamily:fonts.bodyBold,backgroundColor:'rgba(255,255,255,.56)',borderRadius:9,paddingHorizontal:7,paddingVertical:4},watchRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 15 }, watchText: { color: colors.ink, fontSize: 10, fontFamily: fonts.bodyBold },
  resourceGrid: { gap: 10 }, resourceCard: { flex:1,minWidth:0,minHeight: 220, borderRadius: 23, padding: 16, justifyContent: 'space-between' }, resourceIcon: { width: 45, height: 45, borderRadius: 15, alignItems: 'center', justifyContent: 'center' }, resourceType: { fontSize: 7, letterSpacing: 1.1, fontFamily: fonts.bodyBold, marginTop: 16 }, resourceTitle: { color: colors.ink, fontSize: 15, lineHeight: 18, letterSpacing: -.3, fontFamily: fonts.headingBold, marginTop: 5 }, resourceMeta: { color: colors.muted, fontSize: 8, fontFamily: fonts.bodyMedium, marginTop: 7, marginBottom: 14 },
  searchResults:{gap:9,marginBottom:24},searchResult:{minHeight:82,borderRadius:20,borderWidth:1,borderColor:colors.line,backgroundColor:'#FCFAFC',padding:12,flexDirection:'row',alignItems:'center',gap:11},searchResultIcon:{width:43,height:43,borderRadius:14,backgroundColor:'#FCE3EF',alignItems:'center',justifyContent:'center'},searchResultCopy:{flex:1},searchResultType:{color:colors.pinkDeep,fontSize:6.5,letterSpacing:.9,fontFamily:fonts.bodyBold},searchResultTitle:{color:colors.ink,fontSize:12,fontFamily:fonts.headingBold,marginTop:3},searchResultMeta:{color:colors.muted,fontSize:8,fontFamily:fonts.bodyMedium,marginTop:3},
  empty: { minHeight: 220, borderRadius: 25, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', padding: 30 }, emptyTitle: { color: colors.ink, fontSize: 17, fontFamily: fonts.headingBold, marginTop: 12 }, emptyCopy: { color: colors.muted, fontSize: 10, lineHeight: 16, fontFamily: fonts.body, textAlign: 'center', marginTop: 5 },
});
