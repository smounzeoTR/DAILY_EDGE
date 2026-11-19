import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Line, Path } from 'react-native-svg';

import { fonts, useTheme } from '@/theme';

type LogoProps = {
  // 'symbol' = rising sun only, 'full' = symbol + wordmark
  variant?: 'symbol' | 'full';
  size?: number;
  // White lines and wordmark on the brand blue (splash)
  onBlue?: boolean;
};

const ON_BLUE_LINES = '#FFFFFF';
const ON_BLUE_EDGE = '#C9D5FF';

export function LogoSymbol({ size = 64, onBlue = false }: { size?: number; onBlue?: boolean }) {
  const { colors } = useTheme();
  const lines = onBlue ? ON_BLUE_LINES : colors.logoLines;
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64">
      <Path d="M14 40 A18 18 0 0 1 50 40 Z" fill={colors.momentum} />
      <Line x1={6} y1={40} x2={58} y2={40} stroke={lines} strokeWidth={4} strokeLinecap="round" />
      <Line
        x1={16}
        y1={48}
        x2={48}
        y2={48}
        stroke={lines}
        strokeWidth={4}
        strokeLinecap="round"
        opacity={0.55}
      />
      <Line
        x1={25}
        y1={56}
        x2={39}
        y2={56}
        stroke={lines}
        strokeWidth={4}
        strokeLinecap="round"
        opacity={0.3}
      />
    </Svg>
  );
}

export function Logo({ variant = 'full', size = 64, onBlue = false }: LogoProps) {
  const { colors } = useTheme();
  const { t } = useTranslation();

  if (variant === 'symbol') {
    return (
      <View accessible accessibilityRole="image" accessibilityLabel={t('app.name')}>
        <LogoSymbol size={size} onBlue={onBlue} />
      </View>
    );
  }

  const fontSize = size * 0.5;
  return (
    <View
      style={styles.row}
      accessible
      accessibilityRole="image"
      accessibilityLabel={t('app.name')}
    >
      <LogoSymbol size={size} onBlue={onBlue} />
      <Text
        style={[
          styles.wordmark,
          {
            fontSize,
            color: onBlue ? ON_BLUE_LINES : colors.text,
            letterSpacing: -fontSize * 0.03,
          },
        ]}
      >
        daily
        <Text style={{ color: onBlue ? ON_BLUE_EDGE : colors.logoEdge }}>edge</Text>
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  wordmark: {
    fontFamily: fonts.headingBold,
  },
});
