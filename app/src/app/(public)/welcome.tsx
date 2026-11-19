import { Redirect, router } from 'expo-router';
import { useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ScrollViewInstance,
} from 'react-native';

import { LanguageToggle } from '@/components/LanguageToggle';
import { Logo } from '@/components/Logo';
import { AppText, Button, Card, Screen } from '@/components/ui';
import { resolveLanguage } from '@/i18n/language';
import { localized } from '@/i18n/localize';
import { useIntroPrinciple, usePrincipleCount } from '@/lib/queries';
import { storage, storageKeys } from '@/lib/storage';
import { radius, spacing, useTheme } from '@/theme';

const SLIDES = 3;

function finishIntro() {
  storage.setItemSync(storageKeys.introSeen, '1');
  router.replace('/sign-in');
}

function PrincipleArt() {
  const { t, i18n } = useTranslation();
  const language = resolveLanguage(i18n.language);
  const { data: principle } = useIntroPrinciple();
  return (
    <Card>
      <AppText variant="caption" tone="link">
        {t('intro.principleOfDay')}
      </AppText>
      {principle ? (
        <>
          <AppText variant="subtitle">{localized(principle, 'title', language)}</AppText>
          <AppText tone="body">{localized(principle, 'summary', language)}</AppText>
        </>
      ) : (
        <View style={styles.placeholder} />
      )}
    </Card>
  );
}

function ExerciseArt() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  return (
    <Card>
      <View style={styles.row}>
        <AppText variant="caption" tone="link">
          {t('intro.exerciseOfDay')}
        </AppText>
        <View style={[styles.pill, { backgroundColor: colors.primarySoft }]}>
          <AppText variant="caption">{t('intro.lowEnergy')}</AppText>
        </View>
      </View>
      <AppText variant="subtitle">{t('intro.exerciseTitle')}</AppText>
      <View style={[styles.fakeButton, { backgroundColor: colors.primary }]}>
        <AppText variant="bodyStrong" tone="onPrimary">
          {t('intro.markDone')}
        </AppText>
      </View>
    </Card>
  );
}

function HabitsArt() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const habits = [
    [t('intro.habit1'), t('intro.habit1Cue')],
    [t('intro.habit2'), t('intro.habit2Cue')],
    [t('intro.habit3'), t('intro.habit3Cue')],
  ] as const;
  return (
    <Card>
      {habits.map(([title, cue]) => (
        <View key={title} style={styles.habit}>
          <View style={[styles.check, { borderColor: colors.primary }]} />
          <View style={styles.flex}>
            <AppText variant="bodyStrong">{title}</AppText>
            <AppText variant="caption" tone="secondary">
              {cue}
            </AppText>
          </View>
        </View>
      ))}
    </Card>
  );
}

function Slide({
  width,
  art,
  title,
  body,
}: {
  width: number;
  art: ReactNode;
  title: string;
  body: string;
}) {
  return (
    <View style={[styles.slide, { width }]}>
      {art}
      <AppText variant="display" accessibilityRole="header">
        {title}
      </AppText>
      <AppText tone="secondary">{body}</AppText>
    </View>
  );
}

export default function Welcome() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const scroller = useRef<ScrollViewInstance>(null);
  const [index, setIndex] = useState(0);
  const { data: count } = usePrincipleCount();
  const last = index === SLIDES - 1;
  // Intro is shown once per device
  const [introSeen] = useState(() => storage.getItemSync(storageKeys.introSeen) === '1');

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    setIndex(Math.min(SLIDES - 1, Math.round(e.nativeEvent.contentOffset.x / width)));
  };
  const next = () => {
    if (last) return finishIntro();
    scroller.current?.scrollTo({ x: (index + 1) * width, animated: true });
    setIndex(index + 1);
  };

  if (introSeen) return <Redirect href="/sign-in" />;

  return (
    <Screen
      header={
        <View style={styles.header}>
          <Logo size={32} />
          <View style={styles.headerActions}>
            <LanguageToggle />
            <Pressable accessibilityRole="button" hitSlop={8} onPress={finishIntro}>
              <AppText variant="bodyStrong" tone="secondary">
                {t('common.skip')}
              </AppText>
            </Pressable>
          </View>
        </View>
      }
      footer={
        <>
          <View
            style={styles.dots}
            accessible
            accessibilityLabel={t('intro.pagination', { current: index + 1, total: SLIDES })}
          >
            {Array.from({ length: SLIDES }, (_, i) => (
              <View
                key={i}
                style={[
                  styles.dot,
                  i === index
                    ? { width: 24, backgroundColor: colors.primary }
                    : { backgroundColor: colors.border },
                ]}
              />
            ))}
          </View>
          <Button label={last ? t('common.start') : t('common.next')} onPress={next} />
        </>
      }
    >
      <ScrollView
        ref={scroller}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onScroll}
        style={styles.pager}
      >
        <Slide
          width={width}
          art={<PrincipleArt />}
          title={t('intro.slide1Title')}
          body={count ? t('intro.slide1Body', { count }) : t('intro.slide1BodyNoCount')}
        />
        <Slide
          width={width}
          art={<ExerciseArt />}
          title={t('intro.slide2Title')}
          body={t('intro.slide2Body')}
        />
        <Slide
          width={width}
          art={<HabitsArt />}
          title={t('intro.slide3Title')}
          body={t('intro.slide3Body')}
        />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  // Pager spans the full width despite the screen padding
  pager: { marginHorizontal: -spacing.xl },
  slide: { paddingHorizontal: spacing.xl, paddingTop: spacing.xl, gap: spacing.lg },
  placeholder: { height: 72 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  pill: { borderRadius: radius.badge, paddingHorizontal: spacing.sm, paddingVertical: 2 },
  fakeButton: {
    marginTop: spacing.sm,
    height: 44,
    borderRadius: radius.button,
    alignItems: 'center',
    justifyContent: 'center',
  },
  habit: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: 4 },
  check: { width: 24, height: 24, borderRadius: 8, borderWidth: 2 },
  flex: { flex: 1 },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
});
