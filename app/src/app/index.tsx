import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Logo } from '@/components/Logo';
import { spacing, typography, useTheme } from '@/theme';

// Temporary home screen for lot 0 (logo + translated text)
export default function Index() {
  const { t } = useTranslation();
  const { colors } = useTheme();

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <View style={styles.content}>
        <Logo size={72} />
        <Text style={[typography.subtitle, styles.center, { color: colors.text }]}>
          {t('app.tagline')}
        </Text>
        <Text style={[typography.body, styles.center, { color: colors.textSecondary }]}>
          {t('app.signature')}
        </Text>
        <Text style={[typography.caption, styles.center, { color: colors.textSecondary }]}>
          {t('home.comingSoon')}
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.lg,
    paddingHorizontal: spacing.xl,
  },
  center: { textAlign: 'center' },
});
