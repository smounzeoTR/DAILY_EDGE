// Beta feedback (read only), newest first.
import { useQuery } from '@tanstack/react-query';
import { Redirect, router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { SplashView } from '@/components/SplashView';
import { AppText, Button, Card, Screen } from '@/components/ui';
import { feedbackList } from '@/features/admin/api';
import { spacing } from '@/theme';

export default function AdminFeedback() {
  const { t, i18n } = useTranslation();
  const list = useQuery({ queryKey: ['admin', 'feedback'], queryFn: feedbackList, retry: false });
  if (list.error) return <Redirect href="/admin" />;
  if (!list.data) return <SplashView />;
  const date = (iso: string) =>
    new Date(iso).toLocaleString(i18n.language === 'en' ? 'en-GB' : 'fr-FR', {
      dateStyle: 'short',
      timeStyle: 'short',
    });
  return (
    <Screen
      scroll
      footer={<Button label={t('common.back')} variant="ghost" onPress={() => router.back()} />}
    >
      <View style={styles.top}>
        <AppText variant="title" accessibilityRole="header">
          {t('admin.feedback.title')}
        </AppText>
      </View>
      {list.data.length === 0 ? (
        <AppText tone="secondary">{t('admin.feedback.none')}</AppText>
      ) : null}
      {list.data.map((f) => (
        <Card key={f.id}>
          <AppText tone="body">{f.body}</AppText>
          <AppText variant="caption" tone="secondary">
            {t('admin.feedback.meta', {
              date: date(f.created_at),
              email: f.email ?? '—',
              version: f.app_version,
              build: f.build ?? '–',
              platform: f.platform,
              locale: f.locale,
            })}
          </AppText>
        </Card>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({ top: { paddingTop: spacing.lg } });
