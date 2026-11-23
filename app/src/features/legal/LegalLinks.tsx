// Links to the terms, privacy policy and legal notice (in-app browser).
import * as WebBrowser from 'expo-web-browser';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui';
import { spacing } from '@/theme';

import { LEGAL_PAGES, legalUrl } from './links';

const base = process.env.EXPO_PUBLIC_LEGAL_BASE_URL;

export function LegalLinks() {
  const { t, i18n } = useTranslation();
  return (
    <View style={styles.row}>
      {LEGAL_PAGES.map((page) => (
        <Pressable
          key={page}
          accessibilityRole="link"
          hitSlop={8}
          onPress={() => void WebBrowser.openBrowserAsync(legalUrl(page, i18n.language, base))}
        >
          <AppText variant="caption" tone="link" style={styles.link}>
            {t(`legal.${page}`)}
          </AppText>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  link: { textDecorationLine: 'underline' },
});
