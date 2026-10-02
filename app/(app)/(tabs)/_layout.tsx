import { BlurView } from 'expo-blur';
import { Tabs } from 'expo-router';
import { Platform, StyleSheet } from 'react-native';

import { Icon, useIsWide, type IconName } from '@/components/ui';
import { useT, type TranslationKey } from '@/i18n';
import { MAX_CONTENT_WIDTH, useTheme } from '@/theme';

interface TabDef {
  name: string;
  title: TranslationKey;
  icon: IconName;
}

const TABS: TabDef[] = [
  { name: 'index', title: 'tabs.home', icon: 'home' },
  { name: 'expenses', title: 'tabs.expenses', icon: 'receipt' },
  { name: 'reports', title: 'tabs.reports', icon: 'chart' },
  { name: 'house', title: 'tabs.house', icon: 'people' },
  { name: 'profile', title: 'tabs.profile', icon: 'person' },
];

export default function TabsLayout() {
  const { colors } = useTheme();
  const { t } = useT();
  const wide = useIsWide() && Platform.OS === 'web';

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.tint,
        tabBarInactiveTintColor: colors.secondaryLabel,
        tabBarPosition: wide ? 'left' : 'bottom',
        tabBarLabelPosition: wide ? 'beside-icon' : undefined,
        tabBarStyle: wide
          ? { backgroundColor: colors.grouped, borderRightColor: colors.separator, borderRightWidth: StyleSheet.hairlineWidth, width: 220, paddingTop: 24 }
          : { backgroundColor: 'transparent', borderTopColor: colors.separator, borderTopWidth: StyleSheet.hairlineWidth },
        tabBarBackground: wide ? undefined : () => <BlurView tint={colors.blur === 'dark' ? 'systemChromeMaterialDark' : 'systemChromeMaterialLight'} intensity={80} style={StyleSheet.absoluteFill} />,
        sceneStyle: { backgroundColor: colors.background, maxWidth: wide ? undefined : MAX_CONTENT_WIDTH * 2 },
      }}
    >
      {TABS.map((tab) => (
        <Tabs.Screen
          key={tab.name}
          name={tab.name}
          options={{
            title: t(tab.title),
            tabBarAccessibilityLabel: t(tab.title),
            tabBarIcon: ({ color, size }) => <Icon name={tab.icon} size={size} color={String(color)} />,
          }}
        />
      ))}
    </Tabs>
  );
}
