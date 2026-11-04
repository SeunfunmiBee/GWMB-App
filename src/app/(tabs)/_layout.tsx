import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { useEffect, useState, type ComponentProps } from 'react';
import { Animated, Platform, StyleSheet, View, type ColorValue } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { tapFeedback } from '@/lib/feedback';
import { usePublishedContent } from '@/lib/content-runtime';
import { opportunities } from '@/data/opportunities';
import { colors, fonts } from '@/theme';

type IconName = ComponentProps<typeof Ionicons>['name'];

function AnimatedTabIcon({ color, focused, name, focusedName, showDot }: { color: ColorValue; focused: boolean; name: IconName; focusedName?: IconName; showDot?: boolean }) {
  const [progress] = useState(() => new Animated.Value(focused ? 1 : 0));

  useEffect(() => {
    Animated.spring(progress, {
      toValue: focused ? 1 : 0,
      speed: 24,
      bounciness: 7,
      useNativeDriver: Platform.OS !== 'web',
    }).start();
  }, [focused, progress]);

  return <Animated.View style={[styles.iconShell, { transform: [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [0, -1] }) }, { scale: progress.interpolate({ inputRange: [0, 1], outputRange: [1, 1.04] }) }] }]}>
    <Animated.View style={[styles.activePill, { opacity: progress, transform: [{ scaleX: progress.interpolate({ inputRange: [0, 1], outputRange: [.72, 1] }) }] }]}/>
    <Ionicons name={focused && focusedName ? focusedName : name} color={color} size={21} />
    {showDot ? <View style={[styles.updateDot, focused && styles.updateDotFocused]}/> : null}
  </Animated.View>;
}

const icon = (name: IconName, focusedName?: IconName, showDot = false) =>
  function TabIcon({ color, size, focused }: { color: ColorValue; size: number; focused: boolean }) {
    void size;
    return <AnimatedTabIcon color={color} focused={focused} name={name} focusedName={focusedName} showDot={showDot}/>;
  };

export default function TabLayout() {
  const insets = useSafeAreaInsets();
  const publishedOpportunities=usePublishedContent('opportunities');
  const opportunityCount=publishedOpportunities.length?publishedOpportunities.filter(item=>item.visible).length:opportunities.length;
  return (
    <Tabs
      screenListeners={{ tabPress: () => { void tapFeedback(); } }}
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.ink,
        tabBarInactiveTintColor: colors.ink,
        tabBarHideOnKeyboard: true,
        tabBarItemStyle: { paddingTop: 7, borderRadius: 18 },
        tabBarLabelStyle: { fontSize: 9, lineHeight: 12, fontFamily: fonts.bodySemibold, marginTop: 3 },
        tabBarBadgeStyle:{backgroundColor:colors.pinkDeep,color:'white',fontSize:8,lineHeight:17,fontFamily:fonts.bodyBold,minWidth:17,height:17,borderRadius:9,borderWidth:2,borderColor:'white'},
        tabBarStyle: {
          height: 66 + Math.max(insets.bottom, 5),
          paddingTop: 4,
          paddingBottom: Math.max(insets.bottom, 5),
          backgroundColor: colors.surface,
          borderTopWidth: 0,
          marginHorizontal: 14,
          marginBottom: 10,
          borderRadius: 26,
          borderWidth: 1,
          borderColor: '#EEE9EC',
          elevation: 13,
          shadowColor: '#231D20',
          shadowOpacity: .11,
          shadowRadius: 16,
          shadowOffset: { width: 0, height: 6 },
        },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Home', tabBarIcon: icon('home-outline', 'home') }} />
      <Tabs.Screen name="learn" options={{ title: 'Learn', tabBarIcon: icon('book-outline', 'book') }} />
      <Tabs.Screen name="mentorship" options={{ title: 'Mentorship', tabBarIcon: icon('chatbubbles-outline', 'chatbubbles') }} />
      <Tabs.Screen name="opportunities" options={{ title: 'Opportunities', tabBarBadge:opportunityCount||undefined, tabBarIcon: icon('briefcase-outline', 'briefcase') }} />
      <Tabs.Screen name="community" options={{ title: 'Community', tabBarIcon: icon('people-outline', 'people') }} />
      <Tabs.Screen name="grow" options={{ href: null }} />
      <Tabs.Screen name="profile" options={{ href: null }} />
      <Tabs.Screen name="grow 2" options={{ href: null }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  iconShell: {
    width: 44,
    height: 31,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activePill: {
    position: 'absolute',
    width: 22,
    height: 2,
    borderRadius: 1,
    backgroundColor: colors.ink,
    bottom: -1,
  },
  updateDot: {
    position: 'absolute',
    right: 7,
    top: 3,
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: colors.pink,
    borderWidth: 1.5,
    borderColor: colors.surface,
  },
  updateDotFocused: {
    borderColor: colors.pinkSoft,
  },
});
