import * as Notifications from 'expo-notifications';
import { router, Stack } from 'expo-router';
import { useEffect } from 'react';

import { useTheme } from '@/theme';

// Tapping a reminder opens its screen (evening reminder -> check-in)
function useReminderNavigation() {
  const response = Notifications.useLastNotificationResponse();
  useEffect(() => {
    const url = response?.notification.request.content.data?.url;
    if (typeof url === 'string' && url.startsWith('/')) router.push(url as '/checkin');
  }, [response]);
}

export default function AppLayout() {
  const { colors } = useTheme();
  useReminderNavigation();
  return (
    <Stack
      screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}
    >
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="exercise/[id]" />
      <Stack.Screen name="principle/[id]" />
      <Stack.Screen name="review/[id]" />
      <Stack.Screen name="settings/goal" />
      <Stack.Screen name="settings/habits" />
      <Stack.Screen name="settings/program" />
      <Stack.Screen name="checkin" options={{ presentation: 'modal' }} />
      <Stack.Screen name="reminders" options={{ presentation: 'modal' }} />
    </Stack>
  );
}
