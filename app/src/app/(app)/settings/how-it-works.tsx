// "Comment ça marche": the daily journey and what each part of the app is for.
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { AppText, Button, Card, Screen } from '@/components/ui';
import { spacing } from '@/theme';

const SECTIONS = [
  'principle',
  'exercise',
  'why',
  'habits',
  'checkin',
  'progress',
  'review',
  'notes',
] as const;

export default function HowItWorks() {
  const { t } = useTranslation();
  return (
    <Screen
      scroll
      footer={<Button label={t('common.back')} variant="ghost" onPress={() => router.back()} />}
    >
      <View style={styles.top}>
        <AppText variant="title" accessibilityRole="header">
          {t('guide.howItWorks.title')}
        </AppText>
        <AppText tone="secondary">{t('guide.howItWorks.intro')}</AppText>
      </View>
      {SECTIONS.map((section) => (
        <Card key={section}>
          <AppText variant="bodyStrong" accessibilityRole="header">
            {t(`guide.howItWorks.${section}.title`)}
          </AppText>
          <AppText tone="body">{t(`guide.howItWorks.${section}.body`)}</AppText>
        </Card>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  top: { paddingTop: spacing.lg, gap: spacing.xs },
});
