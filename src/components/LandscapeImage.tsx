import { Image, StyleSheet, View, type ImageSourcePropType, type StyleProp, type ViewStyle } from 'react-native';

export function LandscapeImage({ source, style }: { source: ImageSourcePropType; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.frame, style]}>
    <Image source={source} resizeMode="cover" style={styles.image}/>
  </View>;
}

const styles = StyleSheet.create({
  frame: { width: '100%', aspectRatio: 16 / 9, overflow: 'hidden' },
  image: { position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' },
});
