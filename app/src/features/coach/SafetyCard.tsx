// Help card shown by the server's safety net (distress words), whatever the model answers.
import { useTranslation } from 'react-i18next';
import { Linking } from 'react-native';

import { AppText, Button, Card } from '@/components/ui';

export function SafetyCard() {
  const { t } = useTranslation();
  return (
    <Card>
      <AppText variant="bodyStrong" accessibilityRole="header">
        {t('coach.safety.title')}
      </AppText>
      <AppText tone="body">{t('coach.safety.body')}</AppText>
      <Button
        label={t('coach.safety.call')}
        accessibilityLabel={t('coach.safety.callLabel')}
        onPress={() => void Linking.openURL('tel:3114')}
      />
      <AppText variant="caption" tone="secondary">
        {t('coach.safety.emergency')}
      </AppText>
    </Card>
  );
}
