import type { PropsWithChildren } from 'react';
import { Platform, ScrollView, StyleSheet, View, type ScrollViewProps } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useWideLayout } from '@/lib/wide-layout';
import { colors } from '@/theme';

// form: in the wide admin layout, cap at a comfortable reading width for long forms.
type Props = PropsWithChildren<ScrollViewProps & { scroll?: boolean; form?: boolean }>;

export function Screen({ children, scroll = true, form = false, contentContainerStyle, ...props }: Props) {
  const wide = useWideLayout();
  const innerStyle = [styles.inner, Platform.OS === 'web' && styles.webInner, wide && styles.wideInner, wide && form && styles.formInner];
  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {scroll ? (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[styles.scrollContent, contentContainerStyle]}
          {...props}
        >
          <View style={innerStyle}>{children}</View>
        </ScrollView>
      ) : (
        <View style={[styles.scrollContent, styles.fill]}><View style={[innerStyle, styles.fill]}>{children}</View></View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas },
  scrollContent: { width: '100%', alignItems: 'center', paddingTop: 10, paddingBottom: 32 },
  inner: { width: '92%', maxWidth: 520, minWidth: 0 },
  webInner: {
    width: '92%',
    maxWidth: 520,
    minWidth: 0,
  },
  wideInner: { width: '100%', maxWidth: 1160, paddingHorizontal: 32, paddingTop: 18 },
  formInner: { maxWidth: 860 },
  fill: { flex: 1 },
});
