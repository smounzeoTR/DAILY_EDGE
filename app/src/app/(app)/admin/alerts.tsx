// Operations alerts (fallback batch, daily AI cost), newest first.
import { useQuery } from '@tanstack/react-query';
import { Redirect, router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { SplashView } from '@/components/SplashView';
import { AppText, Button, Card, Screen } from '@/components/ui';
import { opsAlerts } from '@/features/admin/api';
import { spacing } from '@/theme';

const KINDS = ['batch_missing', 'batch_failed', 'ai_cost'] as const;

export default function AdminAlerts() {
  const { t } = useTranslation();
  const list = useQuery({ queryKey: ['admin', 'alerts'], queryFn: opsAlerts, retry: false });
  if (list.error) return <Redirect href="/admin" />;
  if (!list.data) return <SplashView />;
  return (
    <Screen
      scroll
      footer={<Button label={t('common.back')} variant="ghost" onPress={() => router.back()} />}
    >
      <View style={styles.top}>
        <AppText variant="title" accessibilityRole="header">
          {t('admin.alerts.title')}
        </AppText>
        <AppText tone="secondary">{t('admin.alerts.intro')}</AppText>
      </View>
      {list.data.length === 0 ? <AppText tone="secondary">{t('admin.alerts.none')}</AppText> : null}
      {list.data.map((a) => (
        <Card key={a.id}>
          <AppText variant="bodyStrong">
            {a.day} ·{' '}
            {(KINDS as readonly string[]).includes(a.kind)
              ? t(`admin.alerts.kinds.${a.kind as (typeof KINDS)[number]}`)
              : a.kind}
          </AppText>
          <AppText variant="caption" tone="secondary">
            {JSON.stringify(a.detail)}
          </AppText>
          <AppText variant="caption" tone="secondary">
            {a.notified_at ? t('admin.alerts.notified') : t('admin.alerts.pending')}
          </AppText>
        </Card>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({ top: { paddingTop: spacing.lg, gap: spacing.xs } });
