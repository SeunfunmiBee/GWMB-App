import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { Screen } from '@/components/Screen';
import { listAdminContent } from '@/lib/admin-content';
import { colors, fonts } from '@/theme';

type Icon = keyof typeof Ionicons.glyphMap;

const libraries: { area: string; label: string; icon: Icon; href: string }[] = [
  { area: 'courses', label: 'Courses', icon: 'school-outline', href: '/education?type=course' },
  { area: 'events', label: 'Events', icon: 'calendar-outline', href: '/education?type=event' },
  { area: 'resources', label: 'Resources', icon: 'document-text-outline', href: '/education?type=resource' },
  { area: 'member-wins', label: 'Member Spotlights', icon: 'star-outline', href: '/content?area=member-wins' },
];
const shortcuts: { title: string; copy: string; icon: Icon; href: string }[] = [
  { title: 'Membership', copy: 'Review and approve member applications', icon: 'checkmark-done-outline', href: '/approvals' },
  { title: 'Applications', copy: 'Opportunity applications from members', icon: 'briefcase-outline', href: '/applications' },
  { title: 'Mentorship', copy: 'Mentors, sessions and attendance', icon: 'people-outline', href: '/mentorship' },
  { title: 'CV reviews', copy: 'Give feedback on submitted CVs', icon: 'document-text-outline', href: '/cvs' },
  { title: 'Notifications', copy: 'Send and schedule member messages', icon: 'notifications-outline', href: '/notifications' },
  { title: 'Operations', copy: 'Account requests, support and errors', icon: 'pulse-outline', href: '/operations' },
];

const go = (href: string) => router.push(href as never);

export default function AdminDashboard() {
  const { width } = useWindowDimensions();
  const [counts, setCounts] = useState<Record<string, number>>({});
  useEffect(() => {
    void listAdminContent().then(({ data }) => setCounts(data.reduce<Record<string, number>>((acc, item) => ({ ...acc, [item.area]: (acc[item.area] ?? 0) + 1 }), {})));
  }, []);
  const total = Object.values(counts).reduce((sum, value) => sum + value, 0);
  const libraryColumns = width >= 1200 ? 4 : width >= 640 ? 2 : 1;
  const shortcutColumns = width >= 1200 ? 3 : width >= 640 ? 2 : 1;
  const cell = (columns: number) => ({ width: `${100 / columns}%` as const, padding: 6 });

  return <Screen>
    <View style={styles.top}>
      <View style={styles.topCopy}><Text style={styles.kicker}>GWMB ADMIN</Text><Text style={styles.pageTitle}>Dashboard</Text></View>
      <Pressable accessibilityRole="button" onPress={() => go('/create')} style={({ hovered }) => [styles.create, hovered && styles.createHover]}><Ionicons name="add" size={20} color="white"/><Text style={styles.createText}>Create</Text></Pressable>
    </View>

    <View style={[styles.hero, width < 640 && styles.heroStacked]}>
      <Pressable onPress={() => go('/calendar')} style={({ hovered }) => [styles.calendar, hovered && styles.lift]}>
        <View style={styles.calendarIcon}><Ionicons name="calendar-outline" size={22} color="white"/></View>
        <View style={styles.flex}><Text style={styles.calendarEyebrow}>OPERATIONS CALENDAR</Text><Text style={styles.calendarTitle}>See everything happening across GWMB</Text></View>
        <Ionicons name="arrow-forward" size={18} color="white"/>
      </Pressable>
      <View style={styles.stats}>
        {[['Content records', total], ['Events', counts.events ?? 0], ['Courses', counts.courses ?? 0]].map(([label, value], index) => <View key={label} style={[styles.stat, index > 0 && styles.statDivided]}>
          <Text style={styles.statValue}>{value}</Text><Text style={styles.statLabel}>{label}</Text>
        </View>)}
      </View>
    </View>

    <View style={styles.sectionHead}><Text style={styles.section}>Content library</Text><Pressable onPress={() => go('/education')} style={styles.sectionLink}><Text style={styles.viewAll}>View all</Text><Ionicons name="arrow-forward" size={15} color={colors.ink}/></Pressable></View>
    <View style={styles.grid}>{libraries.map(item => <View key={item.area} style={cell(libraryColumns)}>
      <Pressable onPress={() => go(item.href)} style={({ hovered }) => [styles.card, hovered && styles.cardHover]}>
        <View style={styles.cardIcon}><Ionicons name={item.icon} size={22} color={colors.ink}/></View>
        <Text style={styles.cardTitle}>{item.label}</Text>
        <Text style={styles.cardMeta}>{counts[item.area] ?? 0} items</Text>
      </Pressable>
    </View>)}</View>

    <Text style={[styles.section, styles.sectionSpaced]}>Manage</Text>
    <View style={styles.grid}>{shortcuts.map(item => <View key={item.href} style={cell(shortcutColumns)}>
      <Pressable onPress={() => go(item.href)} style={({ hovered }) => [styles.shortcut, hovered && styles.cardHover]}>
        <View style={styles.shortcutIcon}><Ionicons name={item.icon} size={20} color={colors.pinkDeep}/></View>
        <View style={styles.flex}><Text style={styles.shortcutTitle}>{item.title}</Text><Text style={styles.shortcutCopy}>{item.copy}</Text></View>
        <Ionicons name="chevron-forward" size={18} color="#A39CA0"/>
      </Pressable>
    </View>)}</View>
  </Screen>;
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  top: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, marginBottom: 24 },
  topCopy: { flex: 1 },
  kicker: { fontFamily: fonts.bodyBold, fontSize: 12, letterSpacing: 1.4, color: colors.pinkDeep },
  pageTitle: { fontFamily: fonts.heading, fontSize: 36, lineHeight: 42, color: colors.ink, letterSpacing: -1.2, marginTop: 4 },
  create: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 44, paddingHorizontal: 18, borderRadius: 12, backgroundColor: colors.ink },
  createHover: { backgroundColor: '#2C282B' },
  createText: { fontFamily: fonts.bodyBold, fontSize: 14, color: 'white' },
  hero: { flexDirection: 'row', gap: 12 },
  heroStacked: { flexDirection: 'column' },
  calendar: { flex: 1.2, minHeight: 104, borderRadius: 18, backgroundColor: colors.ink, padding: 20, flexDirection: 'row', alignItems: 'center', gap: 14 },
  lift: { transform: [{ translateY: -1 }], shadowColor: '#000', shadowOpacity: 0.14, shadowRadius: 16 },
  calendarIcon: { width: 48, height: 48, borderRadius: 14, backgroundColor: '#463A49', alignItems: 'center', justifyContent: 'center' },
  calendarEyebrow: { fontFamily: fonts.bodyBold, fontSize: 11, letterSpacing: 1, color: '#BFB7BC' },
  calendarTitle: { fontFamily: fonts.headingBold, fontSize: 17, lineHeight: 23, color: 'white', marginTop: 5 },
  stats: { flex: 1, minHeight: 104, borderRadius: 18, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, flexDirection: 'row', alignItems: 'center' },
  stat: { flex: 1, paddingHorizontal: 20 },
  statDivided: { borderLeftWidth: 1, borderLeftColor: colors.line },
  statValue: { fontFamily: fonts.heading, fontSize: 28, color: colors.ink },
  statLabel: { fontFamily: fonts.body, fontSize: 13, color: colors.muted, marginTop: 2 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 36, marginBottom: 8 },
  section: { fontFamily: fonts.heading, fontSize: 21, color: colors.ink },
  sectionSpaced: { marginTop: 30, marginBottom: 8 },
  sectionLink: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  viewAll: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.ink },
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -6 },
  card: { minHeight: 150, borderRadius: 18, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, padding: 18 },
  cardHover: { borderColor: '#CFC8CC', shadowColor: '#000', shadowOpacity: 0.07, shadowRadius: 14 },
  cardIcon: { width: 44, height: 44, borderRadius: 13, backgroundColor: '#F4F2F3', alignItems: 'center', justifyContent: 'center' },
  cardTitle: { fontFamily: fonts.headingBold, fontSize: 16, color: colors.ink, marginTop: 'auto' },
  cardMeta: { fontFamily: fonts.body, fontSize: 13, color: colors.muted, marginTop: 3 },
  shortcut: { minHeight: 82, borderRadius: 16, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 14 },
  shortcutIcon: { width: 42, height: 42, borderRadius: 12, backgroundColor: colors.pinkSoft, alignItems: 'center', justifyContent: 'center' },
  shortcutTitle: { fontFamily: fonts.headingBold, fontSize: 15, color: colors.ink },
  shortcutCopy: { fontFamily: fonts.body, fontSize: 13, color: colors.muted, marginTop: 3 },
});
