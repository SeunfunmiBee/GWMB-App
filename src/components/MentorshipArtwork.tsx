import { Image, StyleSheet, Text, View } from 'react-native';

export function MentorshipArtwork({ kind, compact = false }: { kind: 'mentors' | 'sessions'; compact?: boolean }) {
  return <View pointerEvents="none" accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[styles.stage, compact && styles.stageCompact]}>
    {kind === 'mentors' ? <>
      <View style={styles.profileBack}><Image source={require('../../assets/media/community/member-04.png')} style={styles.backPhoto}/><View style={styles.backLine}/></View>
      <View style={styles.profileFront}>
        <Image source={require('../../assets/media/community/member-01.png')} style={styles.frontPhoto}/>
        <Text style={styles.profileLabel}>GWMB MENTORS</Text>
        <View style={styles.profileLine}/><View style={[styles.profileLine, styles.shortLine]}/>
      </View>
    </> : <>
      <View style={styles.plannerBack}/>
      <View style={styles.planner}>
        <View style={styles.binding}>{[0, 1, 2, 3].map(item => <View key={item} style={styles.ring}/>)}</View>
        <Text style={styles.plannerLabel}>MY PLAN</Text>
        <View style={styles.plannerRule}/>
        {[0, 1, 2].map(item => <View key={item} style={styles.planRow}><View style={[styles.planCheck, item === 0 && styles.planCheckDone]}/><View style={[styles.planLine, item === 1 && styles.shortLine]}/></View>)}
        <View style={styles.pageCorner}/>
      </View>
    </>}
  </View>;
}

const styles = StyleSheet.create({
  stage: { position: 'absolute', width: 176, height: 190, right: -14, bottom: -14 },
  stageCompact: { right: -42, bottom: -27, transform: [{ scale: 0.78 }] },
  profileBack: { position: 'absolute', top: 18, right: 9, width: 109, height: 143, padding: 9, backgroundColor: '#F5E6ED', borderRadius: 13, transform: [{ perspective: 600 }, { rotateY: '-12deg' }, { rotateZ: '15deg' }], boxShadow: '0px 7px 15px rgba(57,9,31,0.18)' },
  backPhoto: { width: 90, height: 98, borderRadius: 7 },
  backLine: { width: 58, height: 4, borderRadius: 2, backgroundColor: '#CCB0BF', marginTop: 10 },
  profileFront: { position: 'absolute', top: 38, right: 47, width: 111, height: 146, padding: 10, backgroundColor: 'white', borderRadius: 13, transform: [{ perspective: 600 }, { rotateY: '-16deg' }, { rotateZ: '-12deg' }], boxShadow: '0px 10px 18px rgba(57,9,31,0.22)' },
  frontPhoto: { width: 90, height: 82, borderRadius: 7 },
  profileLabel: { fontSize: 7, lineHeight: 10, fontWeight: '700', color: '#30222A', marginTop: 9, letterSpacing: 0.5 },
  profileLine: { height: 3, borderRadius: 2, backgroundColor: '#DDD2D8', width: 74, marginTop: 6 },
  shortLine: { width: 45 },
  plannerBack: { position: 'absolute', top: 31, right: 19, width: 114, height: 151, borderRadius: 12, backgroundColor: '#AA1859', transform: [{ perspective: 600 }, { rotateY: '-18deg' }, { rotateZ: '13deg' }], boxShadow: '0px 10px 18px rgba(17,16,17,0.14)' },
  planner: { position: 'absolute', top: 19, right: 31, width: 113, height: 153, borderRadius: 11, borderLeftWidth: 7, borderLeftColor: '#20181D', paddingHorizontal: 12, paddingTop: 27, backgroundColor: '#FFFDF9', transform: [{ perspective: 600 }, { rotateY: '-18deg' }, { rotateZ: '13deg' }], boxShadow: '0px 4px 8px rgba(17,16,17,0.12)' },
  binding: { position: 'absolute', top: -7, left: 12, right: 7, flexDirection: 'row', justifyContent: 'space-between' },
  ring: { width: 10, height: 19, borderRadius: 6, borderWidth: 3, borderColor: '#BEBAC0', backgroundColor: '#FFFDF9' },
  plannerLabel: { fontSize: 11, fontWeight: '800', letterSpacing: 0.7, color: '#21151C' },
  plannerRule: { height: 3, backgroundColor: '#B11B5E', width: 28, borderRadius: 2, marginTop: 9, marginBottom: 7 },
  planRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 11 },
  planCheck: { width: 9, height: 9, borderRadius: 2, borderWidth: 1, borderColor: '#C6BDC3' },
  planCheckDone: { backgroundColor: '#B11B5E', borderColor: '#B11B5E' },
  planLine: { height: 3, width: 49, borderRadius: 2, backgroundColor: '#D6CED3' },
  pageCorner: { position: 'absolute', bottom: 0, right: 0, width: 17, height: 17, backgroundColor: '#ECE3E8', borderTopLeftRadius: 6, borderBottomRightRadius: 10 },
});
