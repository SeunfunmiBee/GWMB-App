import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, fonts } from '@/theme';

export function SignInGate({ title, copy }: { title: string; copy: string }) {
  return <View style={styles.gate}>
    <View style={styles.icon}><Ionicons name="lock-closed-outline" size={26} color={colors.pinkDeep}/></View>
    <Text style={styles.title}>{title}</Text>
    <Text style={styles.copy}>{copy}</Text>
    <Pressable onPress={() => router.push('/sign-in')} style={styles.primary}><Text style={styles.primaryText}>Sign in to continue</Text><Ionicons name="arrow-forward" size={18} color="white"/></Pressable>
    <Pressable onPress={() => router.push('/sign-up')} style={styles.secondary}><Text style={styles.secondaryText}>Create an account</Text></Pressable>
  </View>;
}

const styles = StyleSheet.create({
  gate: { marginTop: 24, borderRadius: 24, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, padding: 24, alignItems: 'center' },
  icon: { width: 62, height: 62, borderRadius: 21, backgroundColor: colors.pinkSoft, alignItems: 'center', justifyContent: 'center' },
  title: { color: colors.ink, fontSize: 19, lineHeight: 24, fontFamily: fonts.headingBold, textAlign: 'center', marginTop: 16 },
  copy: { color: colors.muted, fontSize: 11, lineHeight: 18, fontFamily: fonts.body, textAlign: 'center', marginTop: 7, maxWidth: 305 },
  primary: { alignSelf: 'stretch', minHeight: 52, borderRadius: 16, backgroundColor: colors.pinkDeep, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 20 },
  primaryText: { color: 'white', fontSize: 11, fontFamily: fonts.bodyBold },
  secondary: { minHeight: 45, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18 },
  secondaryText: { color: colors.pinkDeep, fontSize: 10, fontFamily: fonts.bodyBold },
});
