// Principle sheet: summary, sources and linked exercises, favorite.
import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { SplashView } from '@/components/SplashView';
import { AppText, Button, Card, Screen } from '@/components/ui';
import { FavoriteButton } from '@/features/library/favorites';
import { resolveLanguage } from '@/i18n/language';
import { localized } from '@/i18n/localize';
import { useLibrary } from '@/lib/queries';
import { spacing } from '@/theme';

export default function PrincipleSheet() {
  const { t, i18n } = useTranslation();
  const language = resolveLanguage(i18n.language);
  const { id } = useLocalSearchParams<{ id: string }>();
  const library = useLibrary();

  if (!library.data) return <SplashView />;
  const principle = library.data.principles.find((p) => p.id === id);
  const back = <Button label={t('common.back')} variant="ghost" onPress={() => router.back()} />;
  if (!principle) {
    return (
      <Screen footer={back}>
        <AppText tone="secondary">{t('library.notFound')}</AppText>
      </Screen>
    );
  }
  const title = localized(principle, 'title', language);
  const sources = principle.sourceIds
    .map((sid) => library.data.sources.find((s) => s.id === sid))
    .filter((s): s is NonNullable<typeof s> => Boolean(s));
  const exercises = principle.exerciseIds
    .map((eid) => library.data.exercises.find((e) => e.id === eid))
    .filter((e): e is NonNullable<typeof e> => Boolean(e));

  return (
    <Screen scroll footer={back}>
      <View style={styles.head}>
        <View style={styles.flex}>
          <AppText variant="caption" tone="link">
            {t(`domains.${principle.domain}`)}
          </AppText>
          <AppText variant="title" accessibilityRole="header">
            {title}
          </AppText>
        </View>
        <FavoriteButton type="principle" id={principle.id} title={title} />
      </View>
      <AppText tone="body">{localized(principle, 'summary', language)}</AppText>

      {sources.length > 0 ? (
        <Card>
          <AppText variant="bodyStrong">{t('library.sources')}</AppText>
          {sources.map((s) => (
            <View key={s.id}>
              <AppText variant="bodyStrong">{s.author}</AppText>
              <AppText variant="caption" tone="secondary">
                {s.title_fr} ({s.title_original})
              </AppText>
            </View>
          ))}
        </Card>
      ) : null}

      {exercises.length > 0 ? (
        <Card>
          <AppText variant="bodyStrong">{t('library.linkedExercises')}</AppText>
          {exercises.map((e) => (
            <Pressable
              key={e.id}
              accessibilityRole="link"
              onPress={() => router.push({ pathname: '/exercise/[id]', params: { id: e.id } })}
            >
              <AppText tone="link" variant="bodyStrong">
                {localized(e, 'title', language)}
              </AppText>
              <AppText variant="caption" tone="secondary">
                {t('today.duration', { min: e.duration_min })}
              </AppText>
            </Pressable>
          ))}
        </Card>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, paddingTop: spacing.lg },
  flex: { flex: 1, gap: spacing.xs },
});
