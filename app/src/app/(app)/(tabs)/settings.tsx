// Settings: language, theme, reminder times, goal, habits, program, consents, offer (free /
// premium), export, deletion; administration entry for admins.
import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Pressable, StyleSheet, Switch, View } from 'react-native';

import { TimeField } from '@/components/DateTimeField';
import { SplashView } from '@/components/SplashView';
import { AppText, Button, Card, Chip, Screen } from '@/components/ui';
import { scheduleReminders } from '@/features/reminders/reminders';
import { LegalLinks } from '@/features/legal/LegalLinks';
import { exportAndShare } from '@/features/settings/exportData';
import { setLanguage } from '@/i18n';
import { resolveLanguage, type Language } from '@/i18n/language';
import { localized } from '@/i18n/localize';
import { useAuth, useUserId } from '@/lib/auth/AuthProvider';
import type { Database } from '@/lib/database.types';
import {
  premiumKey,
  queryKeys,
  useActiveGoal,
  useAppFlags,
  useIsPremium,
  useProfile,
  usePrograms,
} from '@/lib/queries';
import { track } from '@/lib/analytics';
import { appEnv, appVersion } from '@/lib/appVersion';
import { supabase } from '@/lib/supabase';
import { spacing, useTheme, type ThemePreference } from '@/theme';

const LANGUAGES: { value: Language; label: string }[] = [
  { value: 'fr', label: 'Français' },
  { value: 'en', label: 'English' },
];
const THEMES: ThemePreference[] = ['auto', 'light', 'dark'];

type ProfileUpdate = Database['public']['Tables']['profiles']['Update'];

function Row({ label, onPress }: { label: string; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      // The chevron is decorative: not read aloud
      accessibilityLabel={label}
      onPress={onPress}
      style={[styles.row, { borderColor: colors.border }]}
    >
      <AppText variant="bodyStrong">{label}</AppText>
      <AppText tone="secondary">›</AppText>
    </Pressable>
  );
}

function ConsentSwitch({
  title,
  body,
  value,
  onChange,
}: {
  title: string;
  body: string;
  value: boolean;
  onChange: (value: boolean) => void;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      accessibilityLabel={title}
      accessibilityHint={body}
      onPress={() => onChange(!value)}
      style={styles.consent}
    >
      <View style={styles.flex}>
        <AppText variant="bodyStrong">{title}</AppText>
        <AppText variant="caption" tone="secondary">
          {body}
        </AppText>
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ true: colors.primary, false: colors.border }}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      />
    </Pressable>
  );
}

export default function Settings() {
  const version = appVersion();
  const { t, i18n } = useTranslation();
  const language = resolveLanguage(i18n.language);
  const { preference, setPreference } = useTheme();
  const { signOut } = useAuth();
  const userId = useUserId();
  const queryClient = useQueryClient();
  const profile = useProfile(userId).data;
  const goal = useActiveGoal(userId).data;
  const programs = usePrograms().data ?? [];
  const premium = useIsPremium(userId);
  const flags = useAppFlags().data;
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);

  if (!profile) return <SplashView />;
  const program = programs.find((p) => p.id === profile.program_id);

  const refreshProfile = () =>
    queryClient.invalidateQueries({ queryKey: queryKeys.profile(userId) });
  const updateProfile = async (patch: ProfileUpdate) => {
    const { error } = await supabase.from('profiles').update(patch).eq('user_id', userId);
    if (error) setMessage({ text: t('common.errorGeneric'), ok: false });
    await refreshProfile();
    return !error;
  };

  const changeLanguage = async (value: Language) => {
    await setLanguage(value);
    // Server texts (why today, emails) follow the profile locale
    await updateProfile({ locale: value });
    await scheduleReminders({ morning: profile.notify_morning, evening: profile.notify_evening });
  };

  // Prototype switch (no payment in V1), shown only when the server allows it
  const setPremium = async (value: boolean) => {
    setMessage(null);
    const { error } = await supabase.rpc('dev_set_plan', { p_plan: value ? 'premium' : 'free' });
    if (error) setMessage({ text: t('common.errorGeneric'), ok: false });
    else if (value) track('premium_enabled');
    await queryClient.invalidateQueries({ queryKey: premiumKey(userId) });
    // Today checks again whether its plan can be personalized
    await queryClient.invalidateQueries({ queryKey: ['plan', userId] });
  };

  const changeTime = async (field: 'notify_morning' | 'notify_evening', value: string) => {
    if (await updateProfile({ [field]: value })) {
      await scheduleReminders({
        morning: field === 'notify_morning' ? value : profile.notify_morning,
        evening: field === 'notify_evening' ? value : profile.notify_evening,
      });
    }
  };

  const setConsent = async (field: 'consent_checkin' | 'consent_ai', value: boolean) => {
    const other = field === 'consent_checkin' ? profile.consent_ai : profile.consent_checkin;
    await updateProfile({
      [field]: value,
      consent_at: value || other ? new Date().toISOString() : null,
    });
    if (field === 'consent_checkin' && !value) {
      // Offer to erase mood and energy already recorded
      Alert.alert(t('settings.eraseTitle'), t('settings.eraseBody'), [
        { text: t('settings.eraseKeep'), style: 'cancel' },
        {
          text: t('settings.eraseConfirm'),
          style: 'destructive',
          onPress: () => {
            void supabase
              .rpc('erase_mood_energy')
              .then(({ error }) =>
                setMessage(
                  error
                    ? { text: t('common.errorGeneric'), ok: false }
                    : { text: t('settings.erased'), ok: true },
                ),
              );
          },
        },
      ]);
    }
  };

  const exportData = async () => {
    setBusy('export');
    setMessage(null);
    try {
      await exportAndShare();
    } catch {
      setMessage({ text: t('settings.exportError'), ok: false });
    }
    setBusy(null);
  };

  // Double confirmation, then the deletion screen (route guard)
  const requestDeletion = () => {
    Alert.alert(t('settings.deleteTitle'), t('settings.deleteBody'), [
      { text: t('settings.deleteKeep'), style: 'cancel' },
      {
        text: t('settings.deleteContinue'),
        style: 'destructive',
        onPress: () =>
          Alert.alert(t('settings.deleteConfirmTitle'), t('settings.deleteConfirmBody'), [
            { text: t('settings.deleteKeep'), style: 'cancel' },
            {
              text: t('settings.deleteConfirm'),
              style: 'destructive',
              onPress: () => {
                void supabase.rpc('request_account_deletion').then(() => refreshProfile());
              },
            },
          ]),
      },
    ]);
  };

  return (
    <Screen scroll>
      <View style={styles.top}>
        <AppText variant="title" accessibilityRole="header">
          {t('settings.title')}
        </AppText>
      </View>
      {message ? <AppText tone={message.ok ? 'link' : 'danger'}>{message.text}</AppText> : null}

      <Card>
        <AppText variant="bodyStrong">{t('settings.language')}</AppText>
        <View style={styles.chips}>
          {LANGUAGES.map((l) => (
            <Chip
              key={l.value}
              label={l.label}
              selected={language === l.value}
              onPress={() => void changeLanguage(l.value)}
            />
          ))}
        </View>
        <AppText variant="bodyStrong">{t('settings.theme')}</AppText>
        <View style={styles.chips}>
          {THEMES.map((value) => (
            <Chip
              key={value}
              label={t(`settings.themes.${value}`)}
              selected={preference === value}
              onPress={() => setPreference(value)}
            />
          ))}
        </View>
      </Card>

      <Card>
        <AppText variant="bodyStrong">{t('settings.reminders')}</AppText>
        <TimeField
          label={t('onboarding.q.morning')}
          value={(profile.notify_morning ?? '07:30').slice(0, 5)}
          onChange={(v) => void changeTime('notify_morning', v)}
        />
        <TimeField
          label={t('onboarding.q.evening')}
          value={(profile.notify_evening ?? '21:00').slice(0, 5)}
          onChange={(v) => void changeTime('notify_evening', v)}
        />
      </Card>

      <Card>
        <AppText variant="bodyStrong">{t('settings.goal')}</AppText>
        <AppText tone="body">{goal ? goal.title : t('settings.noGoal')}</AppText>
        <Row label={t('settings.manageGoal')} onPress={() => router.push('/settings/goal')} />
        <AppText variant="bodyStrong">{t('settings.habits')}</AppText>
        <Row label={t('settings.manageHabits')} onPress={() => router.push('/settings/habits')} />
        <AppText variant="bodyStrong">{t('settings.program')}</AppText>
        <AppText tone="body">
          {program
            ? `${program.id} · ${localized(program, 'name', language)}`
            : t('settings.noProgram')}
        </AppText>
        <Row label={t('settings.changeProgram')} onPress={() => router.push('/settings/program')} />
      </Card>

      <Card>
        <Row
          label={t('guide.howItWorks.title')}
          onPress={() => router.push('/settings/how-it-works')}
        />
        <Row label={t('feedback.open')} onPress={() => router.push('/settings/feedback')} />
      </Card>

      <Card>
        <AppText variant="bodyStrong">{t('settings.consents')}</AppText>
        <ConsentSwitch
          title={t('onboarding.consent.checkinTitle')}
          body={t('onboarding.consent.checkinBody')}
          value={profile.consent_checkin}
          onChange={(v) => void setConsent('consent_checkin', v)}
        />
        <ConsentSwitch
          title={t('onboarding.consent.aiTitle')}
          body={t('onboarding.consent.aiBody')}
          value={profile.consent_ai}
          onChange={(v) => void setConsent('consent_ai', v)}
        />
        <ConsentSwitch
          title={t('onboarding.consent.analyticsTitle')}
          body={t('onboarding.consent.analyticsBody')}
          value={profile.consent_analytics}
          onChange={(v) => void updateProfile({ consent_analytics: v })}
        />
      </Card>

      <Card>
        <AppText variant="bodyStrong">{t('settings.offer')}</AppText>
        <AppText tone="body">
          {t('settings.currentPlan', {
            plan: premium.data ? t('settings.planPremium') : t('settings.planFree'),
          })}
        </AppText>
        <AppText variant="caption" tone="secondary">
          {t('settings.premiumPerks')}
        </AppText>
        {flags?.allow_plan_toggle ? (
          <ConsentSwitch
            title={t('settings.premiumSwitch')}
            body={t('settings.premiumSwitchHint')}
            value={premium.data === true}
            onChange={(v) => void setPremium(v)}
          />
        ) : null}
        {premium.data && !profile.consent_ai ? (
          <AppText variant="caption" tone="link">
            {t('settings.premiumNeedsConsent')}
          </AppText>
        ) : null}
      </Card>

      {profile.role === 'admin' ? (
        <Card>
          <AppText variant="bodyStrong">{t('admin.title')}</AppText>
          <Row label={t('admin.open')} onPress={() => router.push('/admin')} />
        </Card>
      ) : null}

      <Card>
        <AppText variant="bodyStrong">{t('settings.data')}</AppText>
        <AppText variant="caption" tone="secondary">
          {t('settings.exportBody')}
        </AppText>
        <Button
          label={t('settings.export')}
          variant="secondary"
          onPress={() => void exportData()}
          loading={busy === 'export'}
        />
        <Button
          label={t('coach.deleteAll')}
          variant="ghost"
          onPress={() =>
            Alert.alert(t('coach.deleteAllTitle'), t('coach.deleteAllBody'), [
              { text: t('coach.keep'), style: 'cancel' },
              {
                text: t('coach.deleteAll'),
                style: 'destructive',
                onPress: () => {
                  void supabase
                    .rpc('delete_assistant_history')
                    .then(({ error }) =>
                      setMessage(
                        error
                          ? { text: t('common.errorGeneric'), ok: false }
                          : { text: t('coach.historyDeleted'), ok: true },
                      ),
                    );
                },
              },
            ])
          }
        />
        <Button label={t('settings.delete')} variant="ghost" onPress={requestDeletion} />
      </Card>

      <Card>
        <AppText variant="bodyStrong">{t('legal.title')}</AppText>
        <LegalLinks />
        <AppText variant="caption" tone="secondary">
          {t('settings.version', {
            version: version.version,
            build: version.build ?? '–',
          })}
          {appEnv === 'production' ? '' : ` · ${appEnv}`}
        </AppText>
      </Card>

      <Button label={t('today.signOut')} variant="ghost" onPress={() => void signOut()} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  top: { paddingTop: spacing.lg },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  consent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
  },
  flex: { flex: 1, gap: 2 },
});
