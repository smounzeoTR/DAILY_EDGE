import { getCalendars } from 'expo-localization';

import { resolveLanguage } from '@/i18n/language';
import { supabase } from '@/lib/supabase';

// Sends the 6-digit sign-in code (creates the account on first use)
export function sendCode(email: string, language: string) {
  return supabase.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: true,
      // Read by the sign-up trigger (profile locale and timezone)
      data: {
        locale: resolveLanguage(language),
        timezone: getCalendars()[0]?.timeZone ?? undefined,
      },
    },
  });
}
