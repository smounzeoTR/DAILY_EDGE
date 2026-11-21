// "?" on a card: what it is for, in two sentences.
import { useTranslation } from 'react-i18next';
import { Alert, Pressable, StyleSheet } from 'react-native';

import { AppText } from '@/components/ui';
import { useTheme } from '@/theme';

export type HelpTopic = 'principle' | 'exercise' | 'why' | 'habits' | 'checkin';

export function HelpButton({ topic }: { topic: HelpTopic }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const title = t(`guide.help.${topic}.title`);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t('guide.help.label', { title })}
      hitSlop={10}
      onPress={() => Alert.alert(title, t(`guide.help.${topic}.body`))}
      style={[styles.button, { borderColor: colors.border }]}
    >
      <AppText variant="caption" tone="secondary">
        ?
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
