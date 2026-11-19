import { Ionicons } from '@expo/vector-icons';
import { router, usePathname } from 'expo-router';
import { useState, type PropsWithChildren } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { WideLayout } from '@/lib/wide-layout';
import { useAuth } from '@/providers/AuthProvider';
import { colors, fonts } from '@/theme';

type Icon = keyof typeof Ionicons.glyphMap;
type NavItem = { label: string; href: string; icon: Icon };

const NAV: { group: string; items: NavItem[] }[] = [
  { group: 'Overview', items: [
    { label: 'Dashboard', href: '/', icon: 'grid-outline' },
    { label: 'Calendar', href: '/calendar', icon: 'calendar-outline' },
  ] },
  { group: 'Content', items: [
    { label: 'Content library', href: '/education', icon: 'school-outline' },
    { label: 'App content', href: '/content?area=home', icon: 'color-palette-outline' },
    { label: 'Notifications', href: '/notifications', icon: 'notifications-outline' },
  ] },
  { group: 'People', items: [
    { label: 'Membership', href: '/approvals', icon: 'checkmark-done-outline' },
    { label: 'Applications', href: '/applications', icon: 'briefcase-outline' },
    { label: 'Mentorship', href: '/mentorship', icon: 'people-outline' },
    { label: 'Local chapters', href: '/local-admins', icon: 'location-outline' },
  ] },
  { group: 'Careers', items: [
    { label: 'CV reviews', href: '/cvs', icon: 'document-text-outline' },
    { label: 'Career Readiness', href: '/career-readiness', icon: 'ribbon-outline' },
    { label: 'Interview questions', href: '/career-readiness-questions', icon: 'chatbubbles-outline' },
  ] },
  { group: 'System', items: [
    { label: 'Integrations', href: '/integrations', icon: 'videocam-outline' },
    { label: 'Operations', href: '/operations', icon: 'pulse-outline' },
  ] },
];

const DESKTOP_MIN_WIDTH = 960;

// Section a path belongs to, so detail pages (e.g. /mentor/123) keep their parent highlighted.
const SECTION_OF: Record<string, string> = { builder: '/education', 'content-editor': '/content', content: '/content', mentor: '/mentorship', 'mentorship-session': '/mentorship', 'mentor-import': '/mentorship', create: '/' };
function isActive(pathname: string, href: string) {
  const base = href.split('?')[0];
  const first = pathname.split('/')[1] ?? '';
  const section = SECTION_OF[first] ?? `/${first}`;
  return base === '/' ? section === '/' : section === base;
}

function Nav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const { user, signOut } = useAuth();
  return <View style={styles.nav}>
    <View style={styles.brand}><View style={styles.mark}><Text style={styles.markText}>G</Text></View><View><Text style={styles.brandTitle}>GWMB</Text><Text style={styles.brandSub}>Admin workspace</Text></View></View>
    <ScrollView style={styles.navScroll} showsVerticalScrollIndicator={false}>
      {NAV.map(section => <View key={section.group} style={styles.group}>
        <Text style={styles.groupLabel}>{section.group}</Text>
        {section.items.map(item => {
          const active = isActive(pathname, item.href);
          return <Pressable key={item.href} accessibilityRole="link" accessibilityState={{ selected: active }} onPress={() => { onNavigate?.(); router.push(item.href as never); }} style={({ hovered }) => [styles.item, hovered && !active && styles.itemHover, active && styles.itemActive]}>
            <Ionicons name={item.icon} size={17} color={active ? 'white' : '#5E585C'}/>
            <Text style={[styles.itemText, active && styles.itemTextActive]} numberOfLines={1}>{item.label}</Text>
          </Pressable>;
        })}
      </View>)}
    </ScrollView>
    <View style={styles.footer}>
      <Text style={styles.footerEmail} numberOfLines={1}>{user?.email}</Text>
      <Pressable accessibilityRole="button" onPress={() => void signOut()} style={({ hovered }) => [styles.signOut, hovered && styles.itemHover]}><Ionicons name="log-out-outline" size={16} color={colors.muted}/><Text style={styles.signOutText}>Sign out</Text></Pressable>
    </View>
  </View>;
}

export function AdminShell({ children }: PropsWithChildren) {
  const { width } = useWindowDimensions();
  const [menuOpen, setMenuOpen] = useState(false);
  const desktop = width >= DESKTOP_MIN_WIDTH;

  return <WideLayout.Provider value>
    <View style={[styles.root, !desktop && styles.rootStacked]}>
      {desktop ? <View style={styles.sidebar}><Nav/></View> : <View style={styles.topBar}>
        <Pressable accessibilityRole="button" accessibilityLabel="Open menu" onPress={() => setMenuOpen(true)} style={styles.menuButton}><Ionicons name="menu" size={22} color={colors.ink}/></Pressable>
        <Text style={styles.topTitle}>GWMB Admin</Text>
      </View>}
      <View style={styles.main}>{children}</View>
      {!desktop && menuOpen ? <View style={StyleSheet.absoluteFill}>
        <Pressable accessibilityLabel="Close menu" onPress={() => setMenuOpen(false)} style={styles.scrim}/>
        <View style={styles.drawer}><Nav onNavigate={() => setMenuOpen(false)}/></View>
      </View> : null}
    </View>
  </WideLayout.Provider>;
}

const styles = StyleSheet.create({
  root: { flex: 1, flexDirection: 'row', backgroundColor: colors.canvas },
  rootStacked: { flexDirection: 'column' },
  sidebar: { width: 264, height: '100%', borderRightWidth: 1, borderRightColor: colors.line, backgroundColor: colors.surface },
  main: { flex: 1, minWidth: 0, minHeight: 0 },
  topBar: { width: '100%', height: 60, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: colors.line, backgroundColor: colors.surface },
  menuButton: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F3F1F2' },
  topTitle: { fontFamily: fonts.heading, fontSize: 17, color: colors.ink },
  scrim: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(17,16,17,0.38)' },
  drawer: { position: 'absolute', top: 0, bottom: 0, left: 0, width: 280, maxWidth: '86%', backgroundColor: colors.surface, shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 24 },
  nav: { flex: 1, paddingTop: 22 },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 11, paddingHorizontal: 20, paddingBottom: 20 },
  mark: { width: 38, height: 38, borderRadius: 11, backgroundColor: colors.pinkDeep, alignItems: 'center', justifyContent: 'center' },
  markText: { fontFamily: fonts.heading, fontSize: 18, color: 'white' },
  brandTitle: { fontFamily: fonts.heading, fontSize: 16, color: colors.ink, letterSpacing: -0.2 },
  brandSub: { fontFamily: fonts.body, fontSize: 12, color: colors.muted, marginTop: 1 },
  navScroll: { flex: 1, paddingHorizontal: 12 },
  group: { marginBottom: 18 },
  groupLabel: { fontFamily: fonts.bodyBold, fontSize: 11, letterSpacing: 1, textTransform: 'uppercase', color: '#9A9397', paddingHorizontal: 10, marginBottom: 6 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 11, minHeight: 38, paddingHorizontal: 10, borderRadius: 10 },
  itemHover: { backgroundColor: '#F4F2F3' },
  itemActive: { backgroundColor: colors.ink },
  itemText: { flex: 1, fontFamily: fonts.bodyMedium, fontSize: 14, color: '#3A3538' },
  itemTextActive: { color: 'white', fontFamily: fonts.bodySemibold },
  footer: { borderTopWidth: 1, borderTopColor: colors.line, padding: 14, gap: 8 },
  footerEmail: { fontFamily: fonts.body, fontSize: 12, color: colors.muted, paddingHorizontal: 6 },
  signOut: { flexDirection: 'row', alignItems: 'center', gap: 9, minHeight: 36, paddingHorizontal: 6, borderRadius: 10 },
  signOutText: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.muted },
});
