import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useRef } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { FadeIn } from '@/components/motion/FadeIn';
import { SpringPressable } from '@/components/motion/SpringPressable';
import { growCategoryColors } from '@/data/grow';
import { tapFeedback } from '@/lib/feedback';
import { usePublishedContent } from '@/lib/content-runtime';
import type { ContentItem } from '@/lib/admin-content';
import { colors, fonts } from '@/theme';

const benefitVisuals = [
  { icon: 'briefcase-outline', tone: growCategoryColors.career, dark: true },
  { icon: 'people-outline', tone: growCategoryColors.mentorship, dark: true },
  { icon: 'play-circle-outline', tone: growCategoryColors.learning, dark: true },
  { icon: 'wallet-outline', tone: growCategoryColors.money, dark: false },
  { icon: 'trending-up-outline', tone: growCategoryColors['personal-growth'], dark: true },
  { icon: 'leaf-outline', tone: growCategoryColors.leadership, dark: true },
] as const;

const memberExperience = [
  { eyebrow:'YOUR PEOPLE', title:'My Cliques', copy:'Return to the communities you belong to.', icon:'people-circle-outline', route:'/cliques', tone:'#17131A' },
  { eyebrow:'YOUR CALENDAR', title:'Upcoming Gatherings', copy:'See Sister Circles, clique meetings and member events.', icon:'calendar-outline', route:'/events', tone:'#5A3AA5' },
  { eyebrow:'MEMBER STATUS', title:'Verified Member', copy:'Your GWMB member experience is active.', icon:'shield-checkmark-outline', route:'/membership', tone:'#087765' },
] as const;

const find=(items:ContentItem[],slug:string)=>items.find(item=>item.slug===slug);
const meta=(item:ContentItem|undefined,key:string,fallback:string)=>typeof item?.metadata?.[key]==='string'?String(item.metadata[key]):fallback;

export function HomeDiscoverySections({ isMember = false }: { isMember?: boolean }) {
  const { width } = useWindowDimensions();
  const home=usePublishedContent('home'); const winItems=usePublishedContent('member-wins');
  const benefits=home.filter(item=>item.content_type==='benefit_card'&&item.visible&&item.route).map((item,index)=>({label:item.title,icon:meta(item,'icon',benefitVisuals[index]?.icon||'sparkles-outline') as typeof benefitVisuals[number]['icon'],promise:item.summary||'',tone:meta(item,'color',benefitVisuals[index]?.tone||colors.pinkDeep),route:item.route!,dark:item.metadata.dark!==false}));
  const displayedBenefits=isMember?benefits.slice(0,4):benefits;
  const publishedWins=winItems.filter(item=>item.visible);
  const resolvedWins=publishedWins.map(item=>({category:item.eyebrow||'MEMBER SPOTLIGHT',title:item.title,copy:item.summary||'',imageUrl:item.image_url}));
  const heading=find(home,'benefits-section'); const cta=find(home,'benefits-cta'); const spotlight=find(home,'spotlight-section');
  const benefitWidth = Math.min(Math.max(width * .43, 156), 190);
  const spotlightWidth = Math.min(Math.max(width * .82, 286), 430);
  const benefitRef = useRef<ScrollView>(null);
  const benefitPosition = useRef(0);
  const benefitPausedUntil = useRef(0);
  const spotlightRef = useRef<ScrollView>(null);
  const spotlightPosition = useRef(0);
  const spotlightPausedUntil = useRef(0);

  useEffect(() => {
    const benefitTimer = setInterval(() => {
      if(displayedBenefits.length<2)return;
      if (Date.now() < benefitPausedUntil.current) return;
      benefitPosition.current = (benefitPosition.current + 1) % displayedBenefits.length;
      benefitRef.current?.scrollTo({ x: benefitPosition.current * (benefitWidth + 10), animated: benefitPosition.current !== 0 });
    }, 3600);
    const timer = setInterval(() => {
      if(resolvedWins.length<2)return;
      if (Date.now() < spotlightPausedUntil.current) return;
      spotlightPosition.current = (spotlightPosition.current + 1) % resolvedWins.length;
      spotlightRef.current?.scrollTo({ x: spotlightPosition.current * (spotlightWidth + 12), animated: spotlightPosition.current !== 0 });
    }, 4800);
    return () => { clearInterval(benefitTimer); clearInterval(timer); };
  }, [benefitWidth, displayedBenefits.length, resolvedWins.length, spotlightWidth]);

  const open = (route: string) => { void tapFeedback(); router.push(route as never); };

  return <>
    {isMember?<FadeIn delay={310}>
      <View style={styles.sectionHead}><View><Text style={styles.kicker}>YOUR MEMBER EXPERIENCE</Text><Text style={styles.sectionTitle}>Your Community</Text></View><Text style={styles.swipe}>Swipe</Text></View>
      <ScrollView horizontal decelerationRate="fast" snapToInterval={214} showsHorizontalScrollIndicator={false} contentContainerStyle={styles.memberTrack}>
        {memberExperience.map(item=><SpringPressable key={item.title} onPress={()=>open(item.route)} style={[styles.memberCard,{backgroundColor:item.tone}]} contentStyle={styles.memberContent}><View style={styles.memberOrb}/><View style={styles.memberIcon}><Ionicons name={item.icon} size={22} color={colors.pinkDeep}/></View><View style={styles.memberBottom}><Text style={styles.memberEyebrow}>{item.eyebrow}</Text><Text style={styles.memberTitle}>{item.title}</Text><Text numberOfLines={2} style={styles.memberCopy}>{item.copy}</Text></View><View style={styles.memberArrow}><Ionicons name="arrow-forward" size={15} color={colors.ink}/></View></SpringPressable>)}
      </ScrollView>
    </FadeIn>:displayedBenefits.length?<FadeIn delay={310}>
      <View style={styles.sectionHead}><View><Text style={styles.kicker}>WHY JOIN GWMB?</Text><Text style={styles.sectionTitle}>{heading?.title||'Explore Member Benefits'}</Text></View><Text style={styles.swipe}>{meta(heading,'swipeLabel','Swipe')}</Text></View>
      <ScrollView ref={benefitRef} horizontal decelerationRate="fast" snapToInterval={benefitWidth + 10} showsHorizontalScrollIndicator={false} contentContainerStyle={styles.benefitTrack} onScrollBeginDrag={() => { benefitPausedUntil.current = Date.now() + 9000; }} onMomentumScrollEnd={(event) => { benefitPosition.current = Math.max(0, Math.min(displayedBenefits.length - 1, Math.round(event.nativeEvent.contentOffset.x / (benefitWidth + 10)))); }}>
        {displayedBenefits.map((benefit, index) => <Pressable key={benefit.label} onPress={() => open(benefit.route)} style={({ pressed }) => [styles.benefitCard, { width: benefitWidth, backgroundColor: pressed ? colors.pinkDeep : benefit.tone }, pressed && styles.benefitPressed]}>
          {({ pressed }) => { const light = pressed || benefit.dark; return <><View style={styles.benefitShapeLarge}/><View style={styles.benefitShapeSmall}/><View style={styles.benefitTop}><View style={styles.benefitIcon}><Ionicons name={benefit.icon} size={23} color={colors.pinkDeep}/></View><Text style={[styles.benefitIndex, light && styles.light]}>0{index + 1}</Text></View><View style={styles.benefitBottom}><Text style={[styles.benefitTitle, light && styles.light]}>{benefit.label}</Text><Text numberOfLines={2} style={[styles.benefitCopy, light && styles.lightCopy]}>{benefit.promise}</Text><View style={[styles.benefitArrow, light && styles.benefitArrowLight]}><Ionicons name="arrow-forward" size={14} color={light ? colors.ink : 'white'}/></View></View></>; }}
        </Pressable>)}
      </ScrollView>
      {cta?.route?<SpringPressable onPress={() => open(cta.route!)} style={styles.fullBenefits} contentStyle={styles.fullBenefitsContent}><View><Text style={styles.fullBenefitsKicker}>{cta.eyebrow||'ALL MEMBER BENEFITS'}</Text><Text style={styles.fullBenefitsTitle}>{cta.title}</Text></View><View style={styles.fullBenefitsArrow}><Ionicons name="arrow-forward" size={17} color={colors.ink}/></View></SpringPressable>:null}
    </FadeIn>:null}

    {resolvedWins.length?<FadeIn delay={350}>
      <View style={styles.sectionHead}><View><Text style={styles.kicker}>{spotlight?.eyebrow||'SPOTLIGHT'}</Text><Text style={styles.sectionTitle}>{spotlight?.title||'GWMB Girls Making Moves'}</Text></View><Pressable onPress={() => open(spotlight?.route||'/member-wins')}><Text style={styles.link}>{meta(spotlight,'link','See all wins')}</Text></Pressable></View>
      <ScrollView ref={spotlightRef} horizontal decelerationRate="fast" snapToInterval={spotlightWidth + 12} showsHorizontalScrollIndicator={false} contentContainerStyle={styles.spotlightTrack} onScrollBeginDrag={() => { spotlightPausedUntil.current = Date.now() + 9000; }} onMomentumScrollEnd={(event) => { spotlightPosition.current = Math.round(event.nativeEvent.contentOffset.x / (spotlightWidth + 12)); }}>
        {resolvedWins.map((win, index) => <SpringPressable key={`${win.category}-${index}`} onPress={() => open(spotlight?.route||'/member-wins')} style={[styles.spotlightCard, { width: spotlightWidth }]} contentStyle={styles.spotlightContent}>
          <View style={styles.spotlightMedia}>{win.imageUrl?<Image source={{uri:win.imageUrl}} resizeMode="cover" style={styles.spotlightImage}/>:<View style={[styles.spotlightImage,styles.spotlightPlaceholder]}><Ionicons name="person-outline" size={42} color={colors.pinkDeep}/></View>}<View style={styles.spotlightShade}/><View style={styles.spotlightTop}><View style={styles.spotlightBadge}><Ionicons name="star" size={11} color={colors.pinkDeep}/><Text style={styles.spotlightBadgeText}>{win.category}</Text></View><Text style={styles.spotlightIssue}>0{index + 1}</Text></View></View>
          <View style={styles.spotlightBottom}><Text style={styles.spotlightTitle}>{win.title}</Text><Text numberOfLines={2} style={styles.spotlightCopy}>{win.copy}</Text><View style={styles.spotlightArrow}><Ionicons name="arrow-forward" size={20} color="white"/></View></View>
        </SpringPressable>)}
      </ScrollView>
    </FadeIn>:null}
  </>;
}

const styles = StyleSheet.create({
  sectionHead:{flexDirection:'row',alignItems:'flex-end',justifyContent:'space-between',marginTop:23,marginBottom:10},kicker:{color:colors.pinkDeep,fontSize:7.5,fontFamily:fonts.bodyBold,letterSpacing:1.05},sectionTitle:{color:colors.ink,fontSize:18,fontFamily:fonts.headingBold,letterSpacing:-.5,marginTop:3},swipe:{color:colors.muted,fontSize:9,fontFamily:fonts.bodySemibold,paddingBottom:2},link:{color:colors.pinkDeep,fontSize:9,fontFamily:fonts.bodyBold,paddingBottom:2},
  benefitTrack:{gap:10,paddingRight:18},benefitCard:{height:184,borderRadius:26,padding:14,overflow:'hidden',borderWidth:1,borderColor:'rgba(17,16,17,.10)'},benefitPressed:{transform:[{translateY:-2}]},benefitShapeLarge:{position:'absolute',width:160,height:160,borderRadius:80,backgroundColor:'rgba(255,255,255,.15)',right:-58,top:-57},benefitShapeSmall:{position:'absolute',width:98,height:98,borderRadius:49,borderWidth:20,borderColor:'rgba(255,255,255,.13)',right:-2,top:24,transform:[{rotate:'-18deg'}]},benefitTop:{flexDirection:'row',alignItems:'flex-start',justifyContent:'space-between'},benefitIcon:{width:47,height:47,borderRadius:16,backgroundColor:'rgba(255,255,255,.94)',alignItems:'center',justifyContent:'center'},benefitIndex:{color:'#81797E',fontSize:7.5,fontFamily:fonts.bodyBold,letterSpacing:.7,marginTop:3},benefitBottom:{marginTop:'auto',paddingRight:1},benefitTitle:{color:colors.ink,fontSize:15,lineHeight:18,fontFamily:fonts.headingBold,letterSpacing:-.25,paddingRight:29},benefitCopy:{color:'rgba(17,16,17,.66)',fontSize:8.5,lineHeight:12.5,fontFamily:fonts.bodyMedium,marginTop:4,paddingRight:24},light:{color:'white'},lightCopy:{color:'rgba(255,255,255,.78)'},benefitArrow:{position:'absolute',right:0,bottom:0,width:29,height:29,borderRadius:15,backgroundColor:colors.ink,alignItems:'center',justifyContent:'center'},benefitArrowLight:{backgroundColor:'white'},
  memberTrack:{gap:10,paddingRight:18},memberCard:{width:204,height:190,borderRadius:25,overflow:'hidden'},memberContent:{padding:14},memberOrb:{position:'absolute',width:156,height:156,borderRadius:78,borderWidth:28,borderColor:'rgba(255,255,255,.11)',right:-49,top:-58},memberIcon:{width:46,height:46,borderRadius:15,backgroundColor:'white',alignItems:'center',justifyContent:'center'},memberBottom:{marginTop:'auto',paddingRight:18},memberEyebrow:{color:'rgba(255,255,255,.62)',fontSize:6.5,fontFamily:fonts.bodyBold,letterSpacing:.85},memberTitle:{color:'white',fontSize:16,lineHeight:20,fontFamily:fonts.headingBold,marginTop:4},memberCopy:{color:'rgba(255,255,255,.76)',fontSize:8.5,lineHeight:13,fontFamily:fonts.body,marginTop:4},memberArrow:{position:'absolute',right:13,bottom:13,width:31,height:31,borderRadius:16,backgroundColor:'white',alignItems:'center',justifyContent:'center'},
  fullBenefits:{minHeight:68,borderRadius:20,backgroundColor:'#17131A',marginTop:11,overflow:'hidden',borderWidth:1,borderColor:'#2C2630'},fullBenefitsContent:{paddingHorizontal:16,flexDirection:'row',alignItems:'center',justifyContent:'space-between'},fullBenefitsKicker:{color:'#BDB6BA',fontSize:7,fontFamily:fonts.bodyBold,letterSpacing:.85},fullBenefitsTitle:{color:'white',fontSize:13,fontFamily:fonts.headingBold,marginTop:3},fullBenefitsArrow:{width:36,height:36,borderRadius:18,backgroundColor:'white',alignItems:'center',justifyContent:'center'},
  spotlightTrack:{gap:11,paddingRight:20},spotlightCard:{height:314,borderRadius:25,backgroundColor:'#FCFAFC',borderWidth:1,borderColor:'#DCD3DA',overflow:'hidden'},spotlightContent:{},spotlightMedia:{height:170,overflow:'hidden'},spotlightImage:{width:'100%',height:'100%'},spotlightPlaceholder:{alignItems:'center',justifyContent:'center',backgroundColor:'#F3E9EF'},spotlightShade:{position:'absolute',top:0,right:0,bottom:0,left:0,backgroundColor:'rgba(17,16,17,.20)'},spotlightTop:{position:'absolute',top:12,left:12,right:12,flexDirection:'row',alignItems:'center',justifyContent:'space-between'},spotlightBadge:{minHeight:30,borderRadius:999,backgroundColor:'rgba(255,255,255,.94)',paddingHorizontal:10,flexDirection:'row',alignItems:'center',gap:5},spotlightBadgeText:{color:colors.ink,fontSize:7.5,fontFamily:fonts.bodyBold,letterSpacing:.5},spotlightIssue:{color:'white',fontSize:8,fontFamily:fonts.bodyBold,letterSpacing:.8},spotlightBottom:{flex:1,padding:14,paddingRight:58},spotlightTitle:{color:colors.ink,fontSize:19,lineHeight:23,fontFamily:fonts.headingBold,letterSpacing:-.55,maxWidth:300},spotlightCopy:{color:colors.muted,fontSize:9,lineHeight:14,fontFamily:fonts.body,marginTop:5,maxWidth:285},spotlightArrow:{position:'absolute',right:14,bottom:14,width:43,height:43,borderRadius:22,backgroundColor:colors.ink,alignItems:'center',justifyContent:'center'},
});
