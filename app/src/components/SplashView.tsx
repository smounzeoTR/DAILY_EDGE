import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { spacing, useTheme } from '@/theme';

import { Logo } from './Logo';
import { AppText, Button } from './ui';

// Brand splash shown while the session and profile load (same blue as the native splash)
export function SplashView({ onRetry }: { onRetry?: () => void }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  return (
    <View style={[styles.root, { backgroundColor: colors.splash }]}>
      <Logo size={72} onBlue />
      <AppText tone="onPrimary">{t('app.signature')}</AppText>
      {onRetry ? (
        <View style={styles.retry}>
          <AppText tone="onPrimary" style={styles.center}>
            {t('common.errorGeneric')}
          </AppText>
          <Button label={t('common.retry')} variant="secondary" onPress={onRetry} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.lg },
  retry: { marginTop: spacing.xxl, gap: spacing.md, paddingHorizontal: spacing.xl },
  center: { textAlign: 'center' },
});
