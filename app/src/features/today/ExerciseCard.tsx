// Exercise of the day: proof input by proof_type, "Fait" / "Pas le temps" / "Trop dur",
// optional 1-5 rating after "Fait", correction until the end of the day.
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText, Button, Card, TextField } from '@/components/ui';
import { resolveLanguage } from '@/i18n/language';
import { localized } from '@/i18n/localize';
import type { PlanData } from '@/lib/queries';
import { radius, spacing, useTheme } from '@/theme';

import { isProofValid, proofToSend, type ItemStatus, type ProofType } from './day';

type Item = PlanData['plan_items'][number];

export type ResultInput = {
  itemId: string;
  status: Exclude<ItemStatus, 'todo'>;
  proof: string | null;
  rating: number | null;
};

function Stars({ value, onChange }: { value: number | null; onChange: (n: number) => void }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  return (
    <View style={styles.stars} accessibilityRole="radiogroup">
      {[1, 2, 3, 4, 5].map((n) => {
        const on = value !== null && n <= value;
        return (
          <Pressable
            key={n}
            accessibilityRole="radio"
            accessibilityState={{ selected: value === n }}
            accessibilityLabel={t('today.rating', { n })}
            hitSlop={6}
            onPress={() => onChange(n)}
            style={[
              styles.star,
              {
                borderColor: on ? colors.momentum : colors.border,
                backgroundColor: on ? colors.momentum : colors.card,
              },
            ]}
          >
            <AppText variant="bodyStrong" tone={on ? 'onPrimary' : 'secondary'}>
              {String(n)}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

export function ExerciseCard({
  item,
  editable,
  saving,
  onSave,
}: {
  item: Item;
  editable: boolean;
  saving: boolean;
  onSave: (input: ResultInput) => void;
}) {
  const { t, i18n } = useTranslation();
  const { colors } = useTheme();
  const language = resolveLanguage(i18n.language);
  const exercise = item.exercise;
  const proofType = (exercise?.proof_type ?? 'checkbox') as ProofType;
  const [editing, setEditing] = useState(item.status === 'todo');
  const [proof, setProof] = useState(item.proof_value ?? '');
  // Premium: instructions personalized by the AI, the original stays one tap away
  const [showOriginal, setShowOriginal] = useState(false);
  if (!exercise) return null;
  const title = localized(exercise, 'title', language);
  const personalized = item.personalized_instructions;
  const original = localized(exercise, 'instructions', language);

  const save = (status: ResultInput['status'], rating: number | null = null) => {
    onSave({
      itemId: item.id,
      status,
      proof: status === 'done' ? proofToSend(proofType, proof) : null,
      rating,
    });
    setEditing(false);
  };

  const showForm = editable && (editing || item.status === 'todo');

  return (
    <Card>
      <View style={styles.row}>
        <AppText variant="caption" tone="link">
          {item.origin === 'user' ? t('today.addedByYou') : t('today.exerciseOfDay')}
        </AppText>
        <View style={[styles.pill, { backgroundColor: colors.primarySoft }]}>
          <AppText variant="caption">{t('today.duration', { min: exercise.duration_min })}</AppText>
        </View>
      </View>
      <AppText variant="subtitle">{title}</AppText>
      <AppText tone="body">{personalized && !showOriginal ? personalized : original}</AppText>
      {personalized ? (
        <View style={styles.personalized}>
          <AppText variant="caption" tone="secondary">
            {showOriginal ? t('today.originalInstructions') : t('today.personalizedForYou')}
          </AppText>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              showOriginal
                ? t('today.showPersonalizedFor', { title })
                : t('today.showOriginalFor', { title })
            }
            hitSlop={8}
            onPress={() => setShowOriginal(!showOriginal)}
          >
            <AppText variant="caption" tone="link">
              {showOriginal ? t('today.showPersonalized') : t('today.showOriginal')}
            </AppText>
          </Pressable>
        </View>
      ) : null}

      {showForm ? (
        <View style={styles.form}>
          {proofType === 'free_text' ? (
            <TextField
              label={t('today.proofText')}
              value={proof}
              onChangeText={setProof}
              placeholder={t('today.proofTextPlaceholder')}
              accessibilityLabel={t('today.proofFor', { title })}
              multiline
              maxLength={1000}
            />
          ) : null}
          {proofType === 'numeric' ? (
            <TextField
              label={t('today.proofNumber')}
              value={proof}
              onChangeText={setProof}
              placeholder="0"
              accessibilityLabel={t('today.proofFor', { title })}
              keyboardType="decimal-pad"
            />
          ) : null}
          <Button
            label={t('today.done')}
            accessibilityLabel={t('today.doneFor', { title })}
            onPress={() => save('done')}
            disabled={!isProofValid(proofType, proof)}
            loading={saving}
          />
          <View style={styles.secondary}>
            <Button
              label={t('today.noTime')}
              accessibilityLabel={t('today.noTimeFor', { title })}
              variant="secondary"
              onPress={() => save('skipped')}
              style={styles.flex}
            />
            <Button
              label={t('today.tooHard')}
              accessibilityLabel={t('today.tooHardFor', { title })}
              variant="secondary"
              onPress={() => save('too_hard')}
              style={styles.flex}
            />
          </View>
        </View>
      ) : (
        <View style={styles.form}>
          <AppText variant="bodyStrong" tone={item.status === 'done' ? 'link' : 'secondary'}>
            {t(`today.status.${item.status}`)}
          </AppText>
          {item.status === 'done' && item.proof_value ? (
            <AppText variant="caption" tone="secondary">
              {item.proof_value}
            </AppText>
          ) : null}
          {item.status === 'done' && editable ? (
            <>
              <AppText variant="caption" tone="secondary">
                {t('today.ratingPrompt')}
              </AppText>
              <Stars value={item.rating} onChange={(n) => save('done', n)} />
            </>
          ) : null}
          {editable ? (
            <Pressable accessibilityRole="button" hitSlop={8} onPress={() => setEditing(true)}>
              <AppText tone="link" variant="bodyStrong">
                {t('today.edit')}
              </AppText>
            </Pressable>
          ) : null}
        </View>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  personalized: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, alignItems: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  pill: { borderRadius: radius.badge, paddingHorizontal: spacing.sm, paddingVertical: 2 },
  form: { gap: spacing.sm, marginTop: spacing.sm },
  secondary: { flexDirection: 'row', gap: spacing.sm },
  flex: { flex: 1 },
  stars: { flexDirection: 'row', gap: spacing.sm },
  star: {
    width: 44,
    height: 44,
    borderRadius: radius.badge,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
