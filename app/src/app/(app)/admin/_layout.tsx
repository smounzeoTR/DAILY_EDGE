// Administration (read only): reserved to the admin role; each screen also needs an aal2 session.
import { Redirect, Stack } from 'expo-router';

import { SplashView } from '@/components/SplashView';
import { useUserId } from '@/lib/auth/AuthProvider';
import { useProfile } from '@/lib/queries';
import { useTheme } from '@/theme';

export default function AdminLayout() {
  const { colors } = useTheme();
  const userId = useUserId();
  const profile = useProfile(userId);
  if (!profile.data) return <SplashView />;
  if (profile.data.role !== 'admin') return <Redirect href="/settings" />;
  return (
    <Stack
      screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}
    />
  );
}
