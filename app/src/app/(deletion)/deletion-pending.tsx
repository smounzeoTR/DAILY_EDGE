// Account deletion requested: the only screen until it is cancelled (purged after 30 days).
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { Logo } from '@/components/Logo';
import { AppText, Button, Screen } from '@/components/ui';
import { exportAndShare } from '@/features/settings/exportData';
import { useAuth, useUserId } from '@/lib/auth/AuthProvider';
import { queryKeys, useProfile } from '@/lib/queries';
import { supabase } from '@/lib/supabase';
import { spacing } from '@/theme';

const DELETION_DELAY_DAYS = 30;

export default function DeletionPending() {
  const { t, i18n } = useTranslation();
  const { signOut } = useAuth();
  const userId = useUserId();
  const queryClient = useQueryClient();
  const profile = useProfile(userId).data;
  const [busy, setBusy] = useState<'cancel' | 'export' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const requestedAt = profile?.deletion_requested_at
    ? new Date(profile.deletion_requested_at)
    : new Date();
  const deletionDate = new Date(
    requestedAt.getTime() + DELETION_DELAY_DAYS * 86_400_000,
  ).toLocaleDateString(i18n.language, { day: 'numeric', month: 'long', year: 'numeric' });

  const cancel = async () => {
    setBusy('cancel');
    setError(null);
    const { error: rpcError } = await supabase.rpc('cancel_account_deletion');
    if (rpcError) setError(t('common.errorGeneric'));
    // The route guard brings the user back to the app
    await queryClient.invalidateQueries({ queryKey: queryKeys.profile(userId) });
    setBusy(null);
  };

  const exportData = async () => {
    setBusy('export');
    setError(null);
    try {
      await exportAndShare();
    } catch {
      setError(t('settings.exportError'));
    }
    setBusy(null);
  };

  return (
    <Screen
      footer={
        <>
          {error ? <AppText tone="danger">{error}</AppText> : null}
          <Button
            label={t('deletion.cancel')}
            onPress={() => void cancel()}
            loading={busy === 'cancel'}
          />
          <Button
            label={t('settings.export')}
            variant="secondary"
            onPress={() => void exportData()}
            loading={busy === 'export'}
          />
          <Button label={t('today.signOut')} variant="ghost" onPress={() => void signOut()} />
        </>
      }
    >
      <View style={styles.body}>
        <Logo size={48} />
        <AppText variant="title" accessibilityRole="header">
          {t('deletion.title', { date: deletionDate })}
        </AppText>
        <AppText tone="body">{t('deletion.body')}</AppText>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { flex: 1, justifyContent: 'center', gap: spacing.lg },
});
