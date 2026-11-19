import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet } from 'react-native';

import { setLanguage } from '@/i18n';
import { resolveLanguage } from '@/i18n/language';
import { radius, spacing, useTheme } from '@/theme';

import { AppText } from './ui';

// Shows the current language (FR / EN) and switches to the other one
export function LanguageToggle() {
  const { t, i18n } = useTranslation();
  const { colors } = useTheme();
  const current = resolveLanguage(i18n.language);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t('common.switchLanguage')}
      hitSlop={8}
      onPress={() => void setLanguage(current === 'fr' ? 'en' : 'fr')}
      style={[styles.toggle, { borderColor: colors.border }]}
    >
      <AppText variant="caption">{current.toUpperCase()}</AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  toggle: {
    minWidth: 44,
    minHeight: 32,
    borderWidth: 1,
    borderRadius: radius.badge,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
  },
});
