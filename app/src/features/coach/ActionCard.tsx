// Action proposed by the coach: nothing changes until "Appliquer" (confirm_assistant_action
// checks everything again and uses the same rules as the app).
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { AppText, Button, Card } from '@/components/ui';
import { resolveLanguage } from '@/i18n/language';
import { localized } from '@/i18n/localize';
import { useUserId } from '@/lib/auth/AuthProvider';
import { useHabitTemplates, useLibrary } from '@/lib/queries';
import { supabase } from '@/lib/supabase';
import { spacing, useTheme } from '@/theme';

import { coachKeys, type CoachAction } from './api';

const KNOWN_ERRORS = [
  'plan_touched',
  'action_expired',
  'action_already_resolved',
  'invalid_swap',
  'no_shorter_exercise',
  'too_many_habits',
  'item_not_found',
  'goal_not_found',
] as const;

export function ActionCard({ action }: { action: CoachAction }) {
  const { t, i18n } = useTranslation();
  const language = resolveLanguage(i18n.language);
  const { colors } = useTheme();
  const userId = useUserId();
  const queryClient = useQueryClient();
  const library = useLibrary().data;
  const templates = useHabitTemplates().data ?? [];
  const [busy, setBusy] = useState<'apply' | 'cancel' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const params = (action.params ?? {}) as Record<string, string | number | undefined>;

  const exerciseTitle = (id: unknown) => {
    const e = library?.exercises.find((x) => x.id === id);
    return e ? localized(e, 'title', language) : String(id ?? '');
  };
  const templateTitle = (id: unknown) => {
    const tpl = templates.find((x) => x.id === id);
    return tpl ? localized(tpl, 'title', language) : String(id ?? '');
  };
  const label = (() => {
    switch (action.type) {
      case 'adapt_today':
        return params.minutes
          ? t('coach.actions.adapt_today', { minutes: params.minutes })
          : t('coach.actions.adapt_today_default');
      case 'swap_exercise':
        return t('coach.actions.swap_exercise', { title: exerciseTitle(params.exercise_id) });
      case 'save_exercise_result':
        return t('coach.actions.save_exercise_result', {
          title: exerciseTitle(params.exercise_id),
          status: t(`coach.status.${String(params.status)}` as 'coach.status.done'),
        });
      case 'add_habit':
        return t('coach.actions.add_habit', { title: templateTitle(params.template_id) });
      case 'update_goal_progress':
        return t('coach.actions.update_goal_progress', { value: params.value });
      default:
        return action.type;
    }
  })();
  const expired = action.status === 'pending' && new Date(action.expires_at) <= new Date();

  const refresh = async () => {
    for (const key of ['plan', 'userHabits', 'allHabits', 'goal', 'habitLogs', 'doneDays']) {
      void queryClient.invalidateQueries({ queryKey: [key, userId] });
    }
    await queryClient.invalidateQueries({ queryKey: coachKeys.thread(action.thread_id) });
  };

  const apply = async () => {
    setBusy('apply');
    setError(null);
    const { error: e } = await supabase.rpc('confirm_assistant_action', { p_action_id: action.id });
    setBusy(null);
    if (e) {
      const known = (KNOWN_ERRORS as readonly string[]).includes(e.message);
      setError(
        known
          ? t(`coach.errors.${e.message}` as 'coach.errors.plan_touched')
          : t('common.errorGeneric'),
      );
    }
    await refresh();
  };
  const cancel = async () => {
    setBusy('cancel');
    const { error: e } = await supabase.rpc('cancel_assistant_action', { p_action_id: action.id });
    setBusy(null);
    if (e) setError(t('common.errorGeneric'));
    await refresh();
  };

  return (
    <Card>
      <View style={[styles.badge, { backgroundColor: colors.primarySoft }]}>
        <AppText variant="caption" tone="link">
          {t('coach.actionTitle')}
        </AppText>
      </View>
      <AppText variant="bodyStrong">{label}</AppText>
      {action.status === 'applied' ? (
        <AppText variant="caption" tone="link">
          {t('coach.applied')}
        </AppText>
      ) : action.status === 'cancelled' ? (
        <AppText variant="caption" tone="secondary">
          {t('coach.cancelled')}
        </AppText>
      ) : expired ? (
        <AppText variant="caption" tone="secondary">
          {t('coach.expired')}
        </AppText>
      ) : (
        <>
          <AppText variant="caption" tone="secondary">
            {t('coach.confirmHint')}
          </AppText>
          <View style={styles.actions}>
            <Button
              label={t('coach.apply')}
              accessibilityLabel={t('coach.applyFor', { label })}
              onPress={() => void apply()}
              loading={busy === 'apply'}
              style={styles.flex}
            />
            <Button
              label={t('coach.cancel')}
              accessibilityLabel={t('coach.cancelFor', { label })}
              variant="secondary"
              onPress={() => void cancel()}
              loading={busy === 'cancel'}
              style={styles.flex}
            />
          </View>
        </>
      )}
      {error ? <AppText tone="danger">{error}</AppText> : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: 8,
  },
  actions: { flexDirection: 'row', gap: spacing.sm },
  flex: { flex: 1 },
});
