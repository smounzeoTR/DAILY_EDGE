import { Tabs } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { TabIcon } from '@/components/TabIcon';
import { useTabBadges } from '@/features/guide/useTabBadges';
import { fonts, useTheme } from '@/theme';

export default function TabsLayout() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const badges = useTabBadges();
  // A discreet dot; VoiceOver reads the reason in the tab label
  const dot = (on: boolean, title: string, reason: string) =>
    on
      ? {
          tabBarBadge: '',
          tabBarBadgeStyle: {
            minWidth: 10,
            maxHeight: 10,
            borderRadius: 5,
            marginTop: 4,
            backgroundColor: colors.momentum,
          },
          tabBarAccessibilityLabel: `${title}, ${reason}`,
        }
      : { tabBarAccessibilityLabel: title };
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textSecondary,
        tabBarStyle: { backgroundColor: colors.card, borderTopColor: colors.border },
        tabBarLabelStyle: { fontFamily: fonts.bodyMedium, fontSize: 12 },
        sceneStyle: { backgroundColor: colors.background },
      }}
    >
      <Tabs.Screen
        name="today"
        options={{
          title: t('tabs.today'),
          tabBarIcon: ({ color }) => <TabIcon name="today" color={color} />,
          ...dot(badges.today, t('tabs.today'), t('tabs.badges.today')),
        }}
      />
      <Tabs.Screen
        name="progress"
        options={{
          title: t('tabs.progress'),
          tabBarIcon: ({ color }) => <TabIcon name="progress" color={color} />,
          ...dot(badges.progress, t('tabs.progress'), t('tabs.badges.progress')),
        }}
      />
      <Tabs.Screen
        name="library"
        options={{
          title: t('tabs.library'),
          tabBarIcon: ({ color }) => <TabIcon name="library" color={color} />,
        }}
      />
      <Tabs.Screen
        name="coach"
        options={{
          title: t('tabs.coach'),
          tabBarIcon: ({ color }) => <TabIcon name="coach" color={color} />,
          tabBarAccessibilityLabel: t('tabs.coach'),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: t('tabs.settings'),
          tabBarIcon: ({ color }) => <TabIcon name="settings" color={color} />,
        }}
      />
    </Tabs>
  );
}
