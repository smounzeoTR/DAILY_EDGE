// "Mon carnet" on a principle or exercise sheet: one private note per element (2 000 characters
// at most), never sent to the AI.
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, StyleSheet, View } from 'react-native';

import { AppText, Button, Card, TextField } from '@/components/ui';
import { useUserId } from '@/lib/auth/AuthProvider';
import { deleteNote, notesKey, saveNote, useNotes, type NoteEntity } from '@/lib/queries';
import { spacing } from '@/theme';

export const NOTE_MAX_LENGTH = 2000;

export function NoteCard({ entityType, entityId }: { entityType: NoteEntity; entityId: string }) {
  const { t } = useTranslation();
  const userId = useUserId();
  const queryClient = useQueryClient();
  const notes = useNotes(userId);
  const note = (notes.data ?? []).find(
    (n) => n.entity_type === entityType && n.entity_id === entityId,
  );
  const [draft, setDraft] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);
  if (notes.isPending) return null;

  const value = draft ?? note?.body ?? '';
  const changed = value.trim() !== (note?.body ?? '').trim();
  const refresh = () => queryClient.invalidateQueries({ queryKey: notesKey(userId) });

  const save = async () => {
    setBusy(true);
    setMessage(null);
    try {
      await saveNote(note?.id ?? null, entityType, entityId, value.trim());
      await refresh();
      setDraft(null);
      setMessage({ text: t('notes.saved'), ok: true });
    } catch {
      setMessage({ text: t('common.errorGeneric'), ok: false });
    } finally {
      setBusy(false);
    }
  };

  const remove = () => {
    if (!note) return;
    Alert.alert(t('notes.deleteTitle'), t('notes.deleteBody'), [
      { text: t('notes.keep'), style: 'cancel' },
      {
        text: t('notes.delete'),
        style: 'destructive',
        onPress: () => {
          void deleteNote(note.id)
            .then(refresh)
            .then(() => {
              setDraft(null);
              setMessage({ text: t('notes.deleted'), ok: true });
            })
            .catch(() => setMessage({ text: t('common.errorGeneric'), ok: false }));
        },
      },
    ]);
  };

  return (
    <Card>
      <AppText variant="bodyStrong">{t('notes.title')}</AppText>
      <AppText variant="caption" tone="secondary">
        {t(entityType === 'exercise' ? 'notes.hintExercise' : 'notes.hintPrinciple')}
      </AppText>
      <TextField
        value={value}
        onChangeText={(v) => {
          setDraft(v);
          setMessage(null);
        }}
        placeholder={t('notes.placeholder')}
        accessibilityLabel={t('notes.title')}
        multiline
        maxLength={NOTE_MAX_LENGTH}
        testID="note-input"
      />
      <AppText variant="caption" tone="secondary">
        {t('notes.length', { n: value.length, max: NOTE_MAX_LENGTH })}
      </AppText>
      <View style={styles.actions}>
        <Button
          label={t('notes.save')}
          onPress={() => void save()}
          loading={busy}
          disabled={!changed || value.trim().length === 0}
          style={styles.flex}
        />
        {note ? (
          <Button label={t('notes.delete')} variant="ghost" onPress={remove} style={styles.flex} />
        ) : null}
      </View>
      {message ? (
        <AppText variant="caption" tone={message.ok ? 'link' : 'danger'}>
          {message.text}
        </AppText>
      ) : null}
      <AppText variant="caption" tone="secondary">
        {t('notes.private')}
      </AppText>
    </Card>
  );
}

const styles = StyleSheet.create({
  actions: { flexDirection: 'row', gap: spacing.sm },
  flex: { flex: 1 },
});
