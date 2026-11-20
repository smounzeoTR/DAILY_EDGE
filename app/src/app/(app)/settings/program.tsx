// Program change: restarts at day 1 after confirmation (change_program).
import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Pressable, StyleSheet, View } from 'react-native';

import { SplashView } from '@/components/SplashView';
import { AppText, Button, Screen } from '@/components/ui';
import { resolveLanguage } from '@/i18n/language';
import { localized } from '@/i18n/localize';
import { useUserId } from '@/lib/auth/AuthProvider';
import { generatePlan, queryKeys, usePrograms, useProfile } from '@/lib/queries';
import { supabase } from '@/lib/supabase';
import { radius, spacing, useTheme } from '@/theme';

export default function ProgramSettings() {
  const { t, i18n } = useTranslation();
  const language = resolveLanguage(i18n.language);
  const { colors } = useTheme();
  const userId = useUserId();
  const queryClient = useQueryClient();
  const profile = useProfile(userId).data;
  const programs = usePrograms().data;
  const [error, setError] = useState<string | null>(null);

  if (!profile || !programs) return <SplashView />;

  const change = (programId: string, name: string) => {
    Alert.alert(t('settings.programConfirmTitle', { name }), t('settings.programConfirmBody'), [
      { text: t('settings.deleteKeep'), style: 'cancel' },
      {
        text: t('settings.programConfirm'),
        onPress: () => {
          void (async () => {
            const { error: e } = await supabase.rpc('change_program', { p_program_id: programId });
            if (e) {
              setError(t('common.errorGeneric'));
              return;
            }
            // Today's plan is recomputed if untouched (day 1 of the new program)
            await generatePlan().catch(() => undefined);
            await queryClient.invalidateQueries({ queryKey: queryKeys.profile(userId) });
            await queryClient.invalidateQueries({ queryKey: ['plan', userId] });
            router.back();
          })();
        },
      },
    ]);
  };

  return (
    <Screen
      scroll
      footer={<Button label={t('common.back')} variant="ghost" onPress={() => router.back()} />}
    >
      <View style={styles.top}>
        <AppText variant="title" accessibilityRole="header">
          {t('settings.programTitle')}
        </AppText>
      </View>
      {error ? <AppText tone="danger">{error}</AppText> : null}
      {programs.map((p) => {
        const selected = p.id === profile.program_id;
        const name = localized(p, 'name', language);
        return (
          <Pressable
            key={p.id}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            accessibilityLabel={name}
            disabled={selected}
            onPress={() => change(p.id, name)}
            style={[
              styles.option,
              {
                borderColor: selected ? colors.primary : colors.border,
                backgroundColor: selected ? colors.primarySoft : colors.card,
              },
            ]}
          >
            <AppText variant="caption" tone="link">
              {selected ? `${p.id} · ${t('onboarding.program.selected')}` : p.id}
            </AppText>
            <AppText variant="bodyStrong">{name}</AppText>
            <AppText variant="caption" tone="secondary">
              {localized(p, 'description', language)}
            </AppText>
          </Pressable>
        );
      })}
    </Screen>
  );
}

const styles = StyleSheet.create({
  top: { paddingTop: spacing.lg },
  option: { borderWidth: 1.5, borderRadius: radius.card, padding: spacing.lg, gap: spacing.xs },
});
