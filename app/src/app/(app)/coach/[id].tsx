// Conversation with Coach Edge (id = "new" or a thread id). The answer is streamed; an action
// proposed by the coach is a card ("Appliquer / Annuler"); the help card (3114) follows a message
// flagged by the server's safety net. `prefill`: text shared from a note or a reflection, put in
// the input field (editable, never sent automatically).
import { useQueryClient } from '@tanstack/react-query';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState, type ComponentRef } from 'react';
import { useTranslation } from 'react-i18next';
import { KeyboardAvoidingView, Platform, StyleSheet, View, type ScrollView } from 'react-native';

import { SplashView } from '@/components/SplashView';
import { AppText, Button, Screen, TextField } from '@/components/ui';
import { ActionCard } from '@/features/coach/ActionCard';
import {
  coachKeys,
  sendCoachMessage,
  useCoachQuota,
  useCoachThread,
  type CoachAction,
} from '@/features/coach/api';
import { SafetyCard } from '@/features/coach/SafetyCard';
import { useUserId } from '@/lib/auth/AuthProvider';
import { useIsPremium, useProfile } from '@/lib/queries';
import { radius, spacing, useTheme } from '@/theme';

const MAX_CHARS = 4000;

type Live = {
  userText: string;
  answer: string;
  safety: boolean;
  actions: CoachAction[];
};

function Bubble({ role, text }: { role: 'user' | 'assistant'; text: string }) {
  const { colors } = useTheme();
  const mine = role === 'user';
  return (
    <View
      style={[
        styles.bubble,
        mine
          ? { alignSelf: 'flex-end', backgroundColor: colors.primary }
          : { alignSelf: 'flex-start', backgroundColor: colors.card, borderColor: colors.border },
      ]}
    >
      <AppText tone={mine ? 'onPrimary' : 'body'}>{text}</AppText>
    </View>
  );
}

export default function CoachConversation() {
  const { t } = useTranslation();
  const params = useLocalSearchParams<{ id: string; prefill?: string }>();
  const userId = useUserId();
  const queryClient = useQueryClient();
  const profile = useProfile(userId).data;
  const premium = useIsPremium(userId);
  const [threadId, setThreadId] = useState<string | null>(
    params.id && params.id !== 'new' ? params.id : null,
  );
  const thread = useCoachThread(threadId);
  const quota = useCoachQuota(userId);
  const [input, setInput] = useState(() => (params.prefill ?? '').slice(0, MAX_CHARS));
  const [live, setLive] = useState<Live | null>(null);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<ComponentRef<typeof ScrollView>>(null);

  useEffect(() => {
    const timer = setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50);
    return () => clearTimeout(timer);
  }, [thread.data, live]);

  if (!profile || premium.isPending) return <SplashView />;
  if (premium.data !== true || !profile.consent_ai) return <Redirect href="/coach" />;

  const remaining = quota.data ? Math.max(0, quota.data.limit - quota.data.used) : null;
  const sending = live !== null;

  const send = async () => {
    const text = input.trim();
    if (!text || sending) return;
    setError(null);
    setInput('');
    setLive({ userText: text, answer: '', safety: false, actions: [] });
    let current = threadId;
    const failure = await sendCoachMessage(threadId, text, (e) => {
      if (e.event === 'thread') {
        current = e.data.id;
        setThreadId(e.data.id);
      } else if (e.event === 'text') {
        setLive((l) => (l ? { ...l, answer: l.answer + e.data.text } : l));
      } else if (e.event === 'safety') {
        setLive((l) => (l ? { ...l, safety: true } : l));
      } else if (e.event === 'action') {
        setLive((l) => (l ? { ...l, actions: [...l.actions, e.data] } : l));
      } else if (e.event === 'error') {
        setError(t('coach.errors.unavailable'));
      }
    }).catch(() => 'network');
    if (failure) {
      setError(
        failure === 'quota_exceeded'
          ? t('coach.errors.quota', { limit: quota.data?.limit ?? 30 })
          : t('coach.errors.unavailable'),
      );
      if (failure === 'quota_exceeded' || !current) setInput(text);
    }
    if (current) await queryClient.invalidateQueries({ queryKey: coachKeys.thread(current) });
    await queryClient.invalidateQueries({ queryKey: coachKeys.threads(userId) });
    await queryClient.invalidateQueries({ queryKey: coachKeys.quota(userId) });
    setLive(null);
  };

  const messages = thread.data?.messages ?? [];
  const actions = thread.data?.actions ?? [];
  const actionsOf = (toolCalls: unknown) =>
    ((toolCalls as { action_id?: string }[] | null) ?? []).flatMap((c) => {
      const action = actions.find((a) => a.id === c.action_id);
      return action ? [action] : [];
    });

  return (
    <KeyboardAvoidingView
      style={styles.fill}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Screen
        scroll
        scrollRef={scrollRef}
        footer={
          <View style={styles.composer}>
            {remaining !== null && remaining <= 5 ? (
              <AppText variant="caption" tone="secondary">
                {t('coach.remaining', { count: remaining })}
              </AppText>
            ) : null}
            {error ? <AppText tone="danger">{error}</AppText> : null}
            <TextField
              value={input}
              onChangeText={setInput}
              placeholder={t('coach.placeholder')}
              accessibilityLabel={t('coach.inputLabel')}
              multiline
              maxLength={MAX_CHARS}
              testID="coach-input"
            />
            <View style={styles.row}>
              <Button
                label={t('common.back')}
                variant="ghost"
                onPress={() => router.back()}
                style={styles.flex}
              />
              <Button
                label={t('coach.send')}
                onPress={() => void send()}
                loading={sending}
                disabled={input.trim().length === 0 || sending}
                style={styles.flex}
              />
            </View>
          </View>
        }
      >
        <View style={styles.top}>
          <AppText variant="subtitle" accessibilityRole="header">
            {t('coach.title')}
          </AppText>
          <AppText variant="caption" tone="secondary">
            {t('coach.guardrails')}
          </AppText>
        </View>
        {messages.length === 0 && !live ? (
          <AppText tone="secondary">{t('coach.empty')}</AppText>
        ) : null}
        {messages.map((m) => (
          <View key={m.id} style={styles.group}>
            {m.content ? (
              <Bubble role={m.role === 'user' ? 'user' : 'assistant'} text={m.content} />
            ) : null}
            {m.role === 'user' && m.distress ? <SafetyCard /> : null}
            {m.role === 'assistant'
              ? actionsOf(m.tool_calls).map((a) => <ActionCard key={a.id} action={a} />)
              : null}
          </View>
        ))}
        {live ? (
          <View style={styles.group}>
            <Bubble role="user" text={live.userText} />
            {live.safety ? <SafetyCard /> : null}
            <Bubble role="assistant" text={live.answer || '…'} />
            {live.actions.map((a) => (
              <ActionCard key={a.id} action={a} />
            ))}
          </View>
        ) : null}
      </Screen>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  top: { paddingTop: spacing.lg, gap: spacing.xs },
  group: { gap: spacing.sm },
  bubble: {
    maxWidth: '88%',
    padding: spacing.md,
    borderRadius: radius.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'transparent',
  },
  composer: { gap: spacing.sm },
  row: { flexDirection: 'row', gap: spacing.sm },
  flex: { flex: 1 },
});
