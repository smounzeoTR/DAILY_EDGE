// "Mes notes" in the Library: every note with its principle, exercise or habit, newest first.
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable } from 'react-native';

import { AppText, Card } from '@/components/ui';
import { resolveLanguage } from '@/i18n/language';
import { habitText, localized } from '@/i18n/localize';
import { useUserId } from '@/lib/auth/AuthProvider';
import { useAllHabits, useLibrary, useNotes } from '@/lib/queries';

const SHEETS = {
  exercise: '/exercise/[id]',
  principle: '/principle/[id]',
  habit: '/habit/[id]',
} as const;

export function NotesList() {
  const { t, i18n } = useTranslation();
  const language = resolveLanguage(i18n.language);
  const userId = useUserId();
  const notes = useNotes(userId);
  const library = useLibrary();
  const habits = useAllHabits(userId);
  const allHabits = habits.data;
  if (!notes.data || !library.data || !allHabits) return null;
  if (notes.data.length === 0) {
    return <AppText tone="secondary">{t('notes.empty')}</AppText>;
  }
  return (
    <>
      <AppText variant="caption" tone="secondary">
        {t('notes.total', { count: notes.data.length })}
      </AppText>
      {notes.data.map((note) => {
        let title = note.entity_id;
        if (note.entity_type === 'habit') {
          const habit = allHabits.find((h) => h.id === note.entity_id);
          if (habit) title = habitText(habit.title, habit.template, 'title', language);
        } else {
          const element =
            note.entity_type === 'exercise'
              ? library.data.exercises.find((e) => e.id === note.entity_id)
              : library.data.principles.find((p) => p.id === note.entity_id);
          if (element) title = localized(element, 'title', language);
        }
        const kind = t(`notes.${note.entity_type}`);
        return (
          <Pressable
            key={note.id}
            accessibilityRole="button"
            accessibilityLabel={`${kind} : ${title}. ${note.body}`}
            onPress={() =>
              router.push({ pathname: SHEETS[note.entity_type], params: { id: note.entity_id } })
            }
          >
            <Card>
              <AppText variant="caption" tone="link">
                {kind}
              </AppText>
              <AppText variant="bodyStrong">{title}</AppText>
              <AppText tone="body" numberOfLines={3}>
                {note.body}
              </AppText>
            </Card>
          </Pressable>
        );
      })}
    </>
  );
}
