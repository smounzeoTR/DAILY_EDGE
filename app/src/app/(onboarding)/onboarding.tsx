import { useQueryClient } from '@tanstack/react-query';
import { getCalendars } from 'expo-localization';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
  type ScrollViewInstance,
} from 'react-native';

import { LanguageToggle } from '@/components/LanguageToggle';
import { Logo } from '@/components/Logo';
import { SplashView } from '@/components/SplashView';
import { AppText, Button, ProgressBar, Screen } from '@/components/ui';
import { clearDraft, loadDraft, saveDraft } from '@/features/onboarding/draft';
import { makeDraft } from '@/features/onboarding/draftSchema';
import {
  buildCompleteOnboardingArgs,
  canContinue,
  effectiveProgram,
  habitCandidates,
  localDateString,
  skipAnswer,
} from '@/features/onboarding/rules';
import { StepContent } from '@/features/onboarding/StepContent';
import {
  emptyAnswers,
  SKIPPABLE,
  STEPS,
  type Answers,
  type Step,
} from '@/features/onboarding/types';
import { resolveLanguage } from '@/i18n/language';
import { localized } from '@/i18n/localize';
import { useUserId } from '@/lib/auth/AuthProvider';
import { queryKeys, useHabitTemplates, usePrograms, useProgramSteps } from '@/lib/queries';
import { supabase } from '@/lib/supabase';
import { spacing } from '@/theme';

const TITLE_KEYS = {
  goalTitle: 'onboarding.q.goalTitle',
  goalMeasure: 'onboarding.q.goalMeasure',
  goalDeadline: 'onboarding.q.goalDeadline',
  goalWhy: 'onboarding.q.goalWhy',
  situation: 'onboarding.q.situation',
  domains: 'onboarding.q.domains',
  blockers: 'onboarding.q.blockers',
  dailyMinutes: 'onboarding.q.dailyMinutes',
  chronotype: 'onboarding.q.chronotype',
  motivation: 'onboarding.q.motivation',
  level: 'onboarding.q.level',
  reminders: 'onboarding.q.reminders',
  consent: 'onboarding.consent.title',
  program: 'onboarding.program.title',
  habits: 'onboarding.habits.title',
} as const satisfies Record<Step, string>;

// complete_onboarding error messages with a dedicated text
const ERROR_KEYS: Record<
  string,
  `onboarding.errors.${'invalid_goal_deadline' | 'invalid_habits' | 'invalid_program' | 'invalid_goal_title'}`
> = {
  invalid_goal_deadline: 'onboarding.errors.invalid_goal_deadline',
  invalid_habits: 'onboarding.errors.invalid_habits',
  invalid_program: 'onboarding.errors.invalid_program',
  invalid_goal_title: 'onboarding.errors.invalid_goal_title',
};

export default function Onboarding() {
  const { t, i18n } = useTranslation();
  const language = resolveLanguage(i18n.language);
  const userId = useUserId();
  const queryClient = useQueryClient();
  const scroller = useRef<ScrollViewInstance>(null);

  // Resume the local draft if the app was closed mid-onboarding
  const [initial] = useState(() => loadDraft(userId));
  const [stepIndex, setStepIndex] = useState(initial?.stepIndex ?? 0);
  const [answers, setAnswers] = useState<Answers>(initial?.answers ?? emptyAnswers);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const programs = usePrograms();
  const programSteps = useProgramSteps();
  const templates = useHabitTemplates();

  useEffect(() => {
    saveDraft(userId, makeDraft(stepIndex, answers));
  }, [userId, stepIndex, answers]);

  const step = STEPS[stepIndex] ?? 'goalTitle';
  const today = localDateString(new Date());
  const program = useMemo(
    () => (programs.data ? effectiveProgram(answers, programs.data) : null),
    [answers, programs.data],
  );
  const candidates = useMemo(
    () =>
      templates.data && program
        ? habitCandidates(templates.data, program.persona, answers.priorityDomains)
        : [],
    [templates.data, program, answers.priorityDomains],
  );

  if (programs.isError || programSteps.isError || templates.isError) {
    return (
      <SplashView
        onRetry={() => {
          void programs.refetch();
          void programSteps.refetch();
          void templates.refetch();
        }}
      />
    );
  }
  if (!programs.data || !programSteps.data || !templates.data) return <SplashView />;

  const update = (patch: Partial<Answers>) => {
    setError(null);
    setAnswers((prev) => ({ ...prev, ...patch }));
  };
  const goTo = (index: number) => {
    setError(null);
    setStepIndex(index);
    scroller.current?.scrollTo({ y: 0, animated: false });
  };
  const isLast = stepIndex === STEPS.length - 1;

  const templateRows = templates.data;
  const submit = async () => {
    if (!program) return;
    setSubmitting(true);
    setError(null);
    const defaultCues = Object.fromEntries(
      templateRows.map((tpl) => [tpl.id, localized(tpl, 'default_cue', language)]),
    );
    const timezone = getCalendars()[0]?.timeZone ?? 'Europe/Paris';
    const { error: rpcError } = await supabase.rpc(
      'complete_onboarding',
      buildCompleteOnboardingArgs(answers, program.id, defaultCues, { locale: language, timezone }),
    );
    setSubmitting(false);
    if (rpcError && rpcError.message !== 'already_onboarded') {
      const key = ERROR_KEYS[rpcError.message];
      setError(key ? t(key) : t('onboarding.errors.submit'));
      return;
    }
    if (answers.consentAnalytics) {
      // Separate from complete_onboarding: a failure here only leaves the measurement off
      await supabase.from('profiles').update({ consent_analytics: true }).eq('user_id', userId);
    }
    clearDraft(userId);
    // The auth guard switches to (app) once the profile is onboarded
    await queryClient.invalidateQueries({ queryKey: queryKeys.profile(userId) });
  };

  const next = () => {
    if (isLast) void submit();
    else goTo(stepIndex + 1);
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Screen
        header={
          <View style={styles.headerStack}>
            <View style={styles.header}>
              <Logo size={32} />
              <LanguageToggle />
            </View>
            <View
              accessible
              accessibilityLabel={t('onboarding.stepOf', {
                current: stepIndex + 1,
                total: STEPS.length,
              })}
            >
              <ProgressBar value={(stepIndex + 1) / STEPS.length} />
            </View>
          </View>
        }
        footer={
          <>
            {error ? <AppText tone="danger">{error}</AppText> : null}
            <Button
              label={isLast ? t('common.start') : t('common.continue')}
              onPress={next}
              disabled={!canContinue(step, answers, today)}
              loading={submitting}
            />
            <View style={styles.secondaryRow}>
              {stepIndex > 0 ? (
                <Button
                  label={t('common.back')}
                  variant="ghost"
                  onPress={() => goTo(stepIndex - 1)}
                  style={styles.flex}
                />
              ) : (
                <View style={styles.flex} />
              )}
              {SKIPPABLE.has(step) ? (
                <Button
                  label={t('common.skip')}
                  variant="ghost"
                  onPress={() => {
                    setAnswers(skipAnswer(step, answers));
                    goTo(stepIndex + 1);
                  }}
                  style={styles.flex}
                />
              ) : (
                <View style={styles.flex} />
              )}
            </View>
          </>
        }
      >
        <ScrollView
          ref={scroller}
          contentContainerStyle={styles.body}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <AppText variant="title" accessibilityRole="header">
            {t(TITLE_KEYS[step])}
          </AppText>
          <StepContent
            step={step}
            answers={answers}
            update={update}
            today={today}
            program={program}
            programs={programs.data}
            programSteps={programSteps.data}
            candidates={candidates}
          />
        </ScrollView>
      </Screen>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  headerStack: { gap: spacing.md },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  body: { paddingTop: spacing.xl, paddingBottom: spacing.xl, gap: spacing.lg },
  secondaryRow: { flexDirection: 'row', gap: spacing.sm },
});
