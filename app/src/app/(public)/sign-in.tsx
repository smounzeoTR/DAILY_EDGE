import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { KeyboardAvoidingView, Platform, StyleSheet, View } from 'react-native';

import { LanguageToggle } from '@/components/LanguageToggle';
import { Logo } from '@/components/Logo';
import { AppText, Button, Screen, TextField } from '@/components/ui';
import { sendCode } from '@/features/auth/sendCode';
import { authErrorKey, isValidEmail, normalizeEmail } from '@/features/auth/validation';
import { spacing } from '@/theme';

export default function SignIn() {
  const { t, i18n } = useTranslation();
  const params = useLocalSearchParams<{ email?: string }>();
  const [email, setEmail] = useState(params.email ?? '');
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const submit = async () => {
    if (!isValidEmail(email)) {
      setError(t('auth.invalidEmail'));
      return;
    }
    setError(null);
    setSending(true);
    const normalized = normalizeEmail(email);
    const { error: sendError } = await sendCode(normalized, i18n.language);
    setSending(false);
    if (sendError) {
      setError(t(authErrorKey(sendError, 'send')));
      return;
    }
    router.push({ pathname: '/verify', params: { email: normalized } });
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
          <Button label={t('auth.sendCode')} onPress={() => void submit()} loading={sending} />
        }
      >
        <View style={styles.body}>
          <AppText variant="title" accessibilityRole="header">
            {t('auth.signInTitle')}
          </AppText>
          <AppText tone="secondary">{t('auth.signInBody')}</AppText>
          <TextField
            label={t('auth.emailLabel')}
            placeholder={t('auth.emailPlaceholder')}
            value={email}
            onChangeText={(value) => {
              setEmail(value);
              setError(null);
            }}
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="email"
            textContentType="emailAddress"
            keyboardType="email-address"
            returnKeyType="send"
            onSubmitEditing={() => void submit()}
          />
          {error ? (
            <AppText tone="danger" accessibilityRole="text">
              {error}
            </AppText>
          ) : null}
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
