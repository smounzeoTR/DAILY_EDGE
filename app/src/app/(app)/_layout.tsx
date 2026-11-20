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
      <Stack.Screen name="today" />
      <Stack.Screen name="checkin" options={{ presentation: 'modal' }} />
      <Stack.Screen name="reminders" options={{ presentation: 'modal' }} />
    </Stack>
  );
}
