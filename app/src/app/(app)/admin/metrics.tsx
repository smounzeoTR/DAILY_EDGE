// Beta metrics (specification § 9) over a period, each compared to its target.
import { useQuery } from '@tanstack/react-query';
import { Redirect, router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { SplashView } from '@/components/SplashView';
import { AppText, Button, Card, Chip, Screen } from '@/components/ui';
import { betaMetrics } from '@/features/admin/api';
import { formatMetric, metricRows, type MetricRow } from '@/features/admin/metrics';
import { localToday } from '@/features/today/day';
import { addDays } from '@shared/habits/schedule.ts';
import { spacing } from '@/theme';

const PERIODS = [7, 30, 90] as const;

export default function AdminMetrics() {
  const { t, i18n } = useTranslation();
  const [days, setDays] = useState<(typeof PERIODS)[number]>(30);
  const today = localToday('Europe/Paris', new Date());
  const from = addDays(today, -(days - 1));
  const metrics = useQuery({
    queryKey: ['admin', 'metrics', days],
    queryFn: () => betaMetrics(from, today),
    retry: false,
  });
  if (metrics.error) return <Redirect href="/admin" />;
  if (!metrics.data) return <SplashView />;
  const rows = metricRows(metrics.data);
  const targetText = (r: MetricRow) =>
    t(r.direction === 'min' ? 'admin.metrics.targetMin' : 'admin.metrics.targetMax', {
      target: formatMetric({ key: r.key, value: r.target }, i18n.language),
    });

  return (
    <Screen
      scroll
      footer={<Button label={t('common.back')} variant="ghost" onPress={() => router.back()} />}
    >
      <View style={styles.top}>
        <AppText variant="title" accessibilityRole="header">
          {t('admin.metrics.title')}
        </AppText>
        <AppText tone="secondary">{t('admin.metrics.intro')}</AppText>
      </View>
      <View style={styles.chips}>
        {PERIODS.map((p) => (
          <Chip
            key={p}
            label={t('admin.lastDays', { count: p })}
            selected={days === p}
            onPress={() => setDays(p)}
          />
        ))}
      </View>
      {rows.map((r) => (
        <Card key={r.key}>
          <View style={styles.line}>
            <AppText variant="bodyStrong" style={styles.flex}>
              {t(`admin.metrics.${r.key}`)}
            </AppText>
            <AppText variant="bodyStrong" tone={r.status === 'below' ? 'danger' : 'primary'}>
              {formatMetric(r, i18n.language)}
            </AppText>
          </View>
          <AppText variant="caption" tone="secondary">
            {targetText(r)} · {t('admin.metrics.sample', { count: r.sample })}
            {r.status === 'none' ? ` · ${t('admin.metrics.noData')}` : ''}
          </AppText>
        </Card>
      ))}
      <AppText variant="caption" tone="secondary">
        {t('admin.metrics.definitions')}
      </AppText>
    </Screen>
  );
}

const styles = StyleSheet.create({
  top: { paddingTop: spacing.lg, gap: spacing.xs },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  line: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  flex: { flex: 1 },
});
