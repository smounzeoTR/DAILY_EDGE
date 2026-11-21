// The single overlay of an opening (decided by overlayToShow): day-1 guided tour, celebration of
// a milestone, or tip of the day. Home-made and accessible: a layer above Today (not a native
// modal: iOS refuses to present one while the reminders screen is closing), VoiceOver reads each
// bubble (modal view, announcement), "Passer" is always reachable (bottom bar), animations follow
// "Reduce Motion".
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AccessibilityInfo,
  Animated,
  BackHandler,
  StyleSheet,
  View,
  type AccessibilityActionEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText, Button } from '@/components/ui';
import { radius, spacing, useTheme } from '@/theme';

import type { MilestoneId, Overlay, TipId } from './guide';

export const TOUR_STEPS = ['principle', 'exercise', 'why', 'habits', 'checkin'] as const;
export type TourStep = (typeof TOUR_STEPS)[number];

export function useReduceMotion(): boolean {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    void AccessibilityInfo.isReduceMotionEnabled().then(setReduce);
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduce);
    return () => sub.remove();
  }, []);
  return reduce;
}

function Bubble({
  title,
  body,
  meta,
  children,
  center = false,
}: {
  title: string;
  body: string;
  meta?: string;
  children: React.ReactNode;
  center?: boolean;
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReduceMotion();
  const [scale] = useState(() => new Animated.Value(1));
  useEffect(() => {
    if (reduceMotion) {
      scale.setValue(1);
      return;
    }
    scale.setValue(0.94);
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 18, bounciness: 6 }).start();
  }, [title, reduceMotion, scale]);
  // VoiceOver reads each new bubble
  useEffect(() => {
    AccessibilityInfo.announceForAccessibility(`${title}. ${body}`);
  }, [title, body]);

  return (
    <View
      style={[
        styles.backdrop,
        center ? styles.center : styles.bottom,
        { paddingBottom: insets.bottom + spacing.md },
      ]}
      accessibilityViewIsModal
    >
      <Animated.View
        style={[
          styles.bubble,
          { backgroundColor: colors.card, borderColor: colors.border, transform: [{ scale }] },
        ]}
      >
        {meta ? (
          <AppText variant="caption" tone="link">
            {meta}
          </AppText>
        ) : null}
        <AppText variant="subtitle" accessibilityRole="header">
          {title}
        </AppText>
        <AppText tone="body">{body}</AppText>
        <View style={styles.actions}>{children}</View>
      </Animated.View>
    </View>
  );
}

export function GuideOverlay({
  overlay,
  onTourStep,
  onTourEnd,
  onCelebrationClose,
  onTipClose,
}: {
  overlay: Overlay;
  // Scrolls Today to the card of the step
  onTourStep: (step: TourStep) => void;
  onTourEnd: (skipped: boolean) => void;
  onCelebrationClose: (milestone: MilestoneId) => void;
  onTipClose: (tip: TipId) => void;
}) {
  const { t } = useTranslation();
  const reduceMotion = useReduceMotion();
  const [index, setIndex] = useState(0);
  const step = TOUR_STEPS[index] ?? 'principle';

  useEffect(() => {
    if (overlay?.kind === 'tour') onTourStep(step);
  }, [overlay?.kind, step, onTourStep]);

  // Android back button closes the overlay like its main action
  useEffect(() => {
    if (!overlay) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (overlay.kind === 'tour') onTourEnd(true);
      else if (overlay.kind === 'celebration') onCelebrationClose(overlay.milestone);
      else onTipClose(overlay.tip);
      return true;
    });
    return () => sub.remove();
  }, [overlay, onTourEnd, onCelebrationClose, onTipClose]);

  // Fades in unless "Reduce Motion" is on
  const [opacity] = useState(() => new Animated.Value(0));
  useEffect(() => {
    if (!overlay) return;
    if (reduceMotion) opacity.setValue(1);
    else Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: true }).start();
  }, [overlay, reduceMotion, opacity]);

  if (!overlay) return null;

  let content: React.ReactNode;
  if (overlay.kind === 'tour') {
    const last = index === TOUR_STEPS.length - 1;
    // VoiceOver "escape" gesture skips the tour
    const onAction = (e: AccessibilityActionEvent) => {
      if (e.nativeEvent.actionName === 'escape') onTourEnd(true);
    };
    content = (
      <View
        style={styles.fill}
        accessibilityActions={[{ name: 'escape' }]}
        onAccessibilityAction={onAction}
      >
        <Bubble
          title={t(`guide.tour.${step}.title`)}
          body={t(`guide.tour.${step}.body`)}
          meta={t('guide.tour.progress', { n: index + 1, total: TOUR_STEPS.length })}
        >
          <Button
            label={t('guide.tour.skip')}
            variant="ghost"
            onPress={() => onTourEnd(true)}
            style={styles.flex}
          />
          <Button
            label={last ? t('guide.tour.finish') : t('guide.tour.next')}
            onPress={() => (last ? onTourEnd(false) : setIndex(index + 1))}
            style={styles.flex}
          />
        </Bubble>
      </View>
    );
  } else if (overlay.kind === 'celebration') {
    content = (
      <Bubble
        center
        title={t(`guide.milestones.${overlay.milestone}.title`)}
        body={t(`guide.milestones.${overlay.milestone}.body`)}
      >
        <Button
          label={t('guide.milestones.close')}
          onPress={() => onCelebrationClose(overlay.milestone)}
          style={styles.flex}
        />
      </Bubble>
    );
  } else {
    content = (
      <Bubble
        title={t(`guide.tips.${overlay.tip}.title`)}
        body={t(`guide.tips.${overlay.tip}.body`)}
        meta={t('guide.tips.label')}
      >
        <Button
          label={t('guide.tips.close')}
          onPress={() => onTipClose(overlay.tip)}
          style={styles.flex}
        />
      </Bubble>
    );
  }

  return <Animated.View style={[StyleSheet.absoluteFill, { opacity }]}>{content}</Animated.View>;
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  backdrop: {
    flex: 1,
    paddingHorizontal: spacing.lg,
    // Light dim: the card explained by the tour stays visible above the bubble
    backgroundColor: 'rgba(10, 18, 40, 0.35)',
  },
  bottom: { justifyContent: 'flex-end' },
  center: { justifyContent: 'center' },
  bubble: {
    borderRadius: radius.card,
    borderWidth: StyleSheet.hairlineWidth,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  actions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  flex: { flex: 1 },
});
