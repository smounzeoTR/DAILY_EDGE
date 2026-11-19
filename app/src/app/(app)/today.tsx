// Provisional "Aujourd'hui" screen (lot 2); the real one comes in lot 4.
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { LanguageToggle } from '@/components/LanguageToggle';
import { Logo } from '@/components/Logo';
import { AppText, Button, Card, Screen } from '@/components/ui';
import { resolveLanguage } from '@/i18n/language';
import { habitText, localized } from '@/i18n/localize';
import { useAuth, useUserId } from '@/lib/auth/AuthProvider';
import { useProfile, usePrograms, useProgramSteps, useUserHabits } from '@/lib/queries';
import { spacing } from '@/theme';

export default function Today() {
  const { t, i18n } = useTranslation();
  const language = resolveLanguage(i18n.language);
  const { signOut } = useAuth();
  const userId = useUserId();
  const profile = useProfile(userId).data;
  const programs = usePrograms().data ?? [];
  const steps = useProgramSteps().data ?? [];
  const habits = useUserHabits(userId).data ?? [];

  const program = programs.find((p) => p.id === profile?.program_id);
  const day = profile?.program_day ?? 1;
  const step = steps.find((s) => s.program_id === program?.id && s.day_index === day);
  const name = profile?.display_name;

  return (
    <Screen
      scroll
      header={
        <View style={styles.header}>
          <Logo size={32} />
          <LanguageToggle />
        </View>
      }
      footer={<Button label={t('today.signOut')} variant="ghost" onPress={() => void signOut()} />}
    >
      <View style={styles.top}>
        <AppText variant="title" accessibilityRole="header">
          {name ? t('today.greeting', { name }) : t('today.greetingNoName')}
        </AppText>
        {program ? (
          <AppText tone="secondary">
            {t('today.dayOf', { day, total: program.duration_days })}
            {step
              ? ` · ${t('today.week', {
                  n: Math.floor((day - 1) / 7) + 1,
                  theme: localized(step, 'theme', language),
                })}`
              : ''}
          </AppText>
        ) : null}
      </View>
      {program ? (
        <Card>
          <AppText variant="caption" tone="link">
            {program.id}
          </AppText>
          <AppText variant="subtitle">{localized(program, 'name', language)}</AppText>
          <AppText tone="body">{t('today.comingSoon')}</AppText>
        </Card>
      ) : null}
      <AppText variant="subtitle">{t('today.habitsTitle')}</AppText>
      {habits.map((habit) => (
        <Card key={habit.id}>
          <AppText variant="bodyStrong">
            {habitText(habit.title, habit.template, 'title', language)}
          </AppText>
          <AppText variant="caption" tone="secondary">
            {habitText(habit.cue, habit.template, 'default_cue', language)}
          </AppText>
        </Card>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  top: { paddingTop: spacing.lg, gap: spacing.xs },
});
