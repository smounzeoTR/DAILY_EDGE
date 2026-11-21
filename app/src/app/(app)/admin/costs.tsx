// AI cost per day (read only): calls, reuses, fallbacks, refusals over the cap, tokens, cost.
import { useQuery } from '@tanstack/react-query';
import { Redirect, router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { SplashView } from '@/components/SplashView';
import { AppText, Button, Card, Chip, Screen } from '@/components/ui';
import { aiCostDaily } from '@/features/admin/api';
import { spacing } from '@/theme';

const PERIODS = [7, 30, 90] as const;

export default function AdminAiCost() {
  const { t } = useTranslation();
  const [days, setDays] = useState<(typeof PERIODS)[number]>(30);
  const costs = useQuery({
    queryKey: ['admin', 'aiCost', days],
    queryFn: () => aiCostDaily(days),
    retry: false,
  });
  if (costs.error) return <Redirect href="/admin" />;
  if (!costs.data) return <SplashView />;
  const total = costs.data.reduce((sum, r) => sum + Number(r.cost_eur), 0);

  return (
    <Screen
      scroll
      footer={<Button label={t('common.back')} variant="ghost" onPress={() => router.back()} />}
    >
      <View style={styles.top}>
        <AppText variant="title" accessibilityRole="header">
          {t('admin.aiCost')}
        </AppText>
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
      <Card>
        <AppText variant="bodyStrong">{t('admin.totalCost', { cost: total.toFixed(4) })}</AppText>
      </Card>
      {costs.data.length === 0 ? <AppText tone="secondary">{t('admin.noCall')}</AppText> : null}
      {costs.data.map((r) => (
        <Card key={`${r.day}-${r.feature}`}>
          <AppText variant="bodyStrong">
            {r.day} · {t(`admin.features.${r.feature}`)}
          </AppText>
          <AppText variant="caption" tone="secondary">
            {t('admin.costLine', {
              calls: r.calls,
              cache: r.cache_hits,
              fallbacks: r.fallbacks,
              quota: r.quota_refusals,
              tokens: Number(r.input_tokens) + Number(r.output_tokens),
              cost: Number(r.cost_eur).toFixed(4),
              latency: r.avg_latency_ms ?? '—',
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
