import { Ionicons } from '@expo/vector-icons';
import { router, type Href } from 'expo-router';
import { Image, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { DestinationHeader } from '@/components/DestinationHeader';
import { Screen } from '@/components/Screen';
import { MentorshipArtwork } from '@/components/MentorshipArtwork';
import { colors, fonts } from '@/theme';

const mentorshipTypes = [
  { key: 'discovery', title: 'Discovery Mentorship', label: 'Explore careers', promise: 'Explore careers before you choose.', image: require('../../assets/media/community/member-01.png') },
  { key: 'industry', title: 'Industry Mentorship', label: 'Build expertise', promise: 'Grow in your chosen field.', image: require('../../assets/media/community/member-04.png') },
  { key: 'one-on-one', title: 'One-on-One Mentorship', label: 'Personal guidance', promise: 'Get focused personal guidance.', image: require('../../assets/media/community/member-06.png') },
];

const supportingDestinations = [
  { key: 'mentors', title: 'Meet our mentors', firstLine: 'Meet our', secondLine: 'mentors', action: 'Browse mentors', kind: 'mentors' as const },
  { key: 'my', title: 'My mentorship', firstLine: 'My', secondLine: 'mentorship', action: 'View sessions', kind: 'sessions' as const },
];

export function MentorshipOverview() {
  const { width } = useWindowDimensions();
  const cardWidth = Math.min(Math.round(width * 0.76), 300);
  const wideExplore = width >= 600;

  return <Screen>
    <DestinationHeader compact eyebrow="MENTORSHIP & GUIDANCE" title="Connect with mentors." copy="Find the right guidance for your next move."/>

    <View style={styles.head}>
      <Text style={styles.kicker}>THREE WAYS TO BE MENTORED</Text>
      <Text style={styles.sectionTitle}>Choose your mentorship.</Text>
    </View>

    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      decelerationRate="fast"
      snapToInterval={cardWidth + 12}
      contentContainerStyle={styles.experienceList}
    >
      {mentorshipTypes.map((item, index) => <Pressable
        key={item.key}
        accessibilityRole="button"
        accessibilityLabel={item.title}
        onPress={() => router.push(`/mentorship/${item.key}` as Href)}
        style={({ pressed }) => [styles.experienceCard, { width: cardWidth }, pressed && styles.pressed]}
      >
        <View style={styles.cover}>
          <Image source={item.image} resizeMode="cover" style={styles.coverImage}/>
          <View style={styles.coverLabel}><Text style={styles.coverLabelText}>{item.label}</Text></View>
          <View style={styles.numberTab}>
            <Text style={styles.numberLabel}>path</Text>
            <Text style={styles.number}>{String(index + 1).padStart(2, '0')}</Text>
          </View>
        </View>
        <View style={styles.experienceBody}>
          <Text style={styles.experienceTitle}>{item.title}</Text>
          <View style={styles.experienceFooter}>
            <Text style={styles.experiencePromise}>{item.promise}</Text>
            <Ionicons name="arrow-forward" size={20} color={colors.pinkDeep}/>
          </View>
        </View>
      </Pressable>)}
    </ScrollView>

    <Text style={styles.exploreLabel}>EXPLORE MORE</Text>
    <View style={[styles.supportingList, wideExplore && styles.supportingListWide]}>
      {supportingDestinations.map(item => <Pressable
        key={item.key}
        accessibilityRole="button"
        accessibilityLabel={item.title}
        onPress={() => router.push(`/mentorship/${item.key}` as Href)}
        style={({ pressed }) => [styles.supportingCard, item.kind === 'mentors' && styles.supportingCardPink, wideExplore && styles.supportingCardHalf, pressed && styles.pressed]}
      >
        <MentorshipArtwork kind={item.kind} compact={wideExplore}/>
        <View style={styles.supportingCopy}>
          <Text style={[styles.supportingTitle, wideExplore && styles.supportingTitleCompact, item.kind === 'mentors' && styles.supportingTitleLight]}>{item.firstLine}</Text>
          <Text style={[styles.supportingSubtitle, wideExplore && styles.supportingTitleCompact, item.kind === 'mentors' && styles.supportingSubtitleLight]}>{item.secondLine}</Text>
          <View style={styles.supportingAction}>
            <View style={[styles.actionCircle, item.kind === 'mentors' && styles.actionCircleLight]}><Ionicons name="arrow-forward" size={16} style={{ transform: [{ rotate: '-45deg' }] }} color={item.kind === 'mentors' ? colors.pinkDeep : 'white'}/></View>
            <Text style={[styles.actionLabel, item.kind === 'mentors' && styles.supportingTitleLight]}>{item.action}</Text>
          </View>
        </View>
      </Pressable>)}
    </View>
  </Screen>;
}

const styles = StyleSheet.create({
  head: { marginTop: 18, marginBottom: 14 },
  kicker: { color: colors.pinkDeep, fontSize: 9, fontFamily: fonts.bodyBold, letterSpacing: 0.95 },
  sectionTitle: { color: colors.ink, fontSize: 22, lineHeight: 28, fontFamily: fonts.headingBold, letterSpacing: -0.6, marginTop: 5 },
  experienceList: { gap: 12, paddingRight: 2, alignItems: 'stretch' },
  experienceCard: { borderRadius: 28, padding: 8, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, overflow: 'hidden' },
  pressed: { opacity: 0.9, transform: [{ scale: 0.985 }], borderColor: '#DFA8C0' },
  cover: { height: 132, borderTopLeftRadius: 21, borderTopRightRadius: 21, overflow: 'hidden', backgroundColor: colors.pinkSoft },
  coverImage: { position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' },
  coverLabel: { position: 'absolute', left: 12, top: 12, backgroundColor: 'rgba(17,16,17,0.65)', borderRadius: 7, paddingHorizontal: 9, paddingVertical: 6 },
  coverLabelText: { color: 'white', fontSize: 10, lineHeight: 14, fontFamily: fonts.bodySemibold },
  numberTab: { position: 'absolute', bottom: -1, right: -1, minWidth: 92, height: 42, paddingLeft: 18, paddingRight: 12, borderTopLeftRadius: 24, backgroundColor: colors.surface, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 8 },
  numberLabel: { color: colors.muted, fontSize: 10, fontFamily: fonts.body },
  number: { color: colors.ink, fontSize: 25, lineHeight: 31, fontFamily: fonts.headingBold, letterSpacing: -1 },
  experienceBody: { flex: 1, minHeight: 166, paddingHorizontal: 13, paddingTop: 15, paddingBottom: 12 },
  experienceTitle: { color: colors.ink, fontSize: 25, lineHeight: 30, fontFamily: fonts.heading, letterSpacing: -0.7 },
  experienceFooter: { flexDirection: 'row', alignItems: 'flex-end', gap: 12, marginTop: 'auto', paddingTop: 20 },
  experiencePromise: { flex: 1, color: colors.muted, fontSize: 12, lineHeight: 18, fontFamily: fonts.body },
  exploreLabel: { color: colors.pinkDeep, fontSize: 10, fontFamily: fonts.bodyBold, letterSpacing: 0.9, marginTop: 28, marginBottom: 12 },
  supportingList: { gap: 12 },
  supportingListWide: { flexDirection: 'row', flexWrap: 'wrap' },
  supportingCard: { minHeight: 178, padding: 20, borderRadius: 22, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, overflow: 'hidden' },
  supportingCardPink: { backgroundColor: colors.pinkDeep, borderColor: colors.pinkDeep },
  supportingCardHalf: { width: '48.8%', minHeight: 192, padding: 16 },
  supportingCopy: { flex: 1, alignItems: 'flex-start' },
  supportingTitle: { color: colors.ink, fontSize: 23, lineHeight: 28, fontFamily: fonts.headingBold, letterSpacing: -0.6 },
  supportingTitleCompact: { fontSize: 20, lineHeight: 25 },
  supportingTitleLight: { color: 'white' },
  supportingSubtitle: { color: colors.muted, fontSize: 23, lineHeight: 28, fontFamily: fonts.headingBold, letterSpacing: -0.6, marginTop: 1 },
  supportingSubtitleLight: { color: '#F4B7D0' },
  supportingAction: { flexDirection: 'row', alignItems: 'center', gap: 9, marginTop: 'auto', paddingTop: 26 },
  actionCircle: { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center' },
  actionCircleLight: { backgroundColor: 'white' },
  actionLabel: { color: colors.ink, fontFamily: fonts.bodySemibold, fontSize: 10, lineHeight: 14 },
});
