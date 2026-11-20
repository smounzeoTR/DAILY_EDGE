// Local morning and evening reminders (expo-notifications).
// Permission is asked once, after an explanation screen; if refused, never asked again.
import * as Notifications from 'expo-notifications';

import i18n from '@/i18n';
import { storage } from '@/lib/storage';

import { timeToMinutes } from '../today/day';

const ASKED_KEY = 'pref.remindersAsked';
export const CHECKIN_URL = '/checkin';
export const REVIEW_URL = '/review/current';
// Weekly review is generated from Sunday 18:00
const REVIEW_EARLIEST = '18:00';
// expo-notifications weekday: 1 = Sunday
const SUNDAY = 1;

// Show reminders even when the app is open
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

export function wasPermissionAsked(): boolean {
  return storage.getItemSync(ASKED_KEY) === '1';
}

export function markPermissionAsked(): void {
  storage.setItemSync(ASKED_KEY, '1');
}

// The explanation screen is shown once, and only if the system has not decided yet
export async function shouldShowPrimer(): Promise<boolean> {
  if (wasPermissionAsked()) return false;
  const { status } = await Notifications.getPermissionsAsync();
  return status === 'undetermined';
}

export async function requestPermission(): Promise<boolean> {
  markPermissionAsked();
  const { granted } = await Notifications.requestPermissionsAsync();
  return granted;
}

export async function isPermissionGranted(): Promise<boolean> {
  return (await Notifications.getPermissionsAsync()).granted;
}

const toHourMinute = (time: string | null | undefined, fallback: string) => {
  const minutes = timeToMinutes(time) ?? (timeToMinutes(fallback) as number);
  return { hour: Math.floor(minutes / 60), minute: minutes % 60 };
};

// Replaces all reminders (called on start, and when hours or language change)
export async function scheduleReminders(times: {
  morning: string | null;
  evening: string | null;
}): Promise<void> {
  if (!(await isPermissionGranted())) return;
  await Notifications.cancelAllScheduledNotificationsAsync();
  await Notifications.scheduleNotificationAsync({
    content: { title: i18n.t('reminders.morningTitle'), body: i18n.t('reminders.morningBody') },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      ...toHourMinute(times.morning, '07:30'),
    },
  });
  await Notifications.scheduleNotificationAsync({
    content: {
      title: i18n.t('reminders.eveningTitle'),
      body: i18n.t('reminders.eveningBody'),
      data: { url: CHECKIN_URL },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      ...toHourMinute(times.evening, '21:00'),
    },
  });
  // Sunday: weekly review, at the evening reminder time but never before 18:00
  const evening = timeToMinutes(times.evening) ?? (timeToMinutes('21:00') as number);
  const earliest = timeToMinutes(REVIEW_EARLIEST) as number;
  const reviewAt = Math.max(evening, earliest);
  await Notifications.scheduleNotificationAsync({
    content: {
      title: i18n.t('reminders.reviewTitle'),
      body: i18n.t('reminders.reviewBody'),
      data: { url: REVIEW_URL },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
      weekday: SUNDAY,
      hour: Math.floor(reviewAt / 60),
      minute: reviewAt % 60,
    },
  });
}
