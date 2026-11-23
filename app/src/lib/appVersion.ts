// App version and build shown in Settings and attached to feedback.
import * as Application from 'expo-application';
import Constants from 'expo-constants';

// recette builds show their environment (EXPO_PUBLIC_APP_ENV, set per EAS profile)
export const appEnv = process.env.EXPO_PUBLIC_APP_ENV ?? 'development';

export function appVersion(): { version: string; build: string | null } {
  return {
    version: Application.nativeApplicationVersion ?? Constants.expoConfig?.version ?? '0.0.0',
    build: Application.nativeBuildVersion ?? null,
  };
}
