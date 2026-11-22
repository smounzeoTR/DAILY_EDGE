// Kind message and help resources after several low-mood days (once per episode). No diagnosis.
import { useTranslation } from 'react-i18next';
import { Linking } from 'react-native';

import { AppText, Button, Card } from '@/components/ui';

export function SupportCard({ onSeen }: { onSeen: () => void }) {
  const { t } = useTranslation();
  return (
    <Card>
      <AppText variant="bodyStrong" accessibilityRole="header">
        {t('support.title')}
      </AppText>
      <AppText tone="body">{t('support.body')}</AppText>
      <Button
        label={t('support.call')}
        accessibilityLabel={t('support.callLabel')}
        variant="secondary"
        onPress={() => void Linking.openURL('tel:3114')}
      />
      <AppText variant="caption" tone="secondary">
        {t('support.elsewhere')}
      </AppText>
      <Button label={t('support.seen')} variant="ghost" onPress={onSeen} />
    </Card>
  );
}
