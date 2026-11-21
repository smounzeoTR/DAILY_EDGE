// "Mes notes" in the Library: every note with its principle or exercise, newest first.
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable } from 'react-native';

import { AppText, Card } from '@/components/ui';
import { resolveLanguage } from '@/i18n/language';
import { localized } from '@/i18n/localize';
import { useUserId } from '@/lib/auth/AuthProvider';
import { useLibrary, useNotes } from '@/lib/queries';

export function NotesList() {
  const { t, i18n } = useTranslation();
  const language = resolveLanguage(i18n.language);
  const userId = useUserId();
  const notes = useNotes(userId);
  const library = useLibrary();
  if (!notes.data || !library.data) return null;
  if (notes.data.length === 0) {
    return <AppText tone="secondary">{t('notes.empty')}</AppText>;
  }
  return (
    <>
      <AppText variant="caption" tone="secondary">
        {t('notes.total', { count: notes.data.length })}
      </AppText>
      {notes.data.map((note) => {
        const element =
          note.entity_type === 'exercise'
            ? library.data.exercises.find((e) => e.id === note.entity_id)
            : library.data.principles.find((p) => p.id === note.entity_id);
        const title = element ? localized(element, 'title', language) : note.entity_id;
        const kind = t(note.entity_type === 'exercise' ? 'notes.exercise' : 'notes.principle');
        return (
          <Pressable
            key={note.id}
            accessibilityRole="button"
            accessibilityLabel={`${kind} : ${title}. ${note.body}`}
            onPress={() =>
              note.entity_type === 'exercise'
                ? router.push({ pathname: '/exercise/[id]', params: { id: note.entity_id } })
                : router.push({ pathname: '/principle/[id]', params: { id: note.entity_id } })
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
