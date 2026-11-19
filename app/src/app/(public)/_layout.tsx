import { Stack } from 'expo-router';

import { useTheme } from '@/theme';

// welcome redirects to sign-in once the intro has been seen
export const unstable_settings = { anchor: 'welcome' };

export default function PublicLayout() {
  const { colors } = useTheme();
  return (
    <Stack
      screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}
    />
  );
}
