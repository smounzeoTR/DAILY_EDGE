// Evening check-in (today, user time zone). Editable the same evening; every save
// regenerates tomorrow's plan and shows it.
import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { KeyboardAvoidingView, Platform, StyleSheet, View } from 'react-native';

import { SplashView } from '@/components/SplashView';
import { AppText, Button, Card, Chip, Screen, TextField } from '@/components/ui';
import { addDays } from '@/features/habits/schedule';
import { localToday } from '@/features/today/day';
import { resolveLanguage } from '@/i18n/language';
import { localized } from '@/i18n/localize';
import { useUserId } from '@/lib/auth/AuthProvider';
import { exerciseTitles, generatePlan, queryKeys, useCheckin, useProfile } from '@/lib/queries';
import { supabase } from '@/lib/supabase';
import { spacing } from '@/theme';

const SCALE = [1, 2, 3, 4, 5] as const;
const MINUTES = [5, 15, 30] as const;

type Tomorrow = { titles: string[]; short: boolean };

function Scale({
  label,
  value,
  onChange,
  itemLabel,
}: {
  label: string;
  value: number | null;
  onChange: (n: number) => void;
  itemLabel: (n: number) => string;
}) {
  return (
    <View style={styles.block}>
      <AppText variant="bodyStrong">{label}</AppText>
      <View style={styles.chips}>
        {SCALE.map((n) => (
          <View key={n} accessible accessibilityLabel={itemLabel(n)}>
            <Chip label={String(n)} selected={value === n} onPress={() => onChange(n)} />
          </View>
        ))}
      </View>
    </View>
  );
}

export default function Checkin() {
  const { t, i18n } = useTranslation();
  const language = resolveLanguage(i18n.language);
  const userId = useUserId();
  const queryClient = useQueryClient();
  const profile = useProfile(userId).data;
  const timezone = profile?.timezone ?? 'Europe/Paris';
  const today = localToday(timezone, new Date());
  const existing = useCheckin(userId, today);

  const [form, setForm] = useState<{
    energy: number | null;
    mood: number | null;
    minutes: number | null;
    reflection: string;
    note: string;
  } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tomorrow, setTomorrow] = useState<Tomorrow | null>(null);

  if (!profile || existing.isPending) return <SplashView />;

  // Prefill from today's check-in once loaded
  const values = form ?? {
    energy: existing.data?.energy ?? null,
    mood: existing.data?.mood ?? null,
    minutes: existing.data?.minutes_tomorrow ?? null,
    reflection: existing.data?.reflection ?? '',
    note: existing.data?.note ?? '',
  };
  const update = (patch: Partial<typeof values>) => setForm({ ...values, ...patch });
  const consent = profile.consent_checkin;
  const complete =
    values.minutes !== null && (!consent || (values.energy !== null && values.mood !== null));

  const submit = async () => {
    if (!complete || values.minutes === null) return;
    setSaving(true);
    setError(null);
    const { error: rpcError } = await supabase.rpc('upsert_checkin', {
      p_minutes_tomorrow: values.minutes,
      p_reflection: values.reflection,
      p_note: values.note,
      // Energy and mood only with consent (also enforced server side)
      p_energy: consent ? (values.energy ?? undefined) : undefined,
      p_mood: consent ? (values.mood ?? undefined) : undefined,
    });
    if (rpcError) {
      setSaving(false);
      setError(t('common.errorGeneric'));
      return;
    }
    await queryClient.invalidateQueries({ queryKey: queryKeys.checkin(userId, today) });
    try {
      const generated = await generatePlan(addDays(today, 1));
      const ids = generated.plan.plan_items.map((i) => i.exercise_id);
      const rows = (ids.length > 0 ? await exerciseTitles(ids) : []) ?? [];
      setTomorrow({
        titles: ids.map((id) => {
          const row = rows.find((r) => r.id === id);
          return row ? localized(row, 'title', language) : id;
        }),
        short: generated.plan.mode !== 'normal',
      });
    } catch {
      setTomorrow({ titles: [], short: false });
    }
    setSaving(false);
  };

  if (tomorrow) {
    return (
      <Screen
        scroll
        footer={
          <>
            <Button label={t('checkin.backToday')} onPress={() => router.back()} />
            <Button label={t('checkin.edit')} variant="ghost" onPress={() => setTomorrow(null)} />
          </>
        }
      >
        <View style={styles.top}>
          <AppText variant="title" accessibilityRole="header">
            {t('checkin.savedTitle')}
          </AppText>
          <AppText tone="secondary">{t('checkin.savedBody')}</AppText>
        </View>
        <Card>
          <AppText variant="caption" tone="link">
            {t('checkin.tomorrow')}
          </AppText>
          {tomorrow.titles.length > 0 ? (
            tomorrow.titles.map((title) => (
              <AppText key={title} variant="subtitle">
                {t('checkin.tomorrowExercise', { title })}
              </AppText>
            ))
          ) : (
            <AppText tone="secondary">{t('checkin.tomorrowLater')}</AppText>
          )}
          {tomorrow.short ? (
            <AppText variant="bodyStrong" tone="link">
              {t('checkin.shortVersion')}
            </AppText>
          ) : null}
        </Card>
      </Screen>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Screen
        scroll
        footer={
          <>
            {error ? <AppText tone="danger">{error}</AppText> : null}
            <Button
              label={t('checkin.save')}
              onPress={() => void submit()}
              disabled={!complete}
              loading={saving}
            />
            <Button label={t('common.back')} variant="ghost" onPress={() => router.back()} />
          </>
        }
      >
        <View style={styles.top}>
          <AppText variant="title" accessibilityRole="header">
            {t('checkin.title')}
          </AppText>
          <AppText tone="secondary">{t('checkin.subtitle')}</AppText>
        </View>
        {consent ? (
          <>
            <Scale
              label={t('checkin.energy')}
              value={values.energy}
              onChange={(energy) => update({ energy })}
              itemLabel={(n) => t('checkin.energyValue', { n })}
            />
            <Scale
              label={t('checkin.mood')}
              value={values.mood}
              onChange={(mood) => update({ mood })}
              itemLabel={(n) => t('checkin.moodValue', { n })}
            />
          </>
        ) : null}
        <View style={styles.block}>
          <AppText variant="bodyStrong">{t('checkin.minutes')}</AppText>
          <View style={styles.chips}>
            {MINUTES.map((m) => (
              <Chip
                key={m}
                label={t('checkin.minutesValue', { m })}
                selected={values.minutes === m}
                onPress={() => update({ minutes: m })}
              />
            ))}
          </View>
        </View>
        <TextField
          label={t('checkin.reflection')}
          value={values.reflection}
          onChangeText={(reflection) => update({ reflection })}
          placeholder={t('checkin.reflectionPlaceholder')}
          multiline
          maxLength={1000}
        />
        <TextField
          label={t('checkin.note')}
          value={values.note}
          onChangeText={(note) => update({ note })}
          multiline
          maxLength={1000}
        />
      </Screen>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  top: { paddingTop: spacing.lg, gap: spacing.xs },
  block: { gap: spacing.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
});
