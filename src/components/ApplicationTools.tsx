import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { ApplicationArtwork } from '@/components/ApplicationArtwork';
import { tapFeedback } from '@/lib/feedback';
import { colors, fonts } from '@/theme';

const tools = [
  { kind: 'profile', title: 'Application Profile', eyebrow: 'APPLICATION DETAILS', firstLine: 'Application', secondLine: 'Profile', action: 'Edit profile', hint: 'Save your experience and details to reuse in applications.', route: '/application-profile' },
  { kind: 'cv', title: 'CV Builder', eyebrow: 'APPLICATION TOOL', firstLine: 'CV', secondLine: 'Builder', action: 'Build your CV', hint: 'Build, edit and save a CV before you apply.', route: '/cv' },
] as const;

export function ApplicationTools() {
  const { width } = useWindowDimensions();
  const compact = width >= 600;

  return <View style={[styles.list, compact && styles.listWide]}>
    {tools.map(item => <Pressable
      key={item.kind}
      accessibilityRole="button"
      accessibilityLabel={item.title}
      accessibilityHint={item.hint}
      onPress={() => { void tapFeedback(); router.push(item.route); }}
      style={({ pressed }) => [styles.card, item.kind === 'profile' && styles.pinkCard, compact && styles.halfCard, pressed && styles.pressed]}
    >
      <ApplicationArtwork kind={item.kind} compact={compact}/>
      <View style={styles.copy}>
        <Text style={[styles.eyebrow, item.kind === 'profile' && styles.eyebrowLight]}>{item.eyebrow}</Text>
        <Text style={[styles.title, compact && styles.compactTitle, item.kind === 'profile' && styles.light]}>{item.firstLine}</Text>
        <Text style={[styles.subtitle, compact && styles.compactTitle, item.kind === 'profile' && styles.subtitleLight]}>{item.secondLine}</Text>
        <View style={styles.action}>
          <View style={[styles.actionCircle, item.kind === 'profile' && styles.actionCircleLight]}><Ionicons name="arrow-forward" size={16} style={styles.arrow} color={item.kind === 'profile' ? colors.pinkDeep : 'white'}/></View>
          <Text style={[styles.actionLabel, item.kind === 'profile' && styles.light]}>{item.action}</Text>
        </View>
      </View>
    </Pressable>)}
  </View>;
}

const styles = StyleSheet.create({
  list: { gap: 12 },
  listWide: { flexDirection: 'row', flexWrap: 'wrap' },
  card: { minHeight: 194, borderRadius: 22, padding: 20, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, overflow: 'hidden' },
  pinkCard: { backgroundColor: colors.pinkDeep, borderColor: colors.pinkDeep },
  halfCard: { width: '48.8%', minHeight: 208, padding: 16 },
  pressed: { opacity: 0.9, transform: [{ scale: 0.985 }] },
  copy: { flex: 1, alignItems: 'flex-start' },
  eyebrow: { color: colors.pinkDeep, fontSize: 8, lineHeight: 12, fontFamily: fonts.bodyBold, letterSpacing: 0.65, marginBottom: 6 },
  eyebrowLight: { color: '#F6C7DC' },
  title: { color: colors.ink, fontSize: 23, lineHeight: 28, fontFamily: fonts.headingBold, letterSpacing: -0.6 },
  subtitle: { color: colors.muted, fontSize: 23, lineHeight: 28, fontFamily: fonts.headingBold, letterSpacing: -0.6, marginTop: 1 },
  compactTitle: { fontSize: 20, lineHeight: 25 },
  light: { color: 'white' },
  subtitleLight: { color: '#F4B7D0' },
  action: { flexDirection: 'row', alignItems: 'center', gap: 9, marginTop: 'auto', paddingTop: 24 },
  actionCircle: { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center' },
  actionCircleLight: { backgroundColor: 'white' },
  actionLabel: { color: colors.ink, fontSize: 10, lineHeight: 14, fontFamily: fonts.bodySemibold },
  arrow: { transform: [{ rotate: '-45deg' }] },
});
