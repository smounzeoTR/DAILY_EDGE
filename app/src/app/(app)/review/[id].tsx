// Weekly review: summary and proposals (accept or refuse, applied server side from the stored data).
// id = "current" opens the latest review.
import { useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { SplashView } from '@/components/SplashView';
import { AppText, Button, Card, Screen } from '@/components/ui';
import { formatDate, proposalText } from '@/features/review/texts';
import { resolveLanguage } from '@/i18n/language';
import { habitText } from '@/i18n/localize';
import { useUserId } from '@/lib/auth/AuthProvider';
import { isReviewOpen, useAllHabits, useHabitTemplates, useReviews } from '@/lib/queries';
import { supabase } from '@/lib/supabase';
import { spacing } from '@/theme';

const pct = (rate: number | null) => (rate === null ? '—' : `${Math.round(rate * 100)} %`);

export default function ReviewScreen() {
  const { t, i18n } = useTranslation();
  const language = resolveLanguage(i18n.language);
  const { id } = useLocalSearchParams<{ id: string }>();
  const userId = useUserId();
  const queryClient = useQueryClient();
  const reviews = useReviews(userId);
  const habits = useAllHabits(userId);
  const templates = useHabitTemplates();
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!reviews.data || !habits.data || !templates.data) return <SplashView />;
  const review = id === 'current' ? reviews.data[0] : reviews.data.find((r) => r.id === id);
  const back = <Button label={t('common.back')} variant="ghost" onPress={() => router.back()} />;
  if (!review) {
    return (
      <Screen footer={back}>
        <AppText tone="secondary">{t('review.none')}</AppText>
      </Screen>
    );
  }
  const open = review.id === reviews.data[0]?.id && isReviewOpen(review, new Date());
  const habitRows = habits.data;
  const templateRows = templates.data;
  const s = review.stats;

  const answer = async (index: number, accept: boolean) => {
    setBusy(index);
    setError(null);
    const { error: e } = await supabase.rpc('answer_review_proposal', {
      p_review_id: review.id,
      p_index: index,
      p_accept: accept,
    });
    setBusy(null);
    if (e) {
      setError(e.message === 'review_closed' ? t('review.closed') : t('common.errorGeneric'));
      return;
    }
    for (const key of ['reviews', 'allHabits', 'userHabits', 'goal', 'profile', 'currentReview']) {
      void queryClient.invalidateQueries({ queryKey: [key, userId] });
    }
    // "Update your progress": opens the progress input
    if (accept && review.proposals[index]?.type === 'update_goal_progress')
      router.navigate('/progress');
  };

  return (
    <Screen scroll footer={back}>
      <View style={styles.top}>
        <AppText variant="title" accessibilityRole="header">
          {t('review.title')}
        </AppText>
        <AppText tone="secondary">
          {t('review.week', {
            start: formatDate(s.weekStart, language),
            end: formatDate(s.weekEnd, language),
          })}
        </AppText>
      </View>

      <Card>
        <AppText variant="bodyStrong">{t('review.summary')}</AppText>
        {review.summary ? <AppText tone="body">{review.summary}</AppText> : null}
        {review.ai_status === 'pending' ? (
          <AppText variant="caption" tone="secondary">
            {t('review.aiPending')}
          </AppText>
        ) : null}
        <AppText tone="body">
          {t('review.exercises', { done: s.exercisesDone, planned: s.exercisesPlanned })}
        </AppText>
        {s.energyAverage !== null ? (
          <AppText tone="body">{t('review.energy', { value: s.energyAverage })}</AppText>
        ) : null}
        {s.bestDay ? (
          <AppText tone="body">
            {t('review.bestDay', {
              day: new Date(`${s.bestDay}T12:00:00Z`).toLocaleDateString(language, {
                weekday: 'long',
              }),
            })}
          </AppText>
        ) : null}
        {s.habits.map((h) => {
          const habit = habitRows.find((x) => x.id === h.habitId);
          if (!habit) return null;
          return (
            <View key={h.habitId} style={styles.row}>
              <AppText tone="body" style={styles.flex}>
                {habitText(habit.title, habit.template, 'title', language)}
              </AppText>
              <AppText variant="bodyStrong">{pct(h.rate)}</AppText>
            </View>
          );
        })}
        <AppText variant="caption" tone="secondary">
          {t('review.kind')}
        </AppText>
      </Card>

      <AppText variant="subtitle">{t('review.proposalsTitle')}</AppText>
      {review.proposals.length === 0 ? (
        <AppText tone="secondary">{t('review.noProposal')}</AppText>
      ) : null}
      {error ? <AppText tone="danger">{error}</AppText> : null}
      {review.proposals.map((proposal, index) => {
        // Premium: reworded by the AI (same proposal, same parameters)
        const text = proposal.text ?? proposalText(proposal, t, language, habitRows, templateRows);
        const answered = review.accepted[String(index)];
        return (
          <Card key={index}>
            <AppText tone="body">{text}</AppText>
            {answered ? (
              <AppText variant="bodyStrong" tone={answered.accept ? 'link' : 'secondary'}>
                {answered.accept ? t('review.accepted') : t('review.refused')}
              </AppText>
            ) : open ? (
              <View style={styles.actions}>
                <Button
                  label={t('review.accept')}
                  accessibilityLabel={t('review.acceptFor', { text })}
                  onPress={() => void answer(index, true)}
                  loading={busy === index}
                  style={styles.flex}
                />
                <Button
                  label={t('review.refuse')}
                  accessibilityLabel={t('review.refuseFor', { text })}
                  variant="secondary"
                  onPress={() => void answer(index, false)}
                  style={styles.flex}
                />
              </View>
            ) : (
              <AppText variant="caption" tone="secondary">
                {t('review.closed')}
              </AppText>
            )}
          </Card>
        );
      })}
    </Screen>
  );
}

const styles = StyleSheet.create({
  top: { paddingTop: spacing.lg, gap: spacing.xs },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  flex: { flex: 1 },
  actions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
});
