// Coach tab, visible to everyone. Free or without AI consent: a presentation (prototype premium
// switch when allowed, or a link to the consents). Otherwise: conversations, new conversation,
// deletion of a conversation or of the whole history.
import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Alert, Pressable, StyleSheet, View } from 'react-native';

import { SplashView } from '@/components/SplashView';
import { AppText, Button, Card, Screen } from '@/components/ui';
import { coachKeys, useCoachThreads } from '@/features/coach/api';
import { useUserId } from '@/lib/auth/AuthProvider';
import { premiumKey, useAppFlags, useIsPremium, useProfile } from '@/lib/queries';
import { supabase } from '@/lib/supabase';
import { spacing, useTheme } from '@/theme';

const FEATURES = ['adapt', 'exercise', 'goal', 'habit', 'review'] as const;

export default function Coach() {
  const { t, i18n } = useTranslation();
  const { colors } = useTheme();
  const userId = useUserId();
  const queryClient = useQueryClient();
  const profile = useProfile(userId).data;
  const premium = useIsPremium(userId);
  const flags = useAppFlags().data;
  const eligible = premium.data === true && profile?.consent_ai === true;
  const threads = useCoachThreads(userId);

  if (!profile || premium.isPending) return <SplashView />;

  const refresh = () => queryClient.invalidateQueries({ queryKey: coachKeys.threads(userId) });
  const deleteThread = (id: string) =>
    Alert.alert(t('coach.deleteThreadTitle'), t('coach.deleteThreadBody'), [
      { text: t('coach.keep'), style: 'cancel' },
      {
        text: t('coach.delete'),
        style: 'destructive',
        onPress: () => {
          void supabase.rpc('delete_assistant_thread', { p_thread_id: id }).then(refresh);
        },
      },
    ]);
  const deleteAll = () =>
    Alert.alert(t('coach.deleteAllTitle'), t('coach.deleteAllBody'), [
      { text: t('coach.keep'), style: 'cancel' },
      {
        text: t('coach.deleteAll'),
        style: 'destructive',
        onPress: () => {
          void supabase.rpc('delete_assistant_history').then(refresh);
        },
      },
    ]);

  if (!eligible) {
    const becomePremium = async () => {
      await supabase.rpc('dev_set_plan', { p_plan: 'premium' });
      await queryClient.invalidateQueries({ queryKey: premiumKey(userId) });
    };
    return (
      <Screen scroll>
        <View style={styles.top}>
          <AppText variant="title" accessibilityRole="header">
            {t('coach.title')}
          </AppText>
          <AppText tone="secondary">{t('coach.intro')}</AppText>
        </View>
        <Card>
          {FEATURES.map((f) => (
            <AppText key={f} tone="body">
              {`• ${t(`coach.features.${f}`)}`}
            </AppText>
          ))}
          <AppText variant="caption" tone="secondary">
            {t('coach.guardrails')}
          </AppText>
        </Card>
        {premium.data !== true ? (
          flags?.allow_plan_toggle ? (
            <Button label={t('coach.becomePremium')} onPress={() => void becomePremium()} />
          ) : (
            <AppText tone="secondary">{t('coach.premiumOnly')}</AppText>
          )
        ) : (
          <>
            <AppText tone="secondary">{t('coach.needsConsent')}</AppText>
            <Button
              label={t('coach.openConsents')}
              variant="secondary"
              onPress={() => router.navigate('/settings')}
            />
          </>
        )}
      </Screen>
    );
  }

  return (
    <Screen scroll>
      <View style={styles.top}>
        <AppText variant="title" accessibilityRole="header">
          {t('coach.title')}
        </AppText>
        <AppText tone="secondary">{t('coach.subtitle')}</AppText>
      </View>
      <Button
        label={t('coach.newConversation')}
        onPress={() => router.push({ pathname: '/coach/[id]', params: { id: 'new' } })}
      />
      {(threads.data ?? []).length === 0 ? (
        <AppText tone="secondary">{t('coach.noConversation')}</AppText>
      ) : null}
      {(threads.data ?? []).map((thread) => (
        <Card key={thread.id}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={thread.title ?? t('coach.untitled')}
            onPress={() => router.push({ pathname: '/coach/[id]', params: { id: thread.id } })}
          >
            <AppText variant="bodyStrong" numberOfLines={2}>
              {thread.title ?? t('coach.untitled')}
            </AppText>
            <AppText variant="caption" tone="secondary">
              {new Date(thread.last_message_at).toLocaleString(i18n.language, {
                day: 'numeric',
                month: 'long',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </AppText>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('coach.deleteThreadFor', { title: thread.title ?? '' })}
            onPress={() => deleteThread(thread.id)}
            hitSlop={8}
            style={[styles.delete, { borderColor: colors.border }]}
          >
            <AppText variant="caption" tone="secondary">
              {t('coach.delete')}
            </AppText>
          </Pressable>
        </Card>
      ))}
      {(threads.data ?? []).length > 0 ? (
        <Button label={t('coach.deleteAll')} variant="ghost" onPress={deleteAll} />
      ) : null}
      <AppText variant="caption" tone="secondary">
        {t('coach.retention')}
      </AppText>
    </Screen>
  );
}

const styles = StyleSheet.create({
  top: { paddingTop: spacing.lg, gap: spacing.xs },
  delete: { alignSelf: 'flex-start', marginTop: spacing.xs },
});
