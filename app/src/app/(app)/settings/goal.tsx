// Goal settings: edit the active goal, mark it as achieved, define a new one.
import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { DateField } from '@/components/DateTimeField';
import { SplashView } from '@/components/SplashView';
import { AppText, Button, Screen, TextField } from '@/components/ui';
import { isFutureDate, localDateString, parseTargetValue } from '@/features/onboarding/rules';
import { useUserId } from '@/lib/auth/AuthProvider';
import { useActiveGoal } from '@/lib/queries';
import { supabase } from '@/lib/supabase';
import { spacing } from '@/theme';

type Form = { title: string; target: string; unit: string; deadline: string | null; why: string };

export default function GoalSettings() {
  const { t } = useTranslation();
  const userId = useUserId();
  const queryClient = useQueryClient();
  const goal = useActiveGoal(userId);
  const [mode, setMode] = useState<'edit' | 'new' | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  if (goal.isPending) return <SplashView />;
  const current = goal.data;
  const effectiveMode = mode ?? (current ? 'edit' : 'new');
  const values: Form =
    form ??
    (effectiveMode === 'edit' && current
      ? {
          title: current.title,
          target: current.target_value?.toString() ?? '',
          unit: current.unit ?? '',
          deadline: current.deadline,
          why: '',
        }
      : { title: '', target: '', unit: '', deadline: null, why: '' });
  const update = (patch: Partial<Form>) => setForm({ ...values, ...patch });
  const today = localDateString(new Date());
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const target = parseTargetValue(values.target);
  const valid =
    values.title.trim().length > 0 &&
    target !== 'invalid' &&
    (values.deadline === null || isFutureDate(values.deadline, today));

  const done = async () => {
    await queryClient.invalidateQueries({ queryKey: ['goal', userId] });
    router.back();
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    const fields = {
      title: values.title.trim(),
      target_value: typeof target === 'number' ? target : null,
      unit: values.unit.trim() || null,
      deadline: values.deadline,
    };
    const { error: saveError } =
      effectiveMode === 'edit' && current
        ? await supabase.from('goals').update(fields).eq('id', current.id)
        : await supabase.rpc('replace_active_goal', {
            p_title: fields.title,
            p_target_value: fields.target_value ?? undefined,
            p_unit: fields.unit ?? undefined,
            p_deadline: fields.deadline ?? undefined,
            p_why: values.why.trim() || undefined,
          });
    setSaving(false);
    if (saveError) {
      // The database refuses a deadline that is not in the future
      setError(
        saveError.message === 'invalid_goal_deadline'
          ? t('onboarding.errors.invalid_goal_deadline')
          : t('common.errorGeneric'),
      );
      return;
    }
    await done();
  };

  const achieved = async () => {
    if (!current) return;
    const { error: saveError } = await supabase
      .from('goals')
      .update({ status: 'achieved' })
      .eq('id', current.id);
    if (saveError) setError(t('common.errorGeneric'));
    else {
      await queryClient.invalidateQueries({ queryKey: ['goal', userId] });
      setMode('new');
      setForm(null);
    }
  };

  return (
    <Screen
      scroll
      footer={
        <>
          {error ? <AppText tone="danger">{error}</AppText> : null}
          <Button
            label={t('settings.save')}
            onPress={() => void save()}
            disabled={!valid}
            loading={saving}
          />
          <Button label={t('common.back')} variant="ghost" onPress={() => router.back()} />
        </>
      }
    >
      <View style={styles.top}>
        <AppText variant="title" accessibilityRole="header">
          {effectiveMode === 'edit' ? t('settings.goalEdit') : t('settings.goalNew')}
        </AppText>
      </View>
      <TextField
        label={t('onboarding.q.goalTitle')}
        value={values.title}
        onChangeText={(title) => update({ title })}
        maxLength={200}
      />
      <TextField
        label={t('onboarding.q.valuePlaceholder')}
        value={values.target}
        onChangeText={(v) => update({ target: v })}
        keyboardType="decimal-pad"
      />
      <TextField
        label={t('onboarding.q.unitPlaceholder')}
        value={values.unit}
        onChangeText={(unit) => update({ unit })}
        maxLength={40}
      />
      <AppText variant="caption" tone="secondary">
        {t('onboarding.q.goalDeadline')}
      </AppText>
      <DateField
        value={values.deadline}
        onChange={(deadline) => update({ deadline })}
        minimumDate={tomorrow}
        placeholder={t('onboarding.q.pickDate')}
      />
      {values.deadline !== null && !isFutureDate(values.deadline, today) ? (
        <AppText tone="danger">{t('onboarding.q.deadlineInFuture')}</AppText>
      ) : null}
      {effectiveMode === 'new' ? (
        <TextField
          label={t('onboarding.q.goalWhy')}
          value={values.why}
          onChangeText={(why) => update({ why })}
          multiline
          maxLength={500}
        />
      ) : null}
      {effectiveMode === 'edit' && current ? (
        <View style={styles.actions}>
          <Button
            label={t('settings.goalAchieved')}
            variant="secondary"
            onPress={() => void achieved()}
          />
          <Button
            label={t('settings.goalNew')}
            variant="ghost"
            onPress={() => {
              setMode('new');
              setForm(null);
            }}
          />
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  top: { paddingTop: spacing.lg },
  actions: { gap: spacing.sm },
});
