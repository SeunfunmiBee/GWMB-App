import { Ionicons } from '@expo/vector-icons';
import { router as expoRouter } from 'expo-router';
import { useEffect, useRef } from 'react';
import { Image, ScrollView, StyleSheet, Text, View } from 'react-native';

import { PageHeader } from '@/components/PageHeader';
import { Screen } from '@/components/Screen';
import { FadeIn } from '@/components/motion/FadeIn';
import { SpringPressable } from '@/components/motion/SpringPressable';
import { tapFeedback } from '@/lib/feedback';
import { colors, fonts } from '@/theme';

const router = { push: (href: string) => expoRouter.push(href as never) };

const moreWins = [
  {
    title: 'A fellowship worth celebrating',
    category: 'FELLOWSHIPS',
    image: require('../../assets/media/community/member-02.png'),
    tint: '#EEE6E9',
  },
  {
    title: 'From classroom to first role',
    category: 'CAREER FIRSTS',
    image: require('../../assets/media/community/member-04.png'),
    tint: '#FCEBF3',
  },
  {
    title: 'A bold business milestone',
    category: 'ENTREPRENEURSHIP',
    image: require('../../assets/media/community/member-08.png'),
    tint: '#EFEFFD',
  },
] as const;

export default function MemberWinsScreen() {
  const winsScroller = useRef<ScrollView>(null);
  const winsPosition = useRef(0);
  const winsPausedUntil = useRef(0);

  useEffect(() => {
    const timer = setInterval(() => {
      if (Date.now() < winsPausedUntil.current) return;
      winsPosition.current = (winsPosition.current + 1) % moreWins.length;
      winsScroller.current?.scrollTo({ x: winsPosition.current * 224, animated: winsPosition.current !== 0 });
    }, 3600);
    return () => clearInterval(timer);
  }, []);

  return (
    <Screen contentContainerStyle={styles.screenContent}>
      <PageHeader title="Member Spotlights" eyebrow="GWMB Girls Making Moves" />

      <FadeIn delay={50}>
        <View style={styles.hero}>
          <Image source={require('../../assets/media/community/member-01.png')} resizeMode="cover" style={styles.heroImage} />
          <View style={styles.heroShade} />
          <View style={styles.heroTop}>
            <View style={styles.heroBadge}>
              <Ionicons name="star" size={12} color={colors.pinkDeep} />
              <Text style={styles.heroBadgeText}>MEMBER SPOTLIGHT</Text>
            </View>
            <Text style={styles.heroIssue}>01</Text>
          </View>
          <View style={styles.heroBottom}>
            <Text style={styles.heroCategory}>PAID INTERNSHIP</Text>
            <Text style={styles.heroTitle}>Celebrating Matilda Yakubo</Text>
            <Text style={styles.heroCopy}>For landing a paid internship and taking a brilliant next step in her marketplace journey.</Text>
          </View>
        </View>
      </FadeIn>

      <FadeIn delay={110}>
        <View style={styles.standfirst}>
          <Text style={styles.standfirstLead}>A win worth celebrating.</Text>
          <Text style={styles.standfirstCopy}>Matilda’s milestone is a reminder that preparation, courage and consistent action can open meaningful doors.</Text>
        </View>

        <View style={styles.factRow}>
          <View style={styles.factCard}>
            <Ionicons name="briefcase-outline" size={21} color={colors.pinkDeep} />
            <Text style={styles.factLabel}>THE WIN</Text>
            <Text style={styles.factValue}>Paid internship</Text>
          </View>
          <View style={[styles.factCard, styles.factCardDark]}>
            <Ionicons name="trending-up-outline" size={21} color="white" />
            <Text style={[styles.factLabel, styles.factLabelLight]}>THE MOVE</Text>
            <Text style={[styles.factValue, styles.factValueLight]}>Career growth</Text>
          </View>
        </View>
      </FadeIn>

      <FadeIn delay={170}>
        <View style={styles.storySection}>
          <Text style={styles.kicker}>THE STORY</Text>
          <Text style={styles.sectionTitle}>Matilda is making moves</Text>
          <Text style={styles.storyCopy}>Landing a paid internship is more than a new line on a CV. It is a chance to learn in a real workplace, build confidence and turn potential into experience.</Text>
          <Text style={styles.storyCopy}>Today, we are celebrating Matilda and the exciting chapter ahead of her.</Text>
          <View style={styles.pullQuote}>
            <View style={styles.quoteMark}><Ionicons name="sparkles" size={18} color="white" /></View>
            <Text style={styles.pullQuoteText}>One woman’s win can show another woman what is possible.</Text>
          </View>
        </View>
      </FadeIn>

      <FadeIn delay={230}>
        <View style={styles.sectionHead}>
          <View>
            <Text style={styles.kicker}>MORE STORIES</Text>
            <Text style={styles.sectionTitle}>More wins we celebrate</Text>
          </View>
          <Text style={styles.swipe}>Swipe</Text>
        </View>
        <ScrollView
          ref={winsScroller}
          horizontal
          showsHorizontalScrollIndicator={false}
          decelerationRate="fast"
          snapToInterval={224}
          contentContainerStyle={styles.winsTrack}
          onScrollBeginDrag={() => { winsPausedUntil.current = Date.now() + 8000; }}
          onMomentumScrollEnd={(event) => { winsPosition.current = Math.round(event.nativeEvent.contentOffset.x / 224); }}
        >
          {moreWins.map((win) => (
            <View key={win.title} style={[styles.winCard, { backgroundColor: win.tint }]}>
              <Image source={win.image} resizeMode="cover" style={styles.winImage} />
              <View style={styles.winCopy}>
                <Text style={styles.winCategory}>{win.category}</Text>
                <Text style={styles.winTitle}>{win.title}</Text>
              </View>
            </View>
          ))}
        </ScrollView>
      </FadeIn>

      <FadeIn delay={290}>
        <SpringPressable
          accessibilityRole="button"
          accessibilityLabel="Join the GWMB community"
          onPress={() => { void tapFeedback(); router.push('/community'); }}
          style={styles.cta}
          contentStyle={styles.ctaContent}
        >
          <View>
            <Text style={styles.ctaKicker}>FIND YOUR PEOPLE</Text>
            <Text style={styles.ctaTitle}>Join the community</Text>
          </View>
          <View style={styles.ctaArrow}><Ionicons name="arrow-forward" size={20} color={colors.ink} /></View>
        </SpringPressable>
      </FadeIn>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screenContent: { paddingBottom: 48 },
  hero: { height: 500, overflow: 'hidden', borderRadius: 30, backgroundColor: colors.ink },
  heroImage: { position: 'absolute', inset: 0, width: '100%', height: '100%' },
  heroShade: { position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.26)' },
  heroTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20 },
  heroBadge: { flexDirection: 'row', alignItems: 'center', gap: 7, borderRadius: 999, backgroundColor: 'white', paddingHorizontal: 12, paddingVertical: 9 },
  heroBadgeText: { color: colors.ink, fontFamily: fonts.bodyBold, fontSize: 10, letterSpacing: 0.8 },
  heroIssue: { color: 'white', fontFamily: fonts.heading, fontSize: 22 },
  heroBottom: { marginTop: 'auto', padding: 22, paddingBottom: 26 },
  heroCategory: { color: '#FFD4E6', fontFamily: fonts.bodyBold, fontSize: 11, letterSpacing: 1.2 },
  heroTitle: { color: 'white', fontFamily: fonts.heading, fontSize: 38, lineHeight: 42, letterSpacing: -1.3, marginTop: 10 },
  heroCopy: { color: 'rgba(255,255,255,0.92)', fontFamily: fonts.bodyMedium, fontSize: 16, lineHeight: 23, marginTop: 12, maxWidth: 390 },
  standfirst: { paddingHorizontal: 6, paddingTop: 30 },
  standfirstLead: { color: colors.pinkDeep, fontFamily: fonts.headingBold, fontSize: 21 },
  standfirstCopy: { color: colors.text, fontFamily: fonts.body, fontSize: 17, lineHeight: 26, marginTop: 8 },
  factRow: { flexDirection: 'row', gap: 10, marginTop: 22 },
  factCard: { flex: 1, minHeight: 136, borderRadius: 23, backgroundColor: colors.pinkSoft, padding: 17, justifyContent: 'flex-end' },
  factCardDark: { backgroundColor: colors.ink },
  factLabel: { color: colors.pinkDeep, fontFamily: fonts.bodyBold, fontSize: 9, letterSpacing: 1, marginTop: 20 },
  factLabelLight: { color: '#F8BBD5' },
  factValue: { color: colors.ink, fontFamily: fonts.headingBold, fontSize: 17, lineHeight: 22, marginTop: 4 },
  factValueLight: { color: 'white' },
  storySection: { marginTop: 38, paddingHorizontal: 6 },
  kicker: { color: colors.pinkDeep, fontFamily: fonts.bodyBold, fontSize: 10, letterSpacing: 1.2 },
  sectionTitle: { color: colors.ink, fontFamily: fonts.heading, fontSize: 27, lineHeight: 33, letterSpacing: -0.7, marginTop: 5 },
  storyCopy: { color: colors.text, fontFamily: fonts.body, fontSize: 16, lineHeight: 25, marginTop: 14 },
  pullQuote: { flexDirection: 'row', alignItems: 'center', gap: 15, borderRadius: 24, backgroundColor: colors.pinkDeep, padding: 20, marginTop: 24 },
  quoteMark: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.16)' },
  pullQuoteText: { flex: 1, color: 'white', fontFamily: fonts.headingBold, fontSize: 18, lineHeight: 25 },
  sectionHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 40, paddingHorizontal: 6 },
  swipe: { color: colors.muted, fontFamily: fonts.bodySemibold, fontSize: 13, paddingBottom: 4 },
  winsTrack: { gap: 12, paddingTop: 18, paddingRight: 16 },
  winCard: { width: 212, overflow: 'hidden', borderRadius: 25 },
  winImage: { width: '100%', height: 238 },
  winCopy: { minHeight: 118, padding: 17 },
  winCategory: { color: colors.pinkDeep, fontFamily: fonts.bodyBold, fontSize: 9, letterSpacing: 1 },
  winTitle: { color: colors.ink, fontFamily: fonts.headingBold, fontSize: 20, lineHeight: 25, marginTop: 8 },
  cta: { backgroundColor: colors.ink, borderRadius: 25, marginTop: 14 },
  ctaContent: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 20 },
  ctaKicker: { color: '#F4A8C9', fontFamily: fonts.bodyBold, fontSize: 9, letterSpacing: 1.1 },
  ctaTitle: { color: 'white', fontFamily: fonts.headingBold, fontSize: 20, marginTop: 4 },
  ctaArrow: { width: 46, height: 46, borderRadius: 23, backgroundColor: 'white', alignItems: 'center', justifyContent: 'center' },
});
