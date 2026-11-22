// Crash and error reporting (Sentry, EU region): no personal data (see scrub.ts), no screenshot,
// no performance tracing. Off when EXPO_PUBLIC_SENTRY_DSN is empty (local, tests).
import * as Sentry from '@sentry/react-native';

import { scrubBreadcrumb, scrubEvent } from './scrub';

const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN;

export function initMonitoring() {
  if (!dsn) return;
  Sentry.init({
    dsn,
    environment: __DEV__ ? 'development' : 'production',
    sendDefaultPii: false,
    attachScreenshot: false,
    attachViewHierarchy: false,
    tracesSampleRate: 0,
    maxBreadcrumbs: 30,
    beforeSend: (event) => scrubEvent(event),
    beforeBreadcrumb: (crumb) => scrubBreadcrumb(crumb),
  });
}

export const reportError = (error: unknown) => {
  if (dsn) Sentry.captureException(error);
};
