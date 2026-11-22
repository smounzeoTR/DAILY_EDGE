// Audience measurement (PostHog, EU instance) only with the user's explicit consent
// (profiles.consent_analytics, off by default): anonymous id per installation (never identify),
// no person profile, no geolocation, no session replay, no typed text; a short list of events
// with non-personal properties. Off when EXPO_PUBLIC_POSTHOG_KEY is empty (local, tests).
import PostHog from 'posthog-react-native';

const apiKey = process.env.EXPO_PUBLIC_POSTHOG_KEY;
const host = process.env.EXPO_PUBLIC_POSTHOG_HOST || 'https://eu.i.posthog.com';

export type AnalyticsEvent =
  | 'app_opened'
  | 'exercise_result'
  | 'habit_checked'
  | 'checkin_completed'
  | 'coach_message_sent'
  | 'action_card_applied'
  | 'premium_enabled'
  | 'note_saved';

type Props = Record<string, string | number | boolean>;

let client: PostHog | null = null;
let consented = false;

export function setAnalyticsConsent(on: boolean) {
  if (!apiKey || on === consented) return;
  consented = on;
  if (on) {
    client ??= new PostHog(apiKey, {
      host,
      personProfiles: 'never',
      disableGeoip: true,
      captureAppLifecycleEvents: false,
      enableSessionReplay: false,
      defaultOptIn: false,
    });
    client.optIn();
    client.capture('app_opened');
  } else if (client) {
    // Consent withdrawn: nothing more is sent and the local id is forgotten
    client.optOut();
    client.reset();
  }
}

export function track(event: AnalyticsEvent, props?: Props) {
  if (consented && client) client.capture(event, props);
}
