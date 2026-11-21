// Administration entry: two-factor authentication first (TOTP, Supabase), then the read-only
// screens. Activation: QR code or secret in an authenticator app, then the 6-digit code.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SvgXml } from 'react-native-svg';

import { SplashView } from '@/components/SplashView';
import { AppText, Button, Card, Screen, TextField } from '@/components/ui';
import {
  assuranceLevel,
  enrollTotp,
  verifiedTotpFactor,
  verifyTotp,
  type Enrolment,
} from '@/features/admin/api';
import { spacing, useTheme } from '@/theme';

const MFA_KEY = ['adminMfa'] as const;

function MenuRow({ label, onPress }: { label: string; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={[styles.row, { borderColor: colors.border }]}
    >
      <AppText variant="bodyStrong">{label}</AppText>
      <AppText tone="secondary">›</AppText>
    </Pressable>
  );
}

export default function AdminHome() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const queryClient = useQueryClient();
  const status = useQuery({
    queryKey: MFA_KEY,
    staleTime: 0,
    queryFn: async () => {
      const level = await assuranceLevel();
      const factorId = level.current === 'aal2' ? null : await verifiedTotpFactor();
      return { aal2: level.current === 'aal2', factorId };
    },
  });
  const [enrolment, setEnrolment] = useState<Enrolment | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const back = <Button label={t('common.back')} variant="ghost" onPress={() => router.back()} />;
  if (status.isPending) return <SplashView />;
  if (status.isError || !status.data) {
    return <SplashView onRetry={() => void status.refetch()} />;
  }

  if (status.data.aal2) {
    return (
      <Screen scroll footer={back}>
        <View style={styles.top}>
          <AppText variant="title" accessibilityRole="header">
            {t('admin.title')}
          </AppText>
          <AppText tone="secondary">{t('admin.readOnly')}</AppText>
        </View>
        <Card>
          <MenuRow label={t('admin.exercises')} onPress={() => router.push('/admin/exercises')} />
          <MenuRow label={t('admin.engineLog')} onPress={() => router.push('/admin/log')} />
          <MenuRow label={t('admin.aiCost')} onPress={() => router.push('/admin/costs')} />
        </Card>
      </Screen>
    );
  }

  const factorId = enrolment?.factorId ?? status.data.factorId;
  const startEnrolment = async () => {
    setBusy(true);
    setError(null);
    try {
      setEnrolment(await enrollTotp());
    } catch {
      setError(t('common.errorGeneric'));
    } finally {
      setBusy(false);
    }
  };
  const verify = async (value = code) => {
    if (!factorId || busy) return;
    setBusy(true);
    setError(null);
    try {
      await verifyTotp(factorId, value.trim());
      setCode('');
      await queryClient.invalidateQueries({ queryKey: MFA_KEY });
    } catch {
      setError(t('admin.mfa.invalidCode'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen scroll footer={back}>
      <View style={styles.top}>
        <AppText variant="title" accessibilityRole="header">
          {t('admin.mfa.title')}
        </AppText>
        <AppText tone="secondary">{t('admin.mfa.why')}</AppText>
      </View>

      {!factorId ? (
        <Button
          label={t('admin.mfa.enable')}
          onPress={() => void startEnrolment()}
          loading={busy}
        />
      ) : null}

      {enrolment ? (
        <Card>
          <AppText variant="bodyStrong">{t('admin.mfa.scan')}</AppText>
          <View style={[styles.qr, { backgroundColor: '#FFFFFF', borderColor: colors.border }]}>
            <SvgXml
              xml={enrolment.qrSvg}
              width={200}
              height={200}
              accessibilityLabel={t('admin.mfa.qr')}
            />
          </View>
          <AppText variant="caption" tone="secondary">
            {t('admin.mfa.secretLabel')}
          </AppText>
          {/* Selectable: copied into an authenticator app (and read by the e2e scenario) */}
          <Text selectable testID="totp-secret" style={[styles.secret, { color: colors.text }]}>
            {enrolment.secret}
          </Text>
        </Card>
      ) : null}

      {factorId ? (
        <Card>
          <TextField
            label={t('admin.mfa.code')}
            value={code}
            onChangeText={(v) => {
              const digits = v.replace(/\D/g, '');
              setCode(digits);
              // The iOS number pad has no return key: the 6th digit submits the code
              if (digits.length === 6) void verify(digits);
            }}
            keyboardType="number-pad"
            maxLength={6}
            placeholder="123456"
            testID="totp-code"
            accessibilityLabel={t('admin.mfa.code')}
          />
          <Button
            label={t('admin.mfa.verify')}
            onPress={() => void verify()}
            loading={busy}
            disabled={code.trim().length !== 6}
          />
        </Card>
      ) : null}
      {error ? <AppText tone="danger">{error}</AppText> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  top: { paddingTop: spacing.lg, gap: spacing.xs },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  secret: { fontSize: 16, fontWeight: '600', letterSpacing: 1 },
  qr: {
    alignSelf: 'center',
    padding: spacing.md,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
});
