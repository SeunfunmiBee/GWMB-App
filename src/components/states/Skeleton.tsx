import { useEffect, useState } from 'react';
import { Animated, StyleSheet, View, type ViewStyle } from 'react-native';

import { colors } from '@/theme';

export function Skeleton({ style }: { style?: ViewStyle | ViewStyle[] }) {
  const [opacity] = useState(() => new Animated.Value(.42));
  useEffect(() => {
    const animation = Animated.loop(Animated.sequence([
      Animated.timing(opacity,{toValue:.9,duration:700,useNativeDriver:true}),
      Animated.timing(opacity,{toValue:.42,duration:700,useNativeDriver:true}),
    ]));
    animation.start();
    return () => animation.stop();
  },[opacity]);
  return <Animated.View accessibilityLabel="Loading" style={[styles.block,style,{opacity}]}/>;
}

export function ScreenSkeleton({ rows = 3 }: { rows?: number }) {
  return <View style={styles.screen} accessibilityLabel="Loading content">
    <Skeleton style={styles.hero}/>
    <View style={styles.chips}><Skeleton style={styles.chip}/><Skeleton style={styles.chip}/><Skeleton style={styles.shortChip}/></View>
    {Array.from({length:rows},(_,index)=><View key={index} style={styles.card}><Skeleton style={styles.icon}/><View style={styles.copy}><Skeleton style={styles.title}/><Skeleton style={styles.line}/><Skeleton style={styles.shortLine}/></View></View>)}
  </View>;
}

const styles = StyleSheet.create({
  block:{backgroundColor:'#E9E6E8',overflow:'hidden'},
  screen:{width:'100%',gap:12,paddingTop:4},
  hero:{height:128,borderRadius:24},
  chips:{flexDirection:'row',gap:8},
  chip:{height:38,width:94,borderRadius:13},
  shortChip:{height:38,width:72,borderRadius:13},
  card:{minHeight:112,borderRadius:21,borderWidth:1,borderColor:colors.line,backgroundColor:colors.surface,padding:15,flexDirection:'row',alignItems:'center',gap:13},
  icon:{width:48,height:48,borderRadius:15},
  copy:{flex:1,gap:9},
  title:{height:15,width:'72%',borderRadius:7},
  line:{height:10,width:'92%',borderRadius:5},
  shortLine:{height:10,width:'54%',borderRadius:5},
});
