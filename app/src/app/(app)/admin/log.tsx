// Engine decisions of one user found by e-mail (read only), with the linked AI calls.
import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { AppText, Button, Card, Screen, TextField } from '@/components/ui';
import { engineLog, type EngineLogRow } from '@/features/admin/api';
import { spacing } from '@/theme';

type Item = { exercise_id: string; origin: string; status: string; personalized: boolean };
type Call = {
  model: string | null;
  outcome: string;
  fallback_reason: string | null;
  input_tokens: number;
  output_tokens: number;
  cost_eur: number;
  latency_ms: number | null;
};

export default function AdminEngineLog() {
  const { t, i18n } = useTranslation();
  const [email, setEmail] = useState('');
  const [rows, setRows] = useState<EngineLogRow[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const search = async () => {
    setBusy(true);
    setError(null);
    try {
      setRows(await engineLog(email.trim()));
    } catch (e) {
      setRows(null);
      const message = (e as { message?: string }).message;
      setError(
        message === 'user_not_found'
          ? t('admin.userNotFound')
          : message === 'forbidden'
            ? t('admin.forbidden')
            : t('common.errorGeneric'),
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen
      scroll
      footer={<Button label={t('common.back')} variant="ghost" onPress={() => router.back()} />}
    >
      <View style={styles.top}>
        <AppText variant="title" accessibilityRole="header">
          {t('admin.engineLog')}
        </AppText>
      </View>
      <TextField
        label={t('admin.email')}
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
        autoComplete="off"
        testID="admin-email"
      />
      <Button
        label={t('admin.searchUser')}
        onPress={() => void search()}
        loading={busy}
        disabled={!email.includes('@')}
      />
      {error ? <AppText tone="danger">{error}</AppText> : null}
      {rows && rows.length === 0 ? (
        <AppText tone="secondary">{t('admin.noDecision')}</AppText>
      ) : null}
      {(rows ?? []).map((r) => {
        const items = (r.items ?? []) as unknown as Item[];
        const calls = (r.llm_calls ?? []) as unknown as Call[];
        const why = (r.why ?? null) as { key?: string; text?: string } | null;
        return (
          <Card key={r.decision_id}>
            <AppText variant="bodyStrong">
              {r.plan_date ?? '—'} · {r.mode ?? '—'}
              {r.program_day ? ` · J${r.program_day}` : ''}
            </AppText>
            <AppText variant="caption" tone="secondary">
              {new Date(r.created_at).toLocaleString(i18n.language)}
            </AppText>
            <AppText variant="caption">
              {t('admin.rules', { rules: r.rules_fired.join(', ') })}
            </AppText>
            {why?.text ? <AppText variant="caption">{why.text}</AppText> : null}
            <AppText variant="caption">
              {t('admin.items', {
                items: items
                  .map(
                    (i) =>
                      `${i.exercise_id} (${i.origin}, ${i.status}${i.personalized ? ', IA' : ''})`,
                  )
                  .join(' · '),
              })}
            </AppText>
            {calls.map((c, index) => (
              <AppText key={index} variant="caption" tone="link">
                {t('admin.callLine', {
                  model: c.model ?? '—',
                  outcome: c.outcome,
                  reason: c.fallback_reason ?? '—',
                  tokens: c.input_tokens + c.output_tokens,
                  cost: Number(c.cost_eur).toFixed(5),
                  latency: c.latency_ms ?? '—',
                })}
              </AppText>
            ))}
          </Card>
        );
      })}
    </Screen>
  );
}

const styles = StyleSheet.create({
  top: { paddingTop: spacing.lg },
});
