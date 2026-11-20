// Explanation screen shown once before the system notification permission request.
import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { Logo } from '@/components/Logo';
import { AppText, Button, Screen } from '@/components/ui';
import {
  markPermissionAsked,
  requestPermission,
  scheduleReminders,
} from '@/features/reminders/reminders';
import { useUserId } from '@/lib/auth/AuthProvider';
import { useProfile } from '@/lib/queries';
import { spacing } from '@/theme';

const short = (time: string | null | undefined, fallback: string) => (time ?? fallback).slice(0, 5);

export default function Reminders() {
  const { t } = useTranslation();
  const profile = useProfile(useUserId()).data;
  const [busy, setBusy] = useState(false);
  const morning = short(profile?.notify_morning, '07:30');
  const evening = short(profile?.notify_evening, '21:00');

  const enable = async () => {
    setBusy(true);
    const granted = await requestPermission();
    if (granted) {
      await scheduleReminders({
        morning: profile?.notify_morning ?? null,
        evening: profile?.notify_evening ?? null,
      });
    }
    setBusy(false);
    router.back();
  };

  return (
    <Screen
      footer={
        <>
          <Button label={t('reminders.enable')} onPress={() => void enable()} loading={busy} />
          <Button
            label={t('reminders.later')}
            variant="ghost"
            onPress={() => {
              // Never asked again; the app works without reminders
              markPermissionAsked();
              router.back();
            }}
          />
        </>
      }
    >
      <View style={styles.body}>
        <Logo variant="symbol" size={72} />
        <AppText variant="title" accessibilityRole="header">
          {t('reminders.title')}
        </AppText>
        <AppText tone="body">{t('reminders.body', { morning, evening })}</AppText>
        <AppText variant="caption" tone="secondary">
          {t('reminders.note')}
        </AppText>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { flex: 1, justifyContent: 'center', gap: spacing.lg },
});
