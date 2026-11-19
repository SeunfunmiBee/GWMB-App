import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { type ComponentProps } from 'react';
import { Text, useWindowDimensions, type ColorValue } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { tapFeedback } from '@/lib/feedback';
import { usePublishedContent } from '@/lib/content-runtime';
import { opportunities } from '@/data/opportunities';
import { colors, fonts } from '@/theme';

type IconName = ComponentProps<typeof Ionicons>['name'];

const icon = (name: IconName, focusedName: IconName) =>
  function TabIcon({ color, focused }: { color: ColorValue; focused: boolean }) {
    return <Ionicons name={focused ? focusedName : name} color={color} size={22}/>;
  };

export default function TabLayout() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const bottomGap = Math.max(insets.bottom, 10);
  const barWidth = Math.min(width - insets.left - insets.right - 24, 520);
  const publishedOpportunities = usePublishedContent('opportunities');
  const opportunityCount = publishedOpportunities.length ? publishedOpportunities.filter(item => item.visible).length : opportunities.length;

  return <Tabs
    screenListeners={{ tabPress: () => { void tapFeedback(); } }}
    screenOptions={{
      headerShown: false,
      tabBarActiveTintColor: colors.pinkDeep,
      tabBarInactiveTintColor: colors.muted,
      tabBarHideOnKeyboard: true,
      tabBarLabelPosition: 'below-icon',
      tabBarItemStyle: { paddingVertical: 0 },
      tabBarIconStyle: { width: 26, height: 24 },
      tabBarLabel: ({ color, children }) => <Text
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.85}
        style={{
          color,
          width: barWidth / 5 - 2,
          maxWidth: barWidth / 5 - 2,
          flexShrink: 0,
          fontSize: width < 360 ? 8.5 : 10,
          lineHeight: 13,
          fontFamily: fonts.bodySemibold,
          marginTop: 2,
          letterSpacing: -0.15,
          textAlign: 'center',
        }}
      >{children}</Text>,
      tabBarBadgeStyle: {
        backgroundColor: colors.pinkDeep,
        color: 'white',
        fontSize: 9,
        lineHeight: 16,
        fontFamily: fonts.bodyBold,
        minWidth: 16,
        height: 16,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: colors.surface,
      },
      tabBarStyle: {
        height: 64,
        paddingTop: 4,
        paddingBottom: 4,
        width: barWidth,
        marginBottom: bottomGap,
        alignSelf: 'center',
        backgroundColor: colors.surface,
        borderRadius: 23,
        borderWidth: 1,
        borderTopWidth: 1,
        borderColor: colors.line,
        elevation: 4,
        shadowColor: colors.ink,
        shadowOpacity: 0.08,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 4 },
      },
    }}
  >
    <Tabs.Screen name="index" options={{ title: 'Home', tabBarIcon: icon('home-outline', 'home') }}/>
    <Tabs.Screen name="learn" options={{ title: 'Learn', tabBarIcon: icon('book-outline', 'book') }}/>
    <Tabs.Screen name="mentorship" options={{ title: 'Mentorship', tabBarIcon: icon('chatbubbles-outline', 'chatbubbles') }}/>
    <Tabs.Screen name="opportunities" options={{ title: 'Opportunities', tabBarBadge: opportunityCount || undefined, tabBarIcon: icon('briefcase-outline', 'briefcase') }}/>
    <Tabs.Screen name="community" options={{ title: 'Community', tabBarIcon: icon('people-outline', 'people') }}/>
    <Tabs.Screen name="grow" options={{ href: null }}/>
    <Tabs.Screen name="profile" options={{ href: null }}/>
  </Tabs>;
}
