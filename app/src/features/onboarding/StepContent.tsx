// Body of each onboarding step (questions, consent, program, habits).
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Switch, View } from 'react-native';

import { DateField, TimeField } from '@/components/DateTimeField';
import { AppText, Card, Chip, TextField } from '@/components/ui';
import { resolveLanguage } from '@/i18n/language';
import { localized } from '@/i18n/localize';
import type { useHabitTemplates, usePrograms, useProgramSteps } from '@/lib/queries';
import { radius, spacing, useTheme } from '@/theme';

import {
  isFutureDate,
  MAX_PRIORITY_DOMAINS,
  parseTargetValue,
  toggleHabit,
  toggleLimited,
} from './rules';
import type { Answers, DailyMinutes, Step } from './types';

type Programs = NonNullable<ReturnType<typeof usePrograms>['data']>;
type ProgramSteps = NonNullable<ReturnType<typeof useProgramSteps>['data']>;
type Templates = NonNullable<ReturnType<typeof useHabitTemplates>['data']>;

export type StepProps = {
  step: Step;
  answers: Answers;
  update: (patch: Partial<Answers>) => void;
  today: string;
  program: Programs[number] | null;
  programs: Programs;
  programSteps: ProgramSteps;
  candidates: Templates;
};

const SITUATIONS = ['employee', 'entrepreneur', 'freelancer', 'student', 'in_transition'] as const;
const DOMAINS = [
  'clarity_goals',
  'discipline_habits',
  'money_wealth',
  'business_career',
  'mindset_beliefs',
  'relationships_network',
  'energy_health',
] as const;
const BLOCKERS = [
  'procrastination',
  'fear',
  'finances',
  'confidence',
  'organisation',
  'motivation',
] as const;
const MINUTES: DailyMinutes[] = [5, 15, 30, 45];
const CHRONOTYPES = ['morning', 'midday', 'evening'] as const;
const MOTIVATIONS = ['challenge', 'consistency', 'meaning', 'recognition'] as const;
const LEVELS = ['beginner', 'intermediate', 'advanced'] as const;

function ChipGroup({ children }: { children: React.ReactNode }) {
  return <View style={styles.chips}>{children}</View>;
}

export function StepContent(props: StepProps) {
  const { t } = useTranslation();
  const { step, answers, update, today } = props;

  switch (step) {
    case 'goalTitle':
      return (
        <TextField
          value={answers.goalTitle}
          onChangeText={(goalTitle) => update({ goalTitle })}
          placeholder={t('onboarding.q.goalTitlePlaceholder')}
          accessibilityLabel={t('onboarding.q.goalTitle')}
          multiline
          maxLength={200}
          autoFocus
        />
      );
    case 'goalMeasure': {
      const invalid = parseTargetValue(answers.goalTargetValue) === 'invalid';
      return (
        <View style={styles.stack}>
          <TextField
            value={answers.goalTargetValue}
            onChangeText={(goalTargetValue) => update({ goalTargetValue })}
            placeholder={t('onboarding.q.valuePlaceholder')}
            accessibilityLabel={t('onboarding.q.valuePlaceholder')}
            keyboardType="decimal-pad"
          />
          <TextField
            value={answers.goalUnit}
            onChangeText={(goalUnit) => update({ goalUnit })}
            placeholder={t('onboarding.q.unitPlaceholder')}
            accessibilityLabel={t('onboarding.q.unitPlaceholder')}
            maxLength={40}
          />
          {invalid ? <AppText tone="danger">{t('onboarding.q.invalidValue')}</AppText> : null}
        </View>
      );
    }
    case 'goalDeadline': {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const invalid = answers.goalDeadline !== null && !isFutureDate(answers.goalDeadline, today);
      return (
        <View style={styles.stack}>
          <DateField
            value={answers.goalDeadline}
            onChange={(goalDeadline) => update({ goalDeadline })}
            minimumDate={tomorrow}
            placeholder={t('onboarding.q.pickDate')}
          />
          {invalid ? <AppText tone="danger">{t('onboarding.q.deadlineInFuture')}</AppText> : null}
        </View>
      );
    }
    case 'goalWhy':
      return (
        <TextField
          value={answers.goalWhy}
          onChangeText={(goalWhy) => update({ goalWhy })}
          placeholder={t('onboarding.q.goalWhyPlaceholder')}
          accessibilityLabel={t('onboarding.q.goalWhy')}
          multiline
          maxLength={500}
          style={styles.multiline}
        />
      );
    case 'situation':
      return (
        <ChipGroup>
          {SITUATIONS.map((value) => (
            <Chip
              key={value}
              label={t(`onboarding.situation.${value}`)}
              selected={answers.situation === value}
              onPress={() => update({ situation: answers.situation === value ? null : value })}
            />
          ))}
        </ChipGroup>
      );
    case 'domains': {
      const full = answers.priorityDomains.length >= MAX_PRIORITY_DOMAINS;
      return (
        <View style={styles.stack}>
          <AppText tone="secondary">
            {t('onboarding.q.domainsCount', { count: answers.priorityDomains.length })}
          </AppText>
          <ChipGroup>
            {DOMAINS.map((value) => {
              const selected = answers.priorityDomains.includes(value);
              return (
                <Chip
                  key={value}
                  label={t(`domains.${value}`)}
                  selected={selected}
                  disabled={full && !selected}
                  onPress={() =>
                    update({
                      priorityDomains: toggleLimited(
                        answers.priorityDomains,
                        value,
                        MAX_PRIORITY_DOMAINS,
                      ),
                    })
                  }
                />
              );
            })}
          </ChipGroup>
        </View>
      );
    }
    case 'blockers':
      return (
        <View style={styles.stack}>
          <AppText tone="secondary">{t('onboarding.q.multipleChoice')}</AppText>
          <ChipGroup>
            {BLOCKERS.map((value) => (
              <Chip
                key={value}
                label={t(`onboarding.blocker.${value}`)}
                selected={answers.blockers.includes(value)}
                onPress={() => update({ blockers: toggleLimited(answers.blockers, value) })}
              />
            ))}
          </ChipGroup>
        </View>
      );
    case 'dailyMinutes':
      return (
        <ChipGroup>
          {MINUTES.map((value) => (
            <Chip
              key={value}
              label={t(`onboarding.minutes.${value}`)}
              selected={answers.dailyMinutes === value}
              onPress={() =>
                update({ dailyMinutes: answers.dailyMinutes === value ? null : value })
              }
            />
          ))}
        </ChipGroup>
      );
    case 'chronotype':
      return (
        <ChipGroup>
          {CHRONOTYPES.map((value) => (
            <Chip
              key={value}
              label={t(`onboarding.chronotype.${value}`)}
              selected={answers.chronotype === value}
              onPress={() => update({ chronotype: answers.chronotype === value ? null : value })}
            />
          ))}
        </ChipGroup>
      );
    case 'motivation':
      return (
        <ChipGroup>
          {MOTIVATIONS.map((value) => (
            <Chip
              key={value}
              label={t(`onboarding.motivationStyle.${value}`)}
              selected={answers.motivationStyle === value}
              onPress={() =>
                update({ motivationStyle: answers.motivationStyle === value ? null : value })
              }
            />
          ))}
        </ChipGroup>
      );
    case 'level':
      return (
        <ChipGroup>
          {LEVELS.map((value) => (
            <Chip
              key={value}
              label={t(`onboarding.level.${value}`)}
              selected={answers.level === value}
              onPress={() => update({ level: answers.level === value ? null : value })}
            />
          ))}
        </ChipGroup>
      );
    case 'reminders':
      return (
        <View style={styles.stack}>
          <TimeField
            label={t('onboarding.q.morning')}
            value={answers.notifyMorning}
            onChange={(notifyMorning) => update({ notifyMorning })}
          />
          <TimeField
            label={t('onboarding.q.evening')}
            value={answers.notifyEvening}
            onChange={(notifyEvening) => update({ notifyEvening })}
          />
        </View>
      );
    case 'consent':
      return <ConsentStep {...props} />;
    case 'program':
      return <ProgramStep {...props} />;
    case 'habits':
      return <HabitsStep {...props} />;
  }
}

function ConsentRow({
  title,
  body,
  value,
  onChange,
}: {
  title: string;
  body: string;
  value: boolean;
  onChange: (value: boolean) => void;
}) {
  const { colors } = useTheme();
  // The whole card toggles the consent (not only the switch)
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      accessibilityLabel={title}
      accessibilityHint={body}
      onPress={() => onChange(!value)}
    >
      <Card>
        <View style={styles.consentRow}>
          <View style={styles.flex}>
            <AppText variant="bodyStrong">{title}</AppText>
            <AppText variant="caption" tone="secondary">
              {body}
            </AppText>
          </View>
          <Switch
            value={value}
            onValueChange={onChange}
            trackColor={{ true: colors.primary, false: colors.border }}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          />
        </View>
      </Card>
    </Pressable>
  );
}

function ConsentStep({ answers, update }: StepProps) {
  const { t } = useTranslation();
  return (
    <View style={styles.stack}>
      <ConsentRow
        title={t('onboarding.consent.checkinTitle')}
        body={t('onboarding.consent.checkinBody')}
        value={answers.consentCheckin}
        onChange={(consentCheckin) => update({ consentCheckin })}
      />
      <ConsentRow
        title={t('onboarding.consent.aiTitle')}
        body={t('onboarding.consent.aiBody')}
        value={answers.consentAi}
        onChange={(consentAi) => update({ consentAi })}
      />
      <AppText variant="caption" tone="secondary">
        {t('onboarding.consent.note')}
      </AppText>
    </View>
  );
}

function ProgramStep({ program, programs, programSteps, update }: StepProps) {
  const { t, i18n } = useTranslation();
  const { colors } = useTheme();
  const language = resolveLanguage(i18n.language);
  const [choosing, setChoosing] = useState(false);
  if (!program) return null;

  // Week n starts on day (n - 1) * 7 + 1
  const weeks = [1, 2, 3, 4].map((n) => {
    const step = programSteps.find(
      (s) => s.program_id === program.id && s.day_index === (n - 1) * 7 + 1,
    );
    return { n, theme: step ? localized(step, 'theme', language) : '' };
  });

  return (
    <View style={styles.stack}>
      <Card>
        <AppText variant="caption" tone="link">
          {t('onboarding.program.meta', { code: program.id, days: program.duration_days })}
        </AppText>
        <AppText variant="subtitle">{localized(program, 'name', language)}</AppText>
        <AppText tone="body">{localized(program, 'description', language)}</AppText>
      </Card>
      {weeks.map((w) => (
        <View key={w.n} style={[styles.week, { borderColor: colors.border }]}>
          <View style={[styles.badge, { backgroundColor: colors.primarySoft }]}>
            <AppText variant="bodyStrong">{w.n}</AppText>
          </View>
          <View style={styles.flex}>
            <AppText variant="caption" tone="secondary">
              {t('onboarding.program.week', { n: w.n })}
            </AppText>
            <AppText variant="bodyStrong">{w.theme}</AppText>
          </View>
        </View>
      ))}
      <Pressable accessibilityRole="button" hitSlop={8} onPress={() => setChoosing(!choosing)}>
        <AppText tone="link" variant="bodyStrong">
          {choosing ? t('onboarding.program.close') : t('onboarding.program.change')}
        </AppText>
      </Pressable>
      {choosing ? (
        <View style={styles.stack}>
          <AppText variant="subtitle">{t('onboarding.program.chooseTitle')}</AppText>
          {programs.map((p) => {
            const selected = p.id === program.id;
            return (
              <Pressable
                key={p.id}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                onPress={() => {
                  // The chosen program also replaces the persona
                  update({ programOverride: p.id });
                  setChoosing(false);
                }}
                style={[
                  styles.option,
                  {
                    borderColor: selected ? colors.primary : colors.border,
                    backgroundColor: selected ? colors.primarySoft : colors.card,
                  },
                ]}
              >
                <AppText variant="caption" tone="link">
                  {selected ? `${p.id} · ${t('onboarding.program.selected')}` : p.id}
                </AppText>
                <AppText variant="bodyStrong">{localized(p, 'name', language)}</AppText>
                <AppText variant="caption" tone="secondary">
                  {localized(p, 'description', language)}
                </AppText>
              </Pressable>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

function HabitsStep({ answers, update, candidates }: StepProps) {
  const { t, i18n } = useTranslation();
  const { colors } = useTheme();
  const language = resolveLanguage(i18n.language);
  return (
    <View style={styles.stack}>
      <AppText tone="secondary">
        {t('onboarding.habits.counter', { count: answers.habits.length })}
      </AppText>
      {candidates.map((template) => {
        const chosen = answers.habits.find((h) => h.templateId === template.id);
        const defaultCue = localized(template, 'default_cue', language);
        return (
          <View
            key={template.id}
            style={[
              styles.option,
              {
                borderColor: chosen ? colors.primary : colors.border,
                backgroundColor: chosen ? colors.primarySoft : colors.card,
              },
            ]}
          >
            <Pressable
              accessibilityRole="checkbox"
              accessibilityState={{ checked: Boolean(chosen) }}
              onPress={() => update({ habits: toggleHabit(answers.habits, template.id) })}
              style={styles.optionHead}
            >
              <AppText variant="bodyStrong">{localized(template, 'title', language)}</AppText>
              <AppText variant="caption" tone="secondary">
                {localized(template, 'description', language)}
              </AppText>
            </Pressable>
            {chosen ? (
              <View style={styles.stack}>
                <TextField
                  label={t('onboarding.habits.cue')}
                  value={chosen.cue ?? defaultCue}
                  onChangeText={(cue) =>
                    update({
                      habits: answers.habits.map((h) =>
                        h.templateId === template.id
                          ? { ...h, cue: cue === defaultCue ? null : cue }
                          : h,
                      ),
                    })
                  }
                  maxLength={120}
                />
                <AppText variant="caption" tone="secondary">
                  {t('onboarding.habits.minimal', {
                    text: localized(template, 'minimal_version', language),
                  })}
                </AppText>
              </View>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: spacing.md },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  multiline: { minHeight: 120, textAlignVertical: 'top' },
  consentRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  flex: { flex: 1, gap: spacing.xs },
  week: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingVertical: spacing.sm,
  },
  badge: {
    width: 40,
    height: 40,
    borderRadius: radius.badge,
    alignItems: 'center',
    justifyContent: 'center',
  },
  option: { borderWidth: 1.5, borderRadius: radius.card, padding: spacing.lg, gap: spacing.sm },
  optionHead: { gap: spacing.xs },
});
