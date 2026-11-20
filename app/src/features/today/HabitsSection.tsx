// Habits of the day, filtered by frequency; one tap to check, one tap for the minimal version.
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui';
import { resolveLanguage } from '@/i18n/language';
import { habitText } from '@/i18n/localize';
import type { useUserHabits } from '@/lib/queries';
import { radius, spacing, useTheme } from '@/theme';

import { habitStatusOn, type HabitFrequency, type HabitLog } from '@shared/habits/schedule.ts';
import { localToday } from './day';

type Habit = NonNullable<ReturnType<typeof useUserHabits>['data']>[number];

export type HabitAction = { habitId: string; action: 'check' | 'minimal' | 'uncheck' };

const PERIOD_LABEL: Partial<Record<HabitFrequency, string>> = {
  weekly: 'today.habitDoneWeek',
  biweekly: 'today.habitDoneTwoWeeks',
  monthly: 'today.habitDoneMonth',
};

export function HabitsSection({
  habits,
  logs,
  today,
  timezone,
  onAction,
}: {
  habits: Habit[];
  logs: { user_habit_id: string; date: string; done: boolean; minimal: boolean }[];
  today: string;
  timezone: string;
  onAction: (action: HabitAction) => void;
}) {
  const { t, i18n } = useTranslation();
  const { colors } = useTheme();
  const language = resolveLanguage(i18n.language);

  const rows = habits
    .map((habit) => {
      const own: HabitLog[] = logs
        .filter((l) => l.user_habit_id === habit.id)
        .map((l) => ({ date: l.date, done: l.done, minimal: l.minimal }));
      const status = habitStatusOn(
        { frequency: habit.frequency, startedOn: localToday(timezone, new Date(habit.created_at)) },
        own,
        today,
      );
      return { habit, status };
    })
    .filter((r) => r.status.visible);

  if (rows.length === 0) return null;

  return (
    <View style={styles.list}>
      <AppText variant="subtitle">{t('today.habitsTitle')}</AppText>
      {rows.map(({ habit, status }) => {
        const cue = habitText(habit.cue, habit.template, 'default_cue', language);
        const minimal = habitText(
          habit.minimal_version,
          habit.template,
          'minimal_version',
          language,
        );
        // Simplified (weekly review): the minimal version becomes the main action
        const title =
          habit.simplified && minimal
            ? minimal
            : habitText(habit.title, habit.template, 'title', language);
        const doneToday = status.state === 'done' || status.state === 'done_minimal';
        const periodKey = PERIOD_LABEL[habit.frequency];
        const stateText =
          status.state === 'done_minimal'
            ? t('today.habitDoneMinimal')
            : status.state === 'done_in_period' && periodKey
              ? t(periodKey as 'today.habitDoneWeek')
              : null;
        return (
          <View
            key={habit.id}
            style={[
              styles.row,
              {
                borderColor: doneToday ? colors.primary : colors.border,
                backgroundColor: doneToday ? colors.primarySoft : colors.card,
              },
            ]}
          >
            <Pressable
              // "switch" exposes the on/off state on iOS (the checkbox role does not)
              accessibilityRole="switch"
              accessibilityState={{ checked: doneToday }}
              accessibilityLabel={cue ? `${title}, ${cue}` : title}
              // State text is announced with the title (minimal version, done this period)
              accessibilityValue={stateText ? { text: stateText } : undefined}
              onPress={() =>
                onAction({
                  habitId: habit.id,
                  action: doneToday ? 'uncheck' : habit.simplified ? 'minimal' : 'check',
                })
              }
              style={styles.main}
            >
              <View
                style={[
                  styles.box,
                  {
                    borderColor: colors.primary,
                    backgroundColor: doneToday ? colors.primary : 'transparent',
                  },
                ]}
              />
              <View style={styles.flex}>
                <AppText variant="bodyStrong">{title}</AppText>
                {cue ? (
                  <AppText variant="caption" tone="secondary">
                    {cue}
                  </AppText>
                ) : null}
                {status.state === 'done_minimal' ? (
                  <AppText variant="caption" tone="link">
                    {t('today.habitDoneMinimal')}
                  </AppText>
                ) : null}
                {status.state === 'done_in_period' && periodKey ? (
                  <AppText variant="caption" tone="link">
                    {t(periodKey as 'today.habitDoneWeek')}
                  </AppText>
                ) : null}
              </View>
            </Pressable>
            {!doneToday && minimal && !habit.simplified ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('today.minimalFor', { title })}
                hitSlop={6}
                onPress={() => onAction({ habitId: habit.id, action: 'minimal' })}
                style={[styles.minimal, { borderColor: colors.border }]}
              >
                <AppText variant="caption" tone="link">
                  {t('today.minimalShort', { text: minimal })}
                </AppText>
              </Pressable>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: spacing.sm },
  row: { borderWidth: 1.5, borderRadius: radius.card, padding: spacing.md, gap: spacing.sm },
  main: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  box: { width: 26, height: 26, borderRadius: 8, borderWidth: 2 },
  flex: { flex: 1, gap: 2 },
  minimal: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: radius.badge,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
});
