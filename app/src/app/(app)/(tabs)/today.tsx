// Today: plan of the day (generated on first open if missing), principle, exercise,
// why today, proposed habit, habits and evening check-in.
import { useQueryClient } from '@tanstack/react-query';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { LanguageToggle } from '@/components/LanguageToggle';
import { Logo } from '@/components/Logo';
import { SplashView } from '@/components/SplashView';
import { AppText, Button, Card, Screen } from '@/components/ui';
import { addDays } from '@/features/habits/schedule';
import { scheduleReminders, shouldShowPrimer } from '@/features/reminders/reminders';
import { canEditResult, isEveningHighlight, localToday } from '@/features/today/day';
import { ExerciseCard, type ResultInput } from '@/features/today/ExerciseCard';
import { HabitsSection, type HabitAction } from '@/features/today/HabitsSection';
import { resolveLanguage } from '@/i18n/language';
import { localized } from '@/i18n/localize';
import { useAuth, useUserId } from '@/lib/auth/AuthProvider';
import {
  generatePlan,
  queryKeys,
  useCheckin,
  useHabitLogs,
  usePlan,
  useProfile,
  usePrograms,
  useProgramSteps,
  useUserHabits,
} from '@/lib/queries';
import { storage } from '@/lib/storage';
import { supabase } from '@/lib/supabase';
import { spacing } from '@/theme';

// Re-render every minute (evening highlight, day change)
function useNow(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

const dismissedKey = (planId: string) => `today.habitLater.${planId}`;

export default function Today() {
  const { t, i18n } = useTranslation();
  const language = resolveLanguage(i18n.language);
  const { signOut } = useAuth();
  const userId = useUserId();
  const queryClient = useQueryClient();
  const now = useNow();

  const profile = useProfile(userId).data;
  const timezone = profile?.timezone ?? 'Europe/Paris';
  const today = localToday(timezone, now);
  const tomorrow = addDays(today, 1);

  const plan = usePlan(userId, today);
  const programs = usePrograms().data ?? [];
  const steps = useProgramSteps().data ?? [];
  const habits = useUserHabits(userId);
  const logs = useHabitLogs(userId, addDays(today, -31));
  const checkin = useCheckin(userId, today);

  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [laterTick, setLaterTick] = useState(0);
  const generatedFor = useRef<string | null>(null);

  // No plan yet for today: generate it (once per day)
  useEffect(() => {
    // Missing plan, or empty plan created by a library addition (not computed yet)
    const needsPlan = plan.isSuccess && (plan.data === null || plan.data.generated_at === null);
    if (!needsPlan || generatedFor.current === today) return;
    generatedFor.current = today;
    setGenerating(true);
    setGenerateError(false);
    generatePlan()
      .then(() => queryClient.invalidateQueries({ queryKey: queryKeys.plan(userId, today) }))
      .catch(() => setGenerateError(true))
      .finally(() => setGenerating(false));
  }, [plan.isSuccess, plan.data, today, userId, queryClient]);

  // Refresh on every visit (an exercise may have been added from the library)
  useFocusEffect(
    useCallback(() => {
      void queryClient.invalidateQueries({ queryKey: ['plan', userId] });
      void queryClient.invalidateQueries({ queryKey: queryKeys.userHabits(userId) });
    }, [queryClient, userId]),
  );

  // Reminders: explanation screen once, then keep them in sync with hours and language
  useEffect(() => {
    void shouldShowPrimer().then((show) => {
      if (show) router.push('/reminders');
    });
  }, []);
  useEffect(() => {
    if (!profile) return;
    void scheduleReminders({ morning: profile.notify_morning, evening: profile.notify_evening });
  }, [profile, language]);

  if (generateError) {
    return (
      <SplashView
        onRetry={() => {
          generatedFor.current = null;
          setGenerateError(false);
          void plan.refetch();
        }}
      />
    );
  }
  if (!profile || plan.isPending || generating || !plan.data || !plan.data.generated_at) {
    return <SplashView />;
  }

  const data = plan.data;
  const editable = canEditResult(data.date, today);
  const program = programs.find((p) => p.id === profile.program_id);
  const step = steps.find((s) => s.program_id === program?.id && s.day_index === data.program_day);
  const name = profile.display_name;
  const ownedTemplates = new Set((habits.data ?? []).map((h) => h.template_id));
  void laterTick;
  const showIntroduced =
    data.introduced &&
    !ownedTemplates.has(data.introduced.id) &&
    storage.getItemSync(dismissedKey(data.id)) !== '1';
  const evening = isEveningHighlight(now, profile.notify_evening, timezone);

  const refreshTomorrow = () => {
    // Recomputed only if tomorrow's plan exists and is untouched (server side)
    void generatePlan(tomorrow).catch(() => undefined);
  };

  const saveResult = async (input: ResultInput) => {
    setSaving(true);
    setError(null);
    const { error: rpcError } = await supabase.rpc('set_plan_item_result', {
      p_item_id: input.itemId,
      p_status: input.status,
      p_proof_value: input.proof ?? undefined,
      p_rating: input.rating ?? undefined,
    });
    setSaving(false);
    if (rpcError) {
      setError(
        t(rpcError.message === 'day_closed' ? 'today.errors.dayClosed' : 'common.errorGeneric'),
      );
    } else {
      refreshTomorrow();
    }
    await queryClient.invalidateQueries({ queryKey: queryKeys.plan(userId, today) });
  };

  const habitAction = async ({ habitId, action }: HabitAction) => {
    setError(null);
    const result =
      action === 'uncheck'
        ? await supabase.from('habit_logs').delete().eq('user_habit_id', habitId).eq('date', today)
        : await supabase.from('habit_logs').upsert(
            {
              user_habit_id: habitId,
              user_id: userId,
              date: today,
              done: true,
              minimal: action === 'minimal',
            },
            { onConflict: 'user_habit_id,date' },
          );
    if (result.error) setError(t('common.errorGeneric'));
    await queryClient.invalidateQueries({ queryKey: ['habitLogs', userId] });
  };

  const addIntroduced = async () => {
    if (!data.introduced) return;
    const { error: rpcError } = await supabase.rpc('add_habit_from_template', {
      p_template_id: data.introduced.id,
    });
    if (rpcError && rpcError.message !== 'already_added') setError(t('common.errorGeneric'));
    await queryClient.invalidateQueries({ queryKey: queryKeys.userHabits(userId) });
  };

  const later = () => {
    storage.setItemSync(dismissedKey(data.id), '1');
    setLaterTick((n) => n + 1);
  };

  const weekNumber = data.program_day ? Math.floor((data.program_day - 1) / 7) + 1 : null;

  return (
    <Screen
      scroll
      header={
        <View style={styles.header}>
          <Logo size={32} />
          <LanguageToggle />
        </View>
      }
    >
      <View style={styles.top}>
        <AppText variant="title" accessibilityRole="header">
          {name ? t('today.greeting', { name }) : t('today.greetingNoName')}
        </AppText>
        {program && data.program_day ? (
          <AppText tone="secondary">
            {t('today.dayOf', { day: data.program_day, total: program.duration_days })}
            {step && weekNumber
              ? ` · ${t('today.week', { n: weekNumber, theme: localized(step, 'theme', language) })}`
              : ''}
          </AppText>
        ) : null}
      </View>

      {error ? <AppText tone="danger">{error}</AppText> : null}

      {data.principle ? (
        <Card>
          <AppText variant="caption" tone="link">
            {t('today.principleOfDay')}
          </AppText>
          <AppText variant="subtitle">{localized(data.principle, 'title', language)}</AppText>
          <AppText tone="body">{localized(data.principle, 'summary', language)}</AppText>
        </Card>
      ) : null}

      {[...data.plan_items]
        .sort((a, b) => a.position - b.position)
        .map((item) => (
          <ExerciseCard
            key={`${item.id}-${item.status}`}
            item={item}
            editable={editable}
            saving={saving}
            onSave={(input) => void saveResult(input)}
          />
        ))}

      {data.why_today ? (
        <Card>
          <AppText variant="caption" tone="link">
            {t('today.whyToday')}
          </AppText>
          <AppText tone="body">{data.why_today}</AppText>
        </Card>
      ) : null}

      {showIntroduced && data.introduced ? (
        <Card>
          <AppText variant="caption" tone="link">
            {t('today.newHabit')}
          </AppText>
          <AppText variant="bodyStrong">{localized(data.introduced, 'title', language)}</AppText>
          <AppText variant="caption" tone="secondary">
            {localized(data.introduced, 'description', language)}
          </AppText>
          <View style={styles.actions}>
            <Button
              label={t('today.addHabit')}
              onPress={() => void addIntroduced()}
              style={styles.flex}
            />
            <Button
              label={t('today.later')}
              variant="secondary"
              onPress={later}
              style={styles.flex}
            />
          </View>
        </Card>
      ) : null}

      <HabitsSection
        habits={habits.data ?? []}
        logs={logs.data ?? []}
        today={today}
        timezone={timezone}
        onAction={(a) => void habitAction(a)}
      />

      <Card>
        <AppText variant="bodyStrong">{t('today.checkinTitle')}</AppText>
        <AppText variant="caption" tone="secondary">
          {t('today.checkinBody')}
        </AppText>
        <Button
          label={checkin.data ? t('today.checkinEdit') : t('today.checkinStart')}
          variant={evening ? 'primary' : 'secondary'}
          onPress={() => router.push('/checkin')}
        />
      </Card>

      <Pressable accessibilityRole="button" onPress={() => void signOut()} style={styles.signOut}>
        <AppText variant="caption" tone="secondary">
          {t('today.signOut')}
        </AppText>
      </Pressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  top: { paddingTop: spacing.lg, gap: spacing.xs },
  actions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  flex: { flex: 1 },
  signOut: { alignSelf: 'center', padding: spacing.md },
});
