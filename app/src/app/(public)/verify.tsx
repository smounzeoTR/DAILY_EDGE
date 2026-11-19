import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, View } from 'react-native';

import { LanguageToggle } from '@/components/LanguageToggle';
import { Logo } from '@/components/Logo';
import { OtpInput } from '@/components/OtpInput';
import { AppText, Button, Screen } from '@/components/ui';
import { sendCode } from '@/features/auth/sendCode';
import { authErrorKey, isCompleteOtp, RESEND_COOLDOWN_SECONDS } from '@/features/auth/validation';
import { supabase } from '@/lib/supabase';
import { spacing } from '@/theme';

export default function Verify() {
  const { t, i18n } = useTranslation();
  const { email = '' } = useLocalSearchParams<{ email: string }>();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [cooldown, setCooldown] = useState(RESEND_COOLDOWN_SECONDS);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  const verify = async (value: string) => {
    if (!isCompleteOtp(value) || verifying) return;
    setVerifying(true);
    setError(null);
    const { error: verifyError } = await supabase.auth.verifyOtp({
      email,
      token: value,
      type: 'email',
    });
    setVerifying(false);
    // On success the auth guard moves to onboarding or today
    if (verifyError) {
      setError(t(authErrorKey(verifyError, 'verify')));
      setCode('');
    }
  };

  const resend = async () => {
    setError(null);
    setInfo(null);
    const { error: sendError } = await sendCode(email, i18n.language);
    if (sendError) {
      setError(t(authErrorKey(sendError, 'send')));
      return;
    }
    setInfo(t('auth.resent'));
    setCooldown(RESEND_COOLDOWN_SECONDS);
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Screen
        header={
          <View style={styles.header}>
            <Logo size={32} />
            <LanguageToggle />
          </View>
        }
        footer={
          <>
            <Button
              label={t('auth.verify')}
              onPress={() => void verify(code)}
              disabled={!isCompleteOtp(code)}
              loading={verifying}
            />
            <Button
              label={cooldown > 0 ? t('auth.resendIn', { seconds: cooldown }) : t('auth.resend')}
              variant="ghost"
              disabled={cooldown > 0}
              onPress={() => void resend()}
            />
          </>
        }
      >
        <View style={styles.body}>
          <AppText variant="title" accessibilityRole="header">
            {t('auth.verifyTitle')}
          </AppText>
          <AppText tone="secondary">{t('auth.verifyBody', { email })}</AppText>
          <OtpInput
            value={code}
            label={t('auth.codeLabel')}
            onChange={(value) => {
              setCode(value);
              setError(null);
              if (isCompleteOtp(value)) void verify(value);
            }}
          />
          {error ? <AppText tone="danger">{error}</AppText> : null}
          {info ? <AppText tone="secondary">{info}</AppText> : null}
          <Pressable
            accessibilityRole="link"
            hitSlop={8}
            onPress={() => router.replace({ pathname: '/sign-in', params: { email } })}
          >
            <AppText tone="link" variant="bodyStrong">
              {t('auth.changeEmail')}
            </AppText>
          </Pressable>
        </View>
      </Screen>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  body: { paddingTop: spacing.xxl, gap: spacing.lg },
});
