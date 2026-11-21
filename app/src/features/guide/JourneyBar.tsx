// Day journey: 4 steps (Principle -> Exercise -> Habits -> Check-in), next step highlighted.
// Tapping a step scrolls to its card.
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui';
import { radius, spacing, useTheme } from '@/theme';

import type { Journey, JourneyStepId } from './journey';

export function JourneyBar({
  journey,
  onStep,
}: {
  journey: Journey;
  onStep: (step: JourneyStepId) => void;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  return (
    <View style={styles.row} accessibilityLabel={t('guide.journey.title')}>
      {journey.steps.map((step, index) => {
        const next = journey.next === step.id;
        const label = t(`guide.journey.${step.id}`);
        const state = step.done
          ? t('guide.journey.done')
          : next
            ? t('guide.journey.next')
            : t('guide.journey.todo');
        return (
          <Pressable
            key={step.id}
            accessibilityRole="button"
            accessibilityLabel={`${label} : ${state}`}
            accessibilityHint={t('guide.journey.hint')}
            onPress={() => onStep(step.id)}
            style={[
              styles.step,
              {
                borderColor: next ? colors.primary : colors.border,
                backgroundColor: step.done ? colors.primary : colors.card,
              },
            ]}
          >
            <AppText variant="caption" tone={step.done ? 'onPrimary' : next ? 'link' : 'secondary'}>
              {step.done ? '✓' : String(index + 1)}
            </AppText>
            <AppText
              variant="caption"
              tone={step.done ? 'onPrimary' : next ? 'link' : 'secondary'}
              numberOfLines={1}
            >
              {label}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.xs },
  step: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
    paddingVertical: spacing.sm,
    borderRadius: radius.button,
    borderWidth: 1.5,
  },
});
