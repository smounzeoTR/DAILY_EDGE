// Today: plan of the day (generated on first open if missing), day journey (4 steps), principle,
// exercise, why today, proposed habit, habits and evening check-in; a single guide overlay per
// opening (guided tour, celebration or tip of the day).
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router, useFocusEffect } from 'expo-router';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentRef,
  type ReactNode,
} from 'react';
import { useTranslation } from 'react-i18next';
import {
  Pressable,
  StyleSheet,
  View,
  type LayoutChangeEvent,
  type ScrollView,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { LanguageToggle } from '@/components/LanguageToggle';
import { Logo } from '@/components/Logo';
import { SplashView } from '@/components/SplashView';
import { AiWrittenLabel } from '@/components/AiLabel';
import { AppText, Button, Card, Screen } from '@/components/ui';
import { addDays, type HabitFrequency } from '@shared/habits/schedule.ts';
import {
  milestonesToRecordSilently,
  overlayToShow,
  type MilestoneId,
  type Overlay,
  type TipId,
} from '@/features/guide/guide';
import { GuideOverlay, type TourStep } from '@/features/guide/GuideOverlay';
import { HelpButton } from '@/features/guide/HelpButton';
import { OfflineBanner } from '@/features/offline/OfflineBanner';
import { classifyError } from '@/features/offline/queue';
import { isOnline, queueAction } from '@/features/offline/sync';
import { dayJourney } from '@/features/guide/journey';
import { JourneyBar } from '@/features/guide/JourneyBar';
import { streak } from '@/features/progress/progress';
import { scheduleReminders, shouldShowPrimer } from '@/features/reminders/reminders';
import { SupportCard } from '@/features/support/SupportCard';
import { supportToShow } from '@/features/support/lowMood';
import {
  canEditResult,
  introducedDismissedKey,
  isEveningHighlight,
  localToday,
} from '@/features/today/day';
import { ExerciseCard, type ResultInput } from '@/features/today/ExerciseCard';
import { HabitsSection, type HabitAction } from '@/features/today/HabitsSection';
import { resolveLanguage } from '@/i18n/language';
import { localized } from '@/i18n/localize';
import { useAuth, useUserId } from '@/lib/auth/AuthProvider';
import {
  generatePlan,
  generateReview,
  guideKey,
  isAiPending,
  isReviewOpen,
  queryKeys,
  type PlanData,
  useCheckin,
  useCheckinsSince,
  useDoneDays,
  useGuideState,
  useHabitLogs,
  useLastAchievedGoal,
  useIsPremium,
  usePlan,
  useProfile,
  usePrograms,
  useProgramSteps,
  useUserHabits,
} from '@/lib/queries';
import { storage } from '@/lib/storage';
import { track } from '@/lib/analytics';
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

const dismissedKey = introducedDismissedKey;

// Section of Today that the journey and the guided tour can scroll to
function Anchor({
  id,
  onY,
  style,
  children,
}: {
  id: string;
  onY: (id: string, y: number) => void;
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
}) {
  return (
    <View style={style} onLayout={(e: LayoutChangeEvent) => onY(id, e.nativeEvent.layout.y)}>
      {children}
    </View>
  );
}

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
  const programsQuery = usePrograms();
  const programs = useMemo(() => programsQuery.data ?? [], [programsQuery.data]);
  const steps = useProgramSteps().data ?? [];
  const habits = useUserHabits(userId);
  const logs = useHabitLogs(userId, addDays(today, -31));
  const checkin = useCheckin(userId, today);
  const premium = useIsPremium(userId);
  const guideState = useGuideState(userId);
  const doneDays = useDoneDays(userId);
  const achievedGoal = useLastAchievedGoal(userId);
  // Mood of the last days (low-mood support card)
  const recentCheckins = useCheckinsSince(userId, addDays(today, -14));
  // Weekly review: generated server side when due (Sunday from 18:00 or missed week)
  const review = useQuery({
    queryKey: ['currentReview', userId],
    queryFn: generateReview,
    staleTime: 30 * 60 * 1000,
    retry: 1,
  });

  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [laterTick, setLaterTick] = useState(0);
  const generatedFor = useRef<string | null>(null);
  const enrichRequestedFor = useRef<string | null>(null);
  // Guide: scroll targets of the cards, single overlay decided once per opening
  const scrollRef = useRef<ComponentRef<typeof ScrollView>>(null);
  const sectionY = useRef<Partial<Record<string, number>>>({});
  const [focused, setFocused] = useState(false);
  const [primerChecked, setPrimerChecked] = useState(false);
  const [overlayClosed, setOverlayClosed] = useState(false);

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

  // Premium with AI consent: a plan computed without the AI (nightly batch, premium just
  // enabled) is recomputed once with the background enrichment (server checks eligibility)
  useEffect(() => {
    const d = plan.data;
    if (!d || !d.generated_at || premium.data !== true || !profile?.consent_ai) return;
    const stalePending = d.ai_status === 'pending' && !isAiPending(d);
    if (d.ai_status !== null && !stalePending) return;
    if (d.plan_items.some((i) => i.origin === 'engine' && i.status !== 'todo')) return;
    if (enrichRequestedFor.current === d.id) return;
    enrichRequestedFor.current = d.id;
    generatePlan()
      .then(() => queryClient.invalidateQueries({ queryKey: queryKeys.plan(userId, today) }))
      .catch(() => undefined);
  }, [plan.data, premium.data, profile?.consent_ai, today, userId, queryClient]);

  // Refresh on every visit (an exercise may have been added from the library)
  useFocusEffect(
    useCallback(() => {
      void queryClient.invalidateQueries({ queryKey: ['plan', userId] });
      void queryClient.invalidateQueries({ queryKey: queryKeys.userHabits(userId) });
    }, [queryClient, userId]),
  );

  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, []),
  );

  // Reminders: explanation screen once, then keep them in sync with hours and language
  useEffect(() => {
    void shouldShowPrimer().then((show) => {
      if (show) router.push('/reminders');
      setPrimerChecked(true);
    });
  }, []);

  // One guide overlay per opening (tour > celebration > tip), once everything is loaded and
  // Today is in front (after the reminders explanation). Once closed, nothing else is shown
  // until the next opening: the others wait.
  const guideInput = useMemo(() => {
    if (!focused || !primerChecked || !profile?.onboarded_at || !plan.data?.generated_at) {
      return null;
    }
    if (!guideState.isSuccess || !doneDays.isSuccess || !achievedGoal.isSuccess) return null;
    const tz = profile.timezone;
    const program = programs.find((p) => p.id === profile.program_id);
    return {
      today,
      onboardedOn: localToday(tz, new Date(profile.onboarded_at)),
      state: guideState.data
        ? {
            tourFinishedAt: guideState.data.tour_finished_at,
            tipsSeen: (guideState.data.tips_seen ?? {}) as Partial<Record<TipId, string>>,
            milestones: (guideState.data.milestones ?? {}) as Partial<Record<MilestoneId, string>>,
          }
        : null,
      streakCurrent: streak(doneDays.data ?? [], today, profile.onboarded_at.slice(0, 10)).current,
      programDay: profile.program_day ?? null,
      programDuration: program?.duration_days ?? null,
      goalAchievedOn: achievedGoal.data?.achieved_at
        ? localToday(tz, new Date(achievedGoal.data.achieved_at))
        : null,
    };
  }, [
    focused,
    primerChecked,
    profile,
    plan.data?.generated_at,
    guideState.isSuccess,
    guideState.data,
    doneDays.isSuccess,
    doneDays.data,
    achievedGoal.isSuccess,
    achievedGoal.data,
    programs,
    today,
  ]);
  const overlay: Overlay = overlayClosed || !guideInput ? null : overlayToShow(guideInput);
  // Milestones reached long ago: recorded without being shown
  useEffect(() => {
    if (!guideInput) return;
    for (const milestone of milestonesToRecordSilently(guideInput)) {
      void supabase.rpc('mark_milestone_celebrated', { p_milestone: milestone });
    }
  }, [guideInput]);

  const setSectionY = useCallback((id: string, y: number) => {
    sectionY.current[id] = y;
  }, []);
  const scrollToSection = useCallback((id: string) => {
    const y = sectionY.current[id];
    if (y !== undefined) scrollRef.current?.scrollTo({ y: Math.max(0, y - 16), animated: true });
  }, []);
  const onTourStep = useCallback(
    (step: TourStep) => scrollToSection(step === 'why' ? 'why' : step),
    [scrollToSection],
  );
  const closeOverlay = async (call: PromiseLike<{ error: unknown }>) => {
    // Hidden at once for this opening; the server state makes it never come back
    setOverlayClosed(true);
    await call;
    await queryClient.invalidateQueries({ queryKey: guideKey(userId) });
  };
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

  // Offline (or no answer from the server): queued and shown at once, sent when the network is back
  const resultLocally = (input: ResultInput) =>
    queryClient.setQueryData<PlanData | null>(queryKeys.plan(userId, today), (old) =>
      old
        ? {
            ...old,
            plan_items: old.plan_items.map((i) =>
              i.id === input.itemId
                ? { ...i, status: input.status, proof_value: input.proof, rating: input.rating }
                : i,
            ),
          }
        : old,
    );
  const queueResult = (input: ResultInput) => {
    queueAction(userId, {
      kind: 'result',
      itemId: input.itemId,
      status: input.status,
      proof: input.proof,
      rating: input.rating,
    });
    resultLocally(input);
  };

  const saveResult = async (input: ResultInput) => {
    setError(null);
    if (!isOnline()) {
      queueResult(input);
      return;
    }
    setSaving(true);
    const { error: rpcError } = await supabase.rpc('set_plan_item_result', {
      p_item_id: input.itemId,
      p_status: input.status,
      p_proof_value: input.proof ?? undefined,
      p_rating: input.rating ?? undefined,
    });
    setSaving(false);
    if (rpcError && classifyError(rpcError) === 'network') {
      queueResult(input);
      return;
    }
    if (rpcError) {
      setError(
        t(rpcError.message === 'day_closed' ? 'today.errors.dayClosed' : 'common.errorGeneric'),
      );
    } else {
      track('exercise_result', { status: input.status });
      refreshTomorrow();
    }
    await queryClient.invalidateQueries({ queryKey: queryKeys.plan(userId, today) });
  };

  const logsKey = queryKeys.habitLogs(userId, addDays(today, -31));
  const habitLocally = (habitId: string, action: HabitAction['action']) =>
    queryClient.setQueryData<
      { user_habit_id: string; date: string; done: boolean; minimal: boolean }[]
    >(logsKey, (old) => {
      const rest = (old ?? []).filter((l) => !(l.user_habit_id === habitId && l.date === today));
      return action === 'uncheck'
        ? rest
        : [
            ...rest,
            { user_habit_id: habitId, date: today, done: true, minimal: action === 'minimal' },
          ];
    });

  const habitAction = async ({ habitId, action }: HabitAction) => {
    setError(null);
    const queueHabit = () => {
      queueAction(userId, { kind: 'habit', habitId, date: today, action });
      habitLocally(habitId, action);
    };
    if (!isOnline()) {
      queueHabit();
      return;
    }
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
    if (result.error && classifyError(result.error) === 'network') {
      queueHabit();
      return;
    }
    if (result.error) setError(t('common.errorGeneric'));
    else track('habit_checked', { action });
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
    // Tab badges read the plan from the cache: refresh it
    void queryClient.invalidateQueries({ queryKey: queryKeys.plan(userId, today) });
  };

  const weekNumber = data.program_day ? Math.floor((data.program_day - 1) / 7) + 1 : null;

  const journey = dayJourney({
    today,
    principleReadAt: data.principle_read_at,
    items: data.plan_items,
    habits: (habits.data ?? []).map((h) => ({
      id: h.id,
      frequency: h.frequency as HabitFrequency,
      startedOn: localToday(timezone, new Date(h.created_at)),
    })),
    logs: logs.data ?? [],
    checkinDone: Boolean(checkin.data),
  });
  const supportEpisode = supportToShow(
    recentCheckins.data ?? [],
    today,
    guideState.data?.support_seen as Record<string, unknown> | undefined,
    profile.consent_checkin,
  );
  const supportSeen = async () => {
    if (!supportEpisode) return;
    await supabase.rpc('mark_support_shown', { p_episode_start: supportEpisode });
    await queryClient.invalidateQueries({ queryKey: guideKey(userId) });
  };
  const markPrincipleRead = async () => {
    const { error: rpcError } = await supabase.rpc('mark_principle_read', { p_plan_id: data.id });
    if (rpcError) setError(t('common.errorGeneric'));
    await queryClient.invalidateQueries({ queryKey: queryKeys.plan(userId, today) });
  };

  return (
    <View style={styles.fill}>
      <Screen
        scroll
        scrollRef={scrollRef}
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

        <OfflineBanner />
        {supportEpisode ? <SupportCard onSeen={() => void supportSeen()} /> : null}
        <JourneyBar journey={journey} onStep={scrollToSection} />

        {error ? <AppText tone="danger">{error}</AppText> : null}

        {data.principle ? (
          <Anchor id="principle" onY={setSectionY}>
            <Card>
              <View style={styles.cardHead}>
                <AppText variant="caption" tone="link">
                  {t('today.principleOfDay')}
                </AppText>
                <HelpButton topic="principle" />
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityHint={t('guide.principle.openHint')}
                onPress={() => {
                  if (!data.principle) return;
                  router.push({
                    pathname: '/principle/[id]',
                    params: { id: data.principle.id, planId: data.id },
                  });
                }}
              >
                <AppText variant="subtitle">{localized(data.principle, 'title', language)}</AppText>
                <AppText tone="body">{localized(data.principle, 'summary', language)}</AppText>
              </Pressable>
              {data.principle_read_at ? (
                <AppText variant="caption" tone="link">
                  {t('guide.principle.read')}
                </AppText>
              ) : (
                <Button
                  label={t('guide.principle.markRead')}
                  variant="secondary"
                  onPress={() => void markPrincipleRead()}
                />
              )}
            </Card>
          </Anchor>
        ) : null}

        <Anchor id="exercise" onY={setSectionY} style={styles.group}>
          {[...data.plan_items]
            .sort((a, b) => a.position - b.position)
            .map((item) => (
              <ExerciseCard
                key={`${item.id}-${item.status}`}
                item={item}
                editable={editable}
                saving={saving}
                onSave={(input) => void saveResult(input)}
                help={<HelpButton topic="exercise" />}
              />
            ))}
        </Anchor>

        {data.why_today ? (
          <Anchor id="why" onY={setSectionY}>
            <Card>
              <View style={styles.cardHead}>
                <AppText variant="caption" tone="link">
                  {t('today.whyToday')}
                </AppText>
                <HelpButton topic="why" />
              </View>
              <AppText tone="body">{data.why_today}</AppText>
              {data.ai_status === 'enriched' ? <AiWrittenLabel /> : null}
              {isAiPending(data) ? (
                <AppText variant="caption" tone="secondary">
                  {t('today.aiPending')}
                </AppText>
              ) : null}
            </Card>
          </Anchor>
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

        {review.data &&
        isReviewOpen(review.data, now) &&
        review.data.proposals.some((_, i) => !review.data?.accepted[String(i)]) ? (
          <Card>
            <AppText variant="caption" tone="link">
              {t('review.title')}
            </AppText>
            <AppText variant="bodyStrong">{t('review.ready')}</AppText>
            <Button label={t('review.open')} onPress={() => router.push('/review/current')} />
          </Card>
        ) : null}

        <Anchor id="habits" onY={setSectionY}>
          <HabitsSection
            habits={habits.data ?? []}
            logs={logs.data ?? []}
            today={today}
            timezone={timezone}
            onAction={(a) => void habitAction(a)}
            help={<HelpButton topic="habits" />}
          />
        </Anchor>

        <Anchor id="checkin" onY={setSectionY}>
          <Card>
            <View style={styles.cardHead}>
              <AppText variant="bodyStrong">{t('today.checkinTitle')}</AppText>
              <HelpButton topic="checkin" />
            </View>
            <AppText variant="caption" tone="secondary">
              {t('today.checkinBody')}
            </AppText>
            <Button
              label={checkin.data ? t('today.checkinEdit') : t('today.checkinStart')}
              variant={evening ? 'primary' : 'secondary'}
              onPress={() => router.push('/checkin')}
            />
          </Card>
        </Anchor>

        <Pressable accessibilityRole="button" onPress={() => void signOut()} style={styles.signOut}>
          <AppText variant="caption" tone="secondary">
            {t('today.signOut')}
          </AppText>
        </Pressable>
      </Screen>
      <GuideOverlay
        overlay={overlay}
        onTourStep={onTourStep}
        onTourEnd={(skipped) => {
          scrollRef.current?.scrollTo({ y: 0, animated: true });
          void closeOverlay(supabase.rpc('finish_guided_tour', { p_skipped: skipped }));
        }}
        onCelebrationClose={(milestone) =>
          void closeOverlay(supabase.rpc('mark_milestone_celebrated', { p_milestone: milestone }))
        }
        onTipClose={(tip) => void closeOverlay(supabase.rpc('mark_tip_seen', { p_tip: tip }))}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  top: { paddingTop: spacing.lg, gap: spacing.xs },
  actions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  flex: { flex: 1 },
  group: { gap: spacing.md },
  cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  signOut: { alignSelf: 'center', padding: spacing.md },
});
