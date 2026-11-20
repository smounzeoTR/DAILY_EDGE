import '@/i18n';

import { QueryClientProvider } from '@tanstack/react-query';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';

import { SplashView } from '@/components/SplashView';
import { AuthProvider, useAuth } from '@/lib/auth/AuthProvider';
import { queryClient, useProfile } from '@/lib/queries';
import { fontAssets, ThemeProvider, useTheme } from '@/theme';

void SplashScreen.preventAutoHideAsync();

// Guarded screens fall back to the index route, which redirects
export const unstable_settings = { anchor: 'index' };

// Routing: signed out -> (public); deletion requested -> (deletion);
// signed in, not onboarded -> (onboarding); else -> (app)
function RootNavigator() {
  const { scheme, colors } = useTheme();
  const { session, initializing } = useAuth();
  const profile = useProfile(session?.user.id);

  const loading = initializing || (session !== null && profile.isPending);
  if (loading) return <SplashView />;
  if (session && profile.isError) return <SplashView onRetry={() => void profile.refetch()} />;

  const signedIn = session !== null;
  const deleting = Boolean(profile.data?.deletion_requested_at);
  const onboarded = Boolean(profile.data?.onboarded_at);

  return (
    <>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.background },
        }}
      >
        <Stack.Screen name="index" />
        <Stack.Protected guard={!signedIn}>
          <Stack.Screen name="(public)" />
        </Stack.Protected>
        <Stack.Protected guard={signedIn && deleting}>
          <Stack.Screen name="(deletion)" />
        </Stack.Protected>
        <Stack.Protected guard={signedIn && !deleting && !onboarded}>
          <Stack.Screen name="(onboarding)" />
        </Stack.Protected>
        <Stack.Protected guard={signedIn && !deleting && onboarded}>
          <Stack.Screen name="(app)" />
        </Stack.Protected>
      </Stack>
    </>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts(fontAssets);
  const ready = fontsLoaded || fontError !== null;

  useEffect(() => {
    if (ready) SplashScreen.hide();
  }, [ready]);

  if (!ready) return null;

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <AuthProvider>
          <RootNavigator />
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
