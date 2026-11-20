// Library: principles and exercises (published), search without accents, filters, favorites.
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { SplashView } from '@/components/SplashView';
import { AppText, Card, Chip, Screen, TextField } from '@/components/ui';
import { FavoriteButton, useFavoriteSet } from '@/features/library/favorites';
import {
  emptyFilters,
  filterExercises,
  filterPrinciples,
  type DurationBucket,
  type LibraryFilters,
} from '@/features/library/search';
import { resolveLanguage } from '@/i18n/language';
import { localized } from '@/i18n/localize';
import { useLibrary } from '@/lib/queries';
import { radius, spacing, useTheme } from '@/theme';

const DOMAINS = [
  'clarity_goals',
  'discipline_habits',
  'money_wealth',
  'business_career',
  'mindset_beliefs',
  'relationships_network',
  'energy_health',
] as const;
const DURATIONS: DurationBucket[] = ['short', 'medium', 'long'];

export default function Library() {
  const { t, i18n } = useTranslation();
  const language = resolveLanguage(i18n.language);
  const { colors } = useTheme();
  const library = useLibrary();
  const [tab, setTab] = useState<'exercises' | 'principles'>('exercises');
  const [filters, setFilters] = useState<LibraryFilters>(emptyFilters);
  const [showFilters, setShowFilters] = useState(false);
  const favoriteExercises = useFavoriteSet('exercise');
  const favoritePrinciples = useFavoriteSet('principle');

  const exercises = useMemo(
    () =>
      library.data
        ? filterExercises(library.data.exercises, filters, language, favoriteExercises)
        : [],
    [library.data, filters, language, favoriteExercises],
  );
  const principles = useMemo(
    () =>
      library.data
        ? filterPrinciples(library.data.principles, filters, language, favoritePrinciples)
        : [],
    [library.data, filters, language, favoritePrinciples],
  );

  if (library.isError) return <SplashView onRetry={() => void library.refetch()} />;
  if (!library.data) return <SplashView />;

  const update = (patch: Partial<LibraryFilters>) => setFilters((f) => ({ ...f, ...patch }));
  const toggleDomain = (d: string) =>
    update({
      domains: filters.domains.includes(d)
        ? filters.domains.filter((x) => x !== d)
        : [...filters.domains, d],
    });
  const count = tab === 'exercises' ? exercises.length : principles.length;

  return (
    <Screen scroll>
      <View style={styles.top}>
        <AppText variant="title" accessibilityRole="header">
          {t('library.title')}
        </AppText>
      </View>

      <View style={[styles.segment, { borderColor: colors.border }]} accessibilityRole="tablist">
        {(['exercises', 'principles'] as const).map((value) => (
          <Pressable
            key={value}
            accessibilityRole="tab"
            accessibilityState={{ selected: tab === value }}
            onPress={() => setTab(value)}
            style={[styles.segmentItem, tab === value && { backgroundColor: colors.primary }]}
          >
            <AppText variant="bodyStrong" tone={tab === value ? 'onPrimary' : 'secondary'}>
              {t(`library.${value}`)}
            </AppText>
          </Pressable>
        ))}
      </View>

      <TextField
        value={filters.query}
        onChangeText={(query) => update({ query })}
        placeholder={t('library.search')}
        accessibilityLabel={t('library.search')}
        autoCorrect={false}
        returnKeyType="search"
      />

      <View style={styles.row}>
        <Chip
          label={t('library.favoritesOnly')}
          selected={filters.favoritesOnly}
          onPress={() => update({ favoritesOnly: !filters.favoritesOnly })}
        />
        <Chip
          label={t('library.filters')}
          selected={showFilters}
          onPress={() => setShowFilters(!showFilters)}
        />
      </View>

      {showFilters ? (
        <View style={styles.filters}>
          <AppText variant="caption" tone="secondary">
            {t('library.domain')}
          </AppText>
          <View style={styles.row}>
            {DOMAINS.map((d) => (
              <Chip
                key={d}
                label={t(`domains.${d}`)}
                selected={filters.domains.includes(d)}
                onPress={() => toggleDomain(d)}
              />
            ))}
          </View>
          {tab === 'exercises' ? (
            <>
              <AppText variant="caption" tone="secondary">
                {t('library.duration')}
              </AppText>
              <View style={styles.row}>
                {DURATIONS.map((b) => (
                  <Chip
                    key={b}
                    label={t(`library.durations.${b}`)}
                    selected={filters.duration === b}
                    onPress={() => update({ duration: filters.duration === b ? null : b })}
                  />
                ))}
              </View>
            </>
          ) : null}
          <AppText variant="caption" tone="secondary">
            {t('library.source')}
          </AppText>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.row}
          >
            {library.data.sources.map((s) => (
              <Chip
                key={s.id}
                label={s.author}
                selected={filters.sourceId === s.id}
                onPress={() => update({ sourceId: filters.sourceId === s.id ? null : s.id })}
              />
            ))}
          </ScrollView>
          <Pressable
            accessibilityRole="button"
            onPress={() => setFilters({ ...emptyFilters, query: filters.query })}
          >
            <AppText tone="link" variant="bodyStrong">
              {t('library.reset')}
            </AppText>
          </Pressable>
        </View>
      ) : null}

      <AppText variant="caption" tone="secondary">
        {t('library.count', { count })}
      </AppText>

      {tab === 'exercises'
        ? exercises.map((e) => {
            const title = localized(e, 'title', language);
            return (
              <Card key={e.id}>
                <View style={styles.cardHead}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={title}
                    onPress={() =>
                      router.push({ pathname: '/exercise/[id]', params: { id: e.id } })
                    }
                    style={styles.flex}
                  >
                    <AppText variant="caption" tone="link">
                      {t(`domains.${e.domain}`)} · {t('today.duration', { min: e.duration_min })}
                    </AppText>
                    <AppText variant="bodyStrong">{title}</AppText>
                  </Pressable>
                  <FavoriteButton type="exercise" id={e.id} title={title} />
                </View>
              </Card>
            );
          })
        : principles.map((p) => {
            const title = localized(p, 'title', language);
            return (
              <Card key={p.id}>
                <View style={styles.cardHead}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={title}
                    onPress={() =>
                      router.push({ pathname: '/principle/[id]', params: { id: p.id } })
                    }
                    style={styles.flex}
                  >
                    <AppText variant="caption" tone="link">
                      {t(`domains.${p.domain}`)}
                    </AppText>
                    <AppText variant="bodyStrong">{title}</AppText>
                    <AppText variant="caption" tone="secondary" numberOfLines={2}>
                      {localized(p, 'summary', language)}
                    </AppText>
                  </Pressable>
                  <FavoriteButton type="principle" id={p.id} title={title} />
                </View>
              </Card>
            );
          })}
      {count === 0 ? <AppText tone="secondary">{t('library.empty')}</AppText> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  top: { paddingTop: spacing.lg },
  segment: { flexDirection: 'row', borderWidth: 1, borderRadius: radius.button, padding: 3 },
  segmentItem: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderRadius: radius.button,
  },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  filters: { gap: spacing.sm },
  cardHead: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  flex: { flex: 1, gap: 2 },
});
