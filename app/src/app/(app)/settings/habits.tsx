// Habit settings: activate or deactivate (6 active at most), edit the cue, add from templates.
import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Switch, View } from 'react-native';

import { SplashView } from '@/components/SplashView';
import { AppText, Button, Card, Screen, TextField } from '@/components/ui';
import { resolveLanguage } from '@/i18n/language';
import { habitText, localized } from '@/i18n/localize';
import { useUserId } from '@/lib/auth/AuthProvider';
import { queryKeys, useAllHabits, useHabitTemplates } from '@/lib/queries';
import { supabase } from '@/lib/supabase';
import { spacing, useTheme } from '@/theme';

const MAX_ACTIVE = 6;

export default function HabitSettings() {
  const { t, i18n } = useTranslation();
  const language = resolveLanguage(i18n.language);
  const { colors } = useTheme();
  const userId = useUserId();
  const queryClient = useQueryClient();
  const habits = useAllHabits(userId);
  const templates = useHabitTemplates();
  const [adding, setAdding] = useState(false);
  const [cues, setCues] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  if (!habits.data || !templates.data) return <SplashView />;
  const active = habits.data.filter((h) => h.active).length;
  const activeTemplates = new Set(habits.data.filter((h) => h.active).map((h) => h.template_id));

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ['allHabits', userId] });
    await queryClient.invalidateQueries({ queryKey: queryKeys.userHabits(userId) });
  };
  const fail = (message?: string) =>
    setError(
      message === 'too_many_habits' ? t('settings.tooManyHabits') : t('common.errorGeneric'),
    );

  const setActive = async (id: string, value: boolean) => {
    setError(null);
    const { error: e } = await supabase.from('user_habits').update({ active: value }).eq('id', id);
    if (e) fail(e.message);
    await refresh();
  };

  const saveCue = async (id: string, defaultCue: string) => {
    const value = cues[id];
    if (value === undefined) return;
    const trimmed = value.trim();
    // Only a changed cue is stored (the template text is shown otherwise)
    const cue = trimmed === '' || trimmed === defaultCue ? null : trimmed;
    const { error: e } = await supabase.from('user_habits').update({ cue }).eq('id', id);
    if (e) fail(e.message);
    await refresh();
  };

  const add = async (templateId: string) => {
    setError(null);
    const { error: e } = await supabase.rpc('add_habit_from_template', {
      p_template_id: templateId,
    });
    if (e) fail(e.message);
    else setAdding(false);
    await refresh();
  };

  return (
    <Screen
      scroll
      footer={<Button label={t('common.back')} variant="ghost" onPress={() => router.back()} />}
    >
      <View style={styles.top}>
        <AppText variant="title" accessibilityRole="header">
          {t('settings.habitsTitle')}
        </AppText>
        <AppText tone="secondary">
          {t('settings.habitsCount', { count: active, max: MAX_ACTIVE })}
        </AppText>
      </View>
      {error ? <AppText tone="danger">{error}</AppText> : null}

      {habits.data.map((habit) => {
        const title = habitText(habit.title, habit.template, 'title', language);
        const defaultCue = habit.template ? localized(habit.template, 'default_cue', language) : '';
        return (
          <Card key={habit.id}>
            <Pressable
              accessibilityRole="switch"
              accessibilityState={{ checked: habit.active }}
              accessibilityLabel={t('settings.habitActive', { title })}
              onPress={() => void setActive(habit.id, !habit.active)}
              style={styles.head}
            >
              <View style={styles.flex}>
                <AppText variant="bodyStrong">{title}</AppText>
                {habit.simplified ? (
                  <AppText variant="caption" tone="link">
                    {t('settings.habitSimplified')}
                  </AppText>
                ) : null}
              </View>
              <Switch
                value={habit.active}
                onValueChange={(v) => void setActive(habit.id, v)}
                trackColor={{ true: colors.primary, false: colors.border }}
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
              />
            </Pressable>
            {habit.active ? (
              <TextField
                label={t('onboarding.habits.cue')}
                value={cues[habit.id] ?? habit.cue ?? defaultCue}
                onChangeText={(v) => setCues({ ...cues, [habit.id]: v })}
                onEndEditing={() => void saveCue(habit.id, defaultCue)}
                maxLength={120}
              />
            ) : null}
          </Card>
        );
      })}

      {adding ? (
        <View style={styles.list}>
          <AppText variant="subtitle">{t('settings.addHabitTitle')}</AppText>
          {templates.data
            .filter((tpl) => !activeTemplates.has(tpl.id))
            .map((tpl) => (
              <Pressable
                key={tpl.id}
                accessibilityRole="button"
                accessibilityLabel={t('settings.addHabitFor', {
                  title: localized(tpl, 'title', language),
                })}
                onPress={() => void add(tpl.id)}
              >
                <Card>
                  <AppText variant="bodyStrong">{localized(tpl, 'title', language)}</AppText>
                  <AppText variant="caption" tone="secondary">
                    {localized(tpl, 'description', language)}
                  </AppText>
                </Card>
              </Pressable>
            ))}
        </View>
      ) : (
        <Button
          label={t('settings.addHabit')}
          variant="secondary"
          onPress={() => setAdding(true)}
          disabled={active >= MAX_ACTIVE}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  top: { paddingTop: spacing.lg, gap: spacing.xs },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  flex: { flex: 1, gap: 2 },
  list: { gap: spacing.sm },
});
