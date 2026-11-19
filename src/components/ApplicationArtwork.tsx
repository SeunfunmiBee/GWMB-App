import { StyleSheet, Text, View } from 'react-native';

export function ApplicationArtwork({ kind, compact = false }: { kind: 'profile' | 'cv'; compact?: boolean }) {
  return <View pointerEvents="none" accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[styles.stage, compact && styles.compact]}>
    <View style={[styles.backPage, kind === 'cv' && styles.backPageDark]}/>
    <View style={styles.page}>
      <Text style={styles.documentTitle}>{kind === 'profile' ? 'PROFILE' : 'CV'}</Text>
      <View style={styles.accent}/>
      <View style={styles.sectionLine}/><View style={styles.line}/><View style={[styles.line, styles.shortLine]}/>
      <View style={[styles.sectionLine, styles.secondSection]}/><View style={styles.line}/><View style={styles.line}/><View style={[styles.line, styles.shortLine]}/>
      <View style={styles.pageFold}/>
    </View>
    {kind === 'profile' ? <View style={styles.detailsSlip}><Text style={styles.slipLabel}>YOUR DETAILS</Text><View style={styles.slipLine}/><View style={[styles.slipLine, styles.shortLine]}/></View> : <View style={styles.pencil}><View style={styles.pencilCap}/><View style={styles.pencilTip}/></View>}
  </View>;
}

const styles = StyleSheet.create({
  stage: { position: 'absolute', width: 168, height: 190, right: -20, bottom: -14 },
  compact: { right: -42, bottom: -25, transform: [{ scale: 0.78 }] },
  backPage: { position: 'absolute', right: 12, top: 17, width: 111, height: 151, borderRadius: 10, backgroundColor: '#E5A6C2', transform: [{ perspective: 600 }, { rotateY: '-12deg' }, { rotateZ: '13deg' }], boxShadow: '0px 9px 16px rgba(56,11,32,0.16)' },
  backPageDark: { backgroundColor: '#33272E' },
  page: { position: 'absolute', right: 27, top: 30, width: 112, height: 151, borderRadius: 9, padding: 13, backgroundColor: '#FFFDFB', transform: [{ perspective: 600 }, { rotateY: '-13deg' }, { rotateZ: '-9deg' }], boxShadow: '0px 10px 18px rgba(24,12,19,0.18)' },
  documentTitle: { color: '#231920', fontSize: 15, lineHeight: 20, fontWeight: '800', letterSpacing: 0.7 },
  accent: { width: 25, height: 3, borderRadius: 2, backgroundColor: '#AD1958', marginTop: 7, marginBottom: 11 },
  sectionLine: { width: 49, height: 4, backgroundColor: '#7D7078', borderRadius: 2, marginBottom: 2 },
  secondSection: { marginTop: 11 },
  line: { width: 78, height: 3, backgroundColor: '#D9CFD5', borderRadius: 2, marginTop: 6 },
  shortLine: { width: 45 },
  pageFold: { position: 'absolute', right: 0, bottom: 0, width: 17, height: 17, borderTopLeftRadius: 6, borderBottomRightRadius: 8, backgroundColor: '#EAE0E6' },
  detailsSlip: { position: 'absolute', right: 51, bottom: 5, width: 102, height: 51, padding: 9, borderRadius: 7, backgroundColor: '#F7E1EA', transform: [{ rotate: '-13deg' }], boxShadow: '0px 5px 9px rgba(24,12,19,0.12)' },
  slipLabel: { color: '#7D1643', fontSize: 6, lineHeight: 9, fontWeight: '800', letterSpacing: 0.7 },
  slipLine: { width: 68, height: 3, borderRadius: 2, backgroundColor: '#D8ADBF', marginTop: 5 },
  pencil: { position: 'absolute', width: 10, height: 119, right: 19, top: 49, backgroundColor: '#AD1958', borderRadius: 3, borderLeftWidth: 3, borderLeftColor: '#D5538B', transform: [{ rotate: '24deg' }], boxShadow: '2px 4px 5px rgba(24,12,19,0.2)' },
  pencilCap: { height: 11, backgroundColor: '#D9C1CD', borderTopLeftRadius: 3, borderTopRightRadius: 3 },
  pencilTip: { position: 'absolute', bottom: -7, left: -3, width: 10, height: 9, borderBottomLeftRadius: 5, borderBottomRightRadius: 5, backgroundColor: '#BA956C' },
});
