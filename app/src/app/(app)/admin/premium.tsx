// Premium for beta testers: granted until a date by e-mail, revoked, listed (each action audited).
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Redirect, router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { SplashView } from '@/components/SplashView';
import { AppText, Button, Card, Chip, Screen, TextField } from '@/components/ui';
import { grantPremium, premiumList, revokePremium } from '@/features/admin/api';
import { localToday } from '@/features/today/day';
import { addDays } from '@shared/habits/schedule.ts';
import { spacing } from '@/theme';

const DURATIONS = [30, 90] as const;
const KNOWN = ['user_not_found', 'invalid_until'] as const;

export default function AdminPremium() {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const [email, setEmail] = useState('');
  const [days, setDays] = useState<(typeof DURATIONS)[number]>(90);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);
  const list = useQuery({ queryKey: ['admin', 'premium'], queryFn: premiumList, retry: false });
  if (list.error) return <Redirect href="/admin" />;
  if (!list.data) return <SplashView />;

  const until = addDays(localToday('Europe/Paris', new Date()), days);
  const run = async (action: () => Promise<string | null>, ok: string) => {
    setBusy(true);
    setMessage(null);
    const error = await action();
    setBusy(false);
    if (error) {
      const key = (KNOWN as readonly string[]).includes(error)
        ? t(`admin.premium.errors.${error as (typeof KNOWN)[number]}`)
        : t('common.errorGeneric');
      setMessage({ text: key, ok: false });
      return;
    }
    setMessage({ text: ok, ok: true });
    setEmail('');
    await queryClient.invalidateQueries({ queryKey: ['admin', 'premium'] });
  };
  const date = (iso: string | null) =>
    iso
      ? new Date(iso).toLocaleDateString(i18n.language === 'en' ? 'en-GB' : 'fr-FR')
      : t('admin.premium.noEnd');

  return (
    <Screen
      scroll
      footer={<Button label={t('common.back')} variant="ghost" onPress={() => router.back()} />}
    >
      <View style={styles.top}>
        <AppText variant="title" accessibilityRole="header">
          {t('admin.premium.title')}
        </AppText>
        <AppText tone="secondary">{t('admin.premium.intro')}</AppText>
      </View>
      <Card>
        <TextField
          label={t('admin.premium.email')}
          placeholder="prenom@exemple.fr"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
        />
        <View style={styles.chips}>
          {DURATIONS.map((d) => (
            <Chip
              key={d}
              label={t('admin.premium.duration', { count: d })}
              selected={days === d}
              onPress={() => setDays(d)}
            />
          ))}
        </View>
        <Button
          label={t('admin.premium.grant', { date: date(until) })}
          onPress={() =>
            void run(() => grantPremium(email.trim(), until), t('admin.premium.granted'))
          }
          disabled={!email.includes('@')}
          loading={busy}
        />
        <Button
          label={t('admin.premium.revoke')}
          variant="ghost"
          onPress={() => void run(() => revokePremium(email.trim()), t('admin.premium.revoked'))}
          disabled={!email.includes('@') || busy}
        />
        {message ? <AppText tone={message.ok ? 'body' : 'danger'}>{message.text}</AppText> : null}
      </Card>
      <AppText variant="bodyStrong">{t('admin.premium.list', { count: list.data.length })}</AppText>
      {list.data.map((p) => (
        <Card key={p.email}>
          <AppText tone="body">{p.email}</AppText>
          <AppText variant="caption" tone="secondary">
            {t('admin.premium.until', { date: date(p.until), provider: p.provider ?? '—' })}
          </AppText>
        </Card>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  top: { paddingTop: spacing.lg, gap: spacing.xs },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
});
