// "Donner mon avis": free text sent with the app version (feedback table, visible to admins).
import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform, StyleSheet, View } from 'react-native';

import { AppText, Button, Screen, TextField } from '@/components/ui';
import { isOnline } from '@/features/offline/sync';
import { appVersion } from '@/lib/appVersion';
import { supabase } from '@/lib/supabase';
import { spacing } from '@/theme';

const MAX_LENGTH = 2000;

export default function Feedback() {
  const { t, i18n } = useTranslation();
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = async () => {
    const text = body.trim();
    if (!text) return;
    if (!isOnline()) {
      setError(t('feedback.offline'));
      return;
    }
    setSending(true);
    setError(null);
    const { version, build } = appVersion();
    const { error: insertError } = await supabase.from('feedback').insert({
      body: text,
      app_version: version,
      build,
      platform: Platform.OS === 'android' ? 'android' : Platform.OS === 'ios' ? 'ios' : 'web',
      locale: i18n.language === 'en' ? 'en' : 'fr',
    });
    setSending(false);
    if (insertError) {
      setError(
        insertError.message === 'feedback_limit' ? t('feedback.limit') : t('common.errorGeneric'),
      );
      return;
    }
    setSent(true);
    setBody('');
  };

  return (
    <Screen
      scroll
      footer={
        <View style={styles.footer}>
          {sent ? null : (
            <Button
              label={t('feedback.send')}
              onPress={() => void send()}
              loading={sending}
              disabled={body.trim().length === 0}
            />
          )}
          <Button label={t('common.back')} variant="ghost" onPress={() => router.back()} />
        </View>
      }
    >
      <View style={styles.top}>
        <AppText variant="title" accessibilityRole="header">
          {t('feedback.title')}
        </AppText>
        <AppText tone="secondary">{t('feedback.intro')}</AppText>
      </View>
      {sent ? (
        <AppText tone="body">{t('feedback.thanks')}</AppText>
      ) : (
        <TextField
          label={t('feedback.label')}
          placeholder={t('feedback.placeholder')}
          value={body}
          onChangeText={(v) => setBody(v.slice(0, MAX_LENGTH))}
          multiline
        />
      )}
      {error ? <AppText tone="danger">{error}</AppText> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  top: { paddingTop: spacing.lg, gap: spacing.xs },
  footer: { gap: spacing.sm },
});
