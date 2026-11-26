// Habit sheet: title, cue, minimal version and the private notebook of the habit.
import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { SplashView } from '@/components/SplashView';
import { AppText, Button, Screen } from '@/components/ui';
import { NoteCard } from '@/features/notes/NoteCard';
import { resolveLanguage } from '@/i18n/language';
import { habitText } from '@/i18n/localize';
import { useUserId } from '@/lib/auth/AuthProvider';
import { useAllHabits } from '@/lib/queries';
import { spacing } from '@/theme';

export default function HabitSheet() {
  const { t, i18n } = useTranslation();
  const language = resolveLanguage(i18n.language);
  const { id } = useLocalSearchParams<{ id: string }>();
  const userId = useUserId();
  const habits = useAllHabits(userId);

  if (!habits.data) return <SplashView />;
  const habit = habits.data.find((h) => h.id === id);
  const back = <Button label={t('common.back')} variant="ghost" onPress={() => router.back()} />;
  if (!habit) {
    return (
      <Screen footer={back}>
        <AppText tone="secondary">{t('today.habitNotFound')}</AppText>
      </Screen>
    );
  }
  const title = habitText(habit.title, habit.template, 'title', language);
  const cue = habitText(habit.cue, habit.template, 'default_cue', language);
  const minimal = habitText(habit.minimal_version, habit.template, 'minimal_version', language);

  return (
    <Screen scroll footer={back}>
      <View style={styles.head}>
        <AppText variant="caption" tone="link">
          {t('notes.habit')}
        </AppText>
        <AppText variant="title" accessibilityRole="header">
          {title}
        </AppText>
        {cue ? <AppText tone="body">{t('today.habitCue', { cue })}</AppText> : null}
        {minimal ? (
          <AppText variant="caption" tone="secondary">
            {t('today.minimalShort', { text: minimal })}
          </AppText>
        ) : null}
      </View>
      <NoteCard entityType="habit" entityId={habit.id} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  head: { gap: spacing.xs, paddingTop: spacing.lg },
});
