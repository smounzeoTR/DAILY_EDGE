// Exercise statistics (read only): proposals, completion, rating, "too hard" and skip rates,
// over a period, filterable (search, only proposed) and sortable.
import { useQuery } from '@tanstack/react-query';
import { Redirect, router } from 'expo-router';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { SplashView } from '@/components/SplashView';
import { AppText, Button, Card, Chip, Screen, TextField } from '@/components/ui';
import { exerciseStats, type ExerciseStat } from '@/features/admin/api';
import { resolveLanguage } from '@/i18n/language';
import { spacing } from '@/theme';

const PERIODS = [7, 30, 90] as const;
type SortKey = 'proposed' | 'done_rate' | 'avg_rating' | 'too_hard_rate' | 'skip_rate';
const SORTS: SortKey[] = ['proposed', 'done_rate', 'avg_rating', 'too_hard_rate', 'skip_rate'];

const isoDaysAgo = (days: number) => {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
};
const pct = (v: number | null) => (v === null ? '—' : `${Math.round(Number(v) * 100)} %`);

export default function AdminExercises() {
  const { t, i18n } = useTranslation();
  const language = resolveLanguage(i18n.language);
  const [period, setPeriod] = useState<(typeof PERIODS)[number]>(30);
  const [sort, setSort] = useState<SortKey>('proposed');
  const [search, setSearch] = useState('');
  const [onlyProposed, setOnlyProposed] = useState(true);
  const stats = useQuery({
    queryKey: ['admin', 'exerciseStats', period],
    queryFn: () => exerciseStats(isoDaysAgo(period - 1), isoDaysAgo(0)),
    retry: false,
  });

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const value = (r: ExerciseStat) => (r[sort] === null ? -1 : Number(r[sort]));
    return (stats.data ?? [])
      .filter((r) => !onlyProposed || r.proposed > 0)
      .filter(
        (r) =>
          q === '' ||
          r.exercise_id.toLowerCase().includes(q) ||
          (language === 'en' ? r.title_en : r.title_fr).toLowerCase().includes(q),
      )
      .sort((a, b) => value(b) - value(a));
  }, [stats.data, search, onlyProposed, sort, language]);

  if (stats.error) return <Redirect href="/admin" />;
  if (!stats.data) return <SplashView />;

  return (
    <Screen
      scroll
      footer={<Button label={t('common.back')} variant="ghost" onPress={() => router.back()} />}
    >
      <View style={styles.top}>
        <AppText variant="title" accessibilityRole="header">
          {t('admin.exercises')}
        </AppText>
      </View>
      <View style={styles.chips}>
        {PERIODS.map((p) => (
          <Chip
            key={p}
            label={t('admin.lastDays', { count: p })}
            selected={period === p}
            onPress={() => setPeriod(p)}
          />
        ))}
      </View>
      <TextField
        label={t('admin.search')}
        value={search}
        onChangeText={setSearch}
        autoCapitalize="none"
      />
      <View style={styles.chips}>
        <Chip
          label={t('admin.onlyProposed')}
          selected={onlyProposed}
          onPress={() => setOnlyProposed(!onlyProposed)}
        />
      </View>
      <AppText variant="caption" tone="secondary">
        {t('admin.sortBy')}
      </AppText>
      <View style={styles.chips}>
        {SORTS.map((key) => (
          <Chip
            key={key}
            label={t(`admin.metrics.${key}`)}
            selected={sort === key}
            onPress={() => setSort(key)}
          />
        ))}
      </View>
      <AppText variant="caption" tone="secondary">
        {t('admin.count', { count: rows.length })}
      </AppText>
      {rows.map((r) => (
        <Card key={r.exercise_id}>
          <AppText variant="bodyStrong">
            {r.exercise_id} · {language === 'en' ? r.title_en : r.title_fr}
          </AppText>
          <AppText variant="caption" tone="secondary">
            {t('admin.statsLine', {
              proposed: r.proposed,
              added: r.added,
              done: pct(r.done_rate),
              rating: r.avg_rating === null ? '—' : String(r.avg_rating),
              tooHard: pct(r.too_hard_rate),
              skipped: pct(r.skip_rate),
            })}
          </AppText>
        </Card>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  top: { paddingTop: spacing.lg },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
});
