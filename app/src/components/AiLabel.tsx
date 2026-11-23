// AI transparency (AI Act, art. 50): a sparkle icon with "Rédigé par l'IA", and the notice shown
// at the top of every Coach Edge conversation.
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { AppText } from '@/components/ui';
import { radius, spacing, useTheme } from '@/theme';

function Sparkle({ size = 14 }: { size?: number }) {
  const { colors } = useTheme();
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" accessibilityElementsHidden>
      <Path d="M12 2 L14 9 L21 12 L14 15 L12 22 L10 15 L3 12 L10 9 Z" fill={colors.primary} />
    </Svg>
  );
}

export function AiWrittenLabel() {
  const { t } = useTranslation();
  return (
    <View style={styles.label} accessible accessibilityLabel={t('ai.written')}>
      <Sparkle />
      <AppText variant="caption" tone="secondary">
        {t('ai.written')}
      </AppText>
    </View>
  );
}

export function AiNotice() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  return (
    <View
      style={[styles.notice, { borderColor: colors.border, backgroundColor: colors.primarySoft }]}
      accessible
      accessibilityLabel={`${t('ai.coachIsAi')} ${t('ai.coachMayErr')}`}
    >
      <Sparkle size={18} />
      <View style={styles.flex}>
        <AppText variant="bodyStrong">{t('ai.coachIsAi')}</AppText>
        <AppText variant="caption" tone="secondary">
          {t('ai.coachMayErr')}
        </AppText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  label: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  notice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.badge,
    borderWidth: 1,
  },
  flex: { flex: 1, gap: 2 },
});
