// App version and build shown in Settings and attached to feedback.
import * as Application from 'expo-application';
import Constants from 'expo-constants';

export function appVersion(): { version: string; build: string | null } {
  return {
    version: Application.nativeApplicationVersion ?? Constants.expoConfig?.version ?? '0.0.0',
    build: Application.nativeBuildVersion ?? null,
  };
}
