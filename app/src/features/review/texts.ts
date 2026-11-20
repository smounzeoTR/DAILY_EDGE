// Texts of a weekly review proposal (stored as type + params, rendered in the current language).
import type { TFunction } from 'i18next';

import type { Language } from '@/i18n/language';
import { habitText, localized } from '@/i18n/localize';
import type { ReviewProposal } from '@/lib/queries';

type HabitRow = { id: string; title: string | null; template: object | null };
type TemplateRow = { id: string } & object;

export function formatDate(iso: string, language: Language): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString(language, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export function proposalText(
  proposal: ReviewProposal,
  t: TFunction,
  language: Language,
  habits: HabitRow[],
  templates: TemplateRow[],
): string {
  const p = proposal.params;
  const habit = habits.find((h) => h.id === p.user_habit_id);
  const habitName = habit ? habitText(habit.title, habit.template, 'title', language) : '';
  switch (proposal.type) {
    case 'habit_simplify':
      return t('review.proposals.habit_simplify', {
        habit: habitName,
        minimal: habit ? habitText(null, habit.template, 'minimal_version', language) : '',
      });
    case 'habit_replace': {
      const template = templates.find((tpl) => tpl.id === p.template_id);
      return t('review.proposals.habit_replace', {
        habit: habitName,
        template: template ? localized(template, 'title', language) : '',
      });
    }
    case 'goal_deadline':
      return t('review.proposals.goal_deadline', {
        date: formatDate(String(p.deadline), language),
      });
    case 'update_goal_progress':
      return t('review.proposals.update_goal_progress');
    case 'level_up':
      return t('review.proposals.level_up', {
        level: t(`onboarding.level.${String(p.to)}` as 'onboarding.level.advanced'),
      });
    case 'daily_minutes':
      return t('review.proposals.daily_minutes', { minutes: p.minutes, average: p.average });
  }
}
