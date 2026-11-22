// Offline banner (actions kept for later) and the result of the last synchronization.
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui';
import { radius, spacing, useTheme } from '@/theme';

import { dismissSyncNotice, useOfflineState } from './sync';

export function OfflineBanner() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { online, pending, notice } = useOfflineState();
  if (online && !notice) return null;
  return (
    <View
      style={[styles.banner, { backgroundColor: colors.primarySoft, borderColor: colors.border }]}
      accessibilityLiveRegion="polite"
    >
      {!online ? (
        <AppText variant="caption" tone="body">
          {pending > 0 ? t('offline.bannerPending', { count: pending }) : t('offline.banner')}
        </AppText>
      ) : null}
      {online && notice ? (
        <Pressable
          accessibilityRole="button"
          accessibilityHint={t('offline.dismiss')}
          onPress={dismissSyncNotice}
        >
          {notice.applied > 0 ? (
            <AppText variant="caption" tone="body">
              {t('offline.synced', { count: notice.applied })}
            </AppText>
          ) : null}
          {notice.refused > 0 ? (
            <AppText variant="caption" tone="body">
              {t('offline.refused', { count: notice.refused })}
            </AppText>
          ) : null}
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    padding: spacing.sm,
    borderRadius: radius.badge,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 2,
  },
});
