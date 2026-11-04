import { Ionicons } from '@expo/vector-icons';
import { usePathname } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { TabPageHeader } from '@/components/TabPageHeader';
import { goBackOr } from '@/lib/navigation';
import { colors, fonts } from '@/theme';

export function PageHeader({ title, eyebrow }: { title: string; eyebrow?: string }) {
  const pathname=usePathname();
  if(pathname==='/learn')return <TabPageHeader eyebrow="YOUR DEVELOPMENT" title="Learn" copy="Build practical skills you can use in the marketplace."/>;
  if(pathname==='/mentorship')return <TabPageHeader eyebrow="GUIDANCE FOR YOUR JOURNEY" title="Mentorship" copy="Explore careers and learn from women who have walked the path."/>;
  return (
    <View style={styles.row}>
      <Pressable accessibilityRole="button" accessibilityLabel="Go back" hitSlop={10} onPress={() => goBackOr('/')} style={styles.back}>
        <Ionicons name="arrow-back" size={20} color={colors.ink} />
      </Pressable>
      <View style={styles.copy}>
        {eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}
        <Text style={styles.title}>{title}</Text>
      </View>
      <View style={styles.balance} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { minHeight: 64, flexDirection: 'row', alignItems: 'center', marginBottom: 22 },
  back: { width: 48, height: 48, borderRadius: 24, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  copy: { flex: 1, alignItems: 'center' },
  eyebrow: { color: colors.pinkDeep, fontSize: 10.5, fontFamily: fonts.bodyBold, letterSpacing: 1.35, textTransform: 'uppercase' },
  title: { color: colors.ink, fontSize: 18, lineHeight: 23, fontFamily: fonts.headingBold, marginTop: 3, textAlign: 'center' },
  balance: { width: 48 },
});
