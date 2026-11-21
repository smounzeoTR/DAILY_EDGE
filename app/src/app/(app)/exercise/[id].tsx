// Exercise sheet: instructions, duration, energy, difficulty, linked principles and sources,
// favorite, "Add to my day" (add_exercise_to_today then generate-plan).
import { useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { SplashView } from '@/components/SplashView';
import { AppText, Button, Card, Screen } from '@/components/ui';
import { FavoriteButton } from '@/features/library/favorites';
import { NoteCard } from '@/features/notes/NoteCard';
import { resolveLanguage } from '@/i18n/language';
import { localized } from '@/i18n/localize';
import { useUserId } from '@/lib/auth/AuthProvider';
import { generatePlan, useLibrary } from '@/lib/queries';
import { supabase } from '@/lib/supabase';
import { spacing, useTheme } from '@/theme';

const ADD_ERRORS: Record<
  string,
  'library.errors.alreadyInPlan' | 'library.errors.dailyLimit' | 'library.errors.invalid'
> = {
  already_in_plan: 'library.errors.alreadyInPlan',
  daily_limit: 'library.errors.dailyLimit',
  invalid_exercise: 'library.errors.invalid',
};

function Dots({ value, label }: { value: number; label: string }) {
  const { colors } = useTheme();
  return (
    <View style={styles.dots} accessible accessibilityLabel={label}>
      {[1, 2, 3, 4, 5].map((n) => (
        <View
          key={n}
          style={[styles.dot, { backgroundColor: n <= value ? colors.primary : colors.border }]}
        />
      ))}
    </View>
  );
}

export default function ExerciseSheet() {
  const { t, i18n } = useTranslation();
  const language = resolveLanguage(i18n.language);
  const { id } = useLocalSearchParams<{ id: string }>();
  const userId = useUserId();
  const queryClient = useQueryClient();
  const library = useLibrary();
  const [adding, setAdding] = useState(false);
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);

  if (!library.data) return <SplashView />;
  const exercise = library.data.exercises.find((e) => e.id === id);
  if (!exercise) {
    return (
      <Screen
        footer={<Button label={t('common.back')} variant="ghost" onPress={() => router.back()} />}
      >
        <AppText tone="secondary">{t('library.notFound')}</AppText>
      </Screen>
    );
  }
  const title = localized(exercise, 'title', language);
  const principles = exercise.principleIds
    .map((pid) => library.data.principles.find((p) => p.id === pid))
    .filter((p): p is NonNullable<typeof p> => Boolean(p));
  const sources = exercise.sourceIds
    .map((sid) => library.data.sources.find((s) => s.id === sid))
    .filter((s): s is NonNullable<typeof s> => Boolean(s));

  const add = async () => {
    setAdding(true);
    setMessage(null);
    const { error } = await supabase.rpc('add_exercise_to_today', { p_exercise_id: exercise.id });
    if (error) {
      const key = ADD_ERRORS[error.message];
      setMessage({ text: key ? t(key) : t('common.errorGeneric'), ok: false });
      setAdding(false);
      return;
    }
    // Completes an empty plan if needed (the engine keeps the addition)
    await generatePlan().catch(() => undefined);
    await queryClient.invalidateQueries({ queryKey: ['plan', userId] });
    setMessage({ text: t('library.added'), ok: true });
    setAdding(false);
  };

  return (
    <Screen
      scroll
      footer={
        <>
          {message ? <AppText tone={message.ok ? 'link' : 'danger'}>{message.text}</AppText> : null}
          <Button label={t('library.addToDay')} onPress={() => void add()} loading={adding} />
          <Button label={t('common.back')} variant="ghost" onPress={() => router.back()} />
        </>
      }
    >
      <View style={styles.head}>
        <View style={styles.flex}>
          <AppText variant="caption" tone="link">
            {t(`domains.${exercise.domain}`)}
          </AppText>
          <AppText variant="title" accessibilityRole="header">
            {title}
          </AppText>
        </View>
        <FavoriteButton type="exercise" id={exercise.id} title={title} />
      </View>
      <AppText tone="body">{localized(exercise, 'instructions', language)}</AppText>

      <Card>
        <View style={styles.meta}>
          <AppText tone="secondary">{t('library.durationLabel')}</AppText>
          <AppText variant="bodyStrong">
            {t('today.duration', { min: exercise.duration_min })}
          </AppText>
        </View>
        <View style={styles.meta}>
          <AppText tone="secondary">{t('library.energyLabel')}</AppText>
          <AppText variant="bodyStrong">{t(`library.energy.${exercise.energy}`)}</AppText>
        </View>
        <View style={styles.meta}>
          <AppText tone="secondary">{t('library.difficultyLabel')}</AppText>
          <Dots
            value={exercise.difficulty}
            label={t('library.difficulty', { n: exercise.difficulty })}
          />
        </View>
      </Card>

      {principles.length > 0 ? (
        <Card>
          <AppText variant="bodyStrong">{t('library.linkedPrinciples')}</AppText>
          {principles.map((p) => (
            <Pressable
              key={p.id}
              accessibilityRole="link"
              onPress={() => router.push({ pathname: '/principle/[id]', params: { id: p.id } })}
            >
              <AppText tone="link" variant="bodyStrong">
                {localized(p, 'title', language)}
              </AppText>
            </Pressable>
          ))}
        </Card>
      ) : null}

      {sources.length > 0 ? (
        <Card>
          <AppText variant="bodyStrong">{t('library.sources')}</AppText>
          {sources.map((s) => (
            <AppText key={s.id} tone="body">
              {s.author} — {language === 'fr' ? s.title_fr : s.title_original}
            </AppText>
          ))}
        </Card>
      ) : null}
      <NoteCard entityType="exercise" entityId={exercise.id} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, paddingTop: spacing.lg },
  flex: { flex: 1, gap: spacing.xs },
  meta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  dots: { flexDirection: 'row', gap: 4 },
  dot: { width: 10, height: 10, borderRadius: 5 },
});
