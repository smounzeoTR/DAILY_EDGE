// Progress: streak and record, completion rates, habits, goal, energy (with consent), reflections.
// Computed in the app from raw data with pure functions (features/progress).
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { DayBars, EnergyLine, GoalBar } from '@/components/charts';
import { SplashView } from '@/components/SplashView';
import { AppText, Button, Card, Screen, TextField } from '@/components/ui';
import { addDays } from '@shared/habits/schedule.ts';
import { parseTargetValue } from '@/features/onboarding/rules';
import {
  completionRate,
  dayStates,
  goalProgress,
  habitRates,
  streak,
} from '@/features/progress/progress';
import { formatDate } from '@/features/review/texts';
import { localToday } from '@/features/today/day';
import { resolveLanguage } from '@/i18n/language';
import { habitText } from '@/i18n/localize';
import { useUserId } from '@/lib/auth/AuthProvider';
import {
  fetchReflections,
  REFLECTIONS_PAGE,
  useActiveGoal,
  useCheckinsSince,
  useDoneDays,
  useHabitLogs,
  usePlansSince,
  useProfile,
  useReviews,
  useUserHabits,
} from '@/lib/queries';
import { supabase } from '@/lib/supabase';
import { radius, spacing, useTheme } from '@/theme';

const pct = (rate: number | null) => (rate === null ? '—' : `${Math.round(rate * 100)} %`);

// Evening reflections, paginated
function useReflections(userId: string) {
  return useInfiniteQuery({
    queryKey: ['reflections', userId],
    initialPageParam: 0,
    queryFn: async ({ pageParam }) => (await fetchReflections(pageParam)) ?? [],
    getNextPageParam: (last, all) => (last.length === REFLECTIONS_PAGE ? all.length : undefined),
  });
}

export default function Progress() {
  const { t, i18n } = useTranslation();
  const language = resolveLanguage(i18n.language);
  const { colors } = useTheme();
  const userId = useUserId();
  const queryClient = useQueryClient();

  const profile = useProfile(userId).data;
  const timezone = profile?.timezone ?? 'Europe/Paris';
  const today = localToday(timezone, new Date());
  const doneDays = useDoneDays(userId);
  const plans = usePlansSince(userId, addDays(today, -29));
  const habits = useUserHabits(userId);
  const logs = useHabitLogs(userId, addDays(today, -61));
  const goal = useActiveGoal(userId);
  const energy = useCheckinsSince(userId, addDays(today, -13));
  const reflections = useReflections(userId);
  const reviews = useReviews(userId);
  const reflectionItems = reflections.data?.pages.flat() ?? [];
  const [goalInput, setGoalInput] = useState<string | null>(null);

  // Refresh on every visit (an exercise may have been done on Today)
  useFocusEffect(
    useCallback(() => {
      for (const key of [
        'doneDays',
        'plansSince',
        'habitLogs',
        'goal',
        'checkinsSince',
        'reflections',
      ]) {
        void queryClient.invalidateQueries({ queryKey: [key, userId] });
      }
    }, [queryClient, userId]),
  );
  const [goalError, setGoalError] = useState<string | null>(null);

  if (!profile || doneDays.isPending || plans.isPending || habits.isPending || logs.isPending) {
    return <SplashView />;
  }

  const startedOn = profile.onboarded_at
    ? localToday(timezone, new Date(profile.onboarded_at))
    : null;
  const series = streak(doneDays.data ?? [], today, startedOn);
  const dayPlans = (plans.data ?? []).map((p) => ({ date: p.date, items: p.plan_items }));
  const rate7 = completionRate(dayPlans, today, 7);
  const rate30 = completionRate(dayPlans, today, 30);

  const habitRows = habits.data ?? [];
  const rates = habitRates(
    habitRows.map((h) => ({
      id: h.id,
      frequency: h.frequency,
      startedOn: localToday(timezone, new Date(h.created_at)),
    })),
    (logs.data ?? []).map((l) => ({
      habitId: l.user_habit_id,
      date: l.date,
      done: l.done,
      minimal: l.minimal,
    })),
    today,
    30,
  );

  const g = goal.data;
  const progress = g
    ? goalProgress(
        {
          targetValue: g.target_value,
          currentValue: g.current_value,
          createdOn: localToday(timezone, new Date(g.created_at)),
          deadline: g.deadline,
        },
        today,
      )
    : null;

  const energyByDate = new Map((energy.data ?? []).map((c) => [c.date, c.energy]));
  const energyValues = Array.from(
    { length: 14 },
    (_, i) => energyByDate.get(addDays(today, i - 13)) ?? null,
  );

  const saveGoal = async () => {
    if (!g || goalInput === null) return;
    const value = parseTargetValue(goalInput);
    if (value === 'invalid' || value === null) {
      setGoalError(t('progress.goalInvalid'));
      return;
    }
    const { error } = await supabase.from('goals').update({ current_value: value }).eq('id', g.id);
    if (error) {
      setGoalError(t('common.errorGeneric'));
      return;
    }
    setGoalError(null);
    setGoalInput(null);
    await queryClient.invalidateQueries({ queryKey: ['goal', userId] });
  };

  return (
    <Screen scroll>
      <View style={styles.top}>
        <AppText variant="title" accessibilityRole="header">
          {t('progress.title')}
        </AppText>
      </View>

      {/* Streak: orange, never negative */}
      <Card>
        <AppText variant="caption" tone="secondary">
          {t('progress.streak')}
        </AppText>
        <AppText variant="display" style={{ color: colors.momentum }}>
          {t('progress.days', { count: series.current })}
        </AppText>
        <AppText tone="secondary">{t('progress.record', { count: series.record })}</AppText>
        {series.current === 0 ? <AppText tone="body">{t('progress.streakStart')}</AppText> : null}
        <AppText variant="caption" tone="secondary">
          {t('progress.streakRule')}
        </AppText>
      </Card>

      <Card>
        <AppText variant="bodyStrong">{t('progress.completion')}</AppText>
        <View style={styles.rates}>
          <View style={styles.rate}>
            <AppText variant="title">{pct(rate7)}</AppText>
            <AppText variant="caption" tone="secondary">
              {t('progress.last7')}
            </AppText>
          </View>
          <View style={styles.rate}>
            <AppText variant="title">{pct(rate30)}</AppText>
            <AppText variant="caption" tone="secondary">
              {t('progress.last30')}
            </AppText>
          </View>
        </View>
        <DayBars days={dayStates(dayPlans, today, 30)} label={t('progress.chart30')} />
        {rate30 === null ? (
          <AppText variant="caption" tone="secondary">
            {t('progress.noData')}
          </AppText>
        ) : null}
      </Card>

      {rates.length > 0 ? (
        <Card>
          <AppText variant="bodyStrong">{t('progress.habits')}</AppText>
          {rates.map((r) => {
            const habit = habitRows.find((h) => h.id === r.habitId);
            const title = habit ? habitText(habit.title, habit.template, 'title', language) : '';
            return (
              <View key={r.habitId} style={styles.habitRow}>
                <View style={styles.flex}>
                  <AppText>{title}</AppText>
                  <View style={[styles.miniTrack, { backgroundColor: colors.border }]}>
                    <View
                      style={[
                        styles.miniFill,
                        {
                          width: `${Math.round((r.rate ?? 0) * 100)}%`,
                          backgroundColor: colors.primary,
                        },
                      ]}
                    />
                  </View>
                </View>
                <AppText
                  variant="bodyStrong"
                  accessibilityLabel={t('progress.habitRate', {
                    done: r.done,
                    expected: r.expected,
                  })}
                >
                  {pct(r.rate)}
                </AppText>
              </View>
            );
          })}
          <AppText variant="caption" tone="secondary">
            {t('progress.habitsNote')}
          </AppText>
        </Card>
      ) : null}

      {g && progress ? (
        <Card>
          <AppText variant="bodyStrong">{t('progress.goal')}</AppText>
          <AppText tone="body">{g.title}</AppText>
          {progress.ratio !== null ? (
            <>
              <AppText variant="subtitle">
                {t('progress.goalValue', {
                  current: g.current_value ?? 0,
                  target: g.target_value ?? 0,
                  unit: g.unit ?? '',
                })}
              </AppText>
              <GoalBar
                ratio={progress.ratio}
                expectedRatio={progress.expectedRatio}
                label={t('progress.goalA11y', { percent: Math.round(progress.ratio * 100) })}
              />
              {progress.expected !== null ? (
                <AppText variant="caption" tone="secondary">
                  {t('progress.goalExpected', {
                    expected: Math.round(progress.expected * 10) / 10,
                    unit: g.unit ?? '',
                  })}
                </AppText>
              ) : null}
              <View style={styles.goalInput}>
                <View style={styles.flex}>
                  <TextField
                    value={goalInput ?? ''}
                    onChangeText={setGoalInput}
                    placeholder={t('progress.goalCurrent')}
                    accessibilityLabel={t('progress.goalCurrent')}
                    keyboardType="decimal-pad"
                  />
                </View>
                <Button
                  label={t('progress.goalSave')}
                  variant="secondary"
                  onPress={() => void saveGoal()}
                  disabled={!goalInput}
                />
              </View>
              {goalError ? <AppText tone="danger">{goalError}</AppText> : null}
            </>
          ) : (
            <AppText variant="caption" tone="secondary">
              {t('progress.goalNoTarget')}
            </AppText>
          )}
        </Card>
      ) : null}

      {profile.consent_checkin ? (
        <Card>
          <AppText variant="bodyStrong">{t('progress.energy')}</AppText>
          <EnergyLine values={energyValues} label={t('progress.energyA11y')} />
        </Card>
      ) : null}

      {reviews.data && reviews.data.length > 0 ? (
        <Card>
          <AppText variant="bodyStrong">{t('progress.reviews')}</AppText>
          {reviews.data.map((r) => (
            <Button
              key={r.id}
              label={t('progress.reviewOf', { date: formatDate(r.week_start, language) })}
              variant="ghost"
              onPress={() => router.push({ pathname: '/review/[id]', params: { id: r.id } })}
            />
          ))}
        </Card>
      ) : null}

      <Card>
        <AppText variant="bodyStrong">{t('progress.reflections')}</AppText>
        {reflectionItems.length === 0 && !reflections.isPending ? (
          <AppText variant="caption" tone="secondary">
            {t('progress.noReflections')}
          </AppText>
        ) : null}
        {reflectionItems.map((r) => (
          <View key={r.date} style={[styles.reflection, { borderColor: colors.border }]}>
            <AppText variant="caption" tone="link">
              {new Date(`${r.date}T12:00:00Z`).toLocaleDateString(i18n.language, {
                weekday: 'long',
                day: 'numeric',
                month: 'long',
              })}
            </AppText>
            {r.reflection ? <AppText tone="body">{r.reflection}</AppText> : null}
            {r.note ? (
              <AppText variant="caption" tone="secondary">
                {r.note}
              </AppText>
            ) : null}
          </View>
        ))}
        {reflections.hasNextPage ? (
          <Button
            label={t('progress.more')}
            variant="ghost"
            onPress={() => void reflections.fetchNextPage()}
            loading={reflections.isFetchingNextPage}
          />
        ) : null}
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  top: { paddingTop: spacing.lg },
  rates: { flexDirection: 'row', gap: spacing.xl, marginVertical: spacing.sm },
  rate: { gap: 2 },
  habitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.xs,
  },
  flex: { flex: 1, gap: spacing.xs },
  miniTrack: { height: 6, borderRadius: 3, overflow: 'hidden' },
  miniFill: { height: 6, borderRadius: 3 },
  goalInput: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  reflection: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: spacing.sm,
    gap: 2,
    borderRadius: radius.badge,
  },
});
