import { useRef } from 'react';
import { Pressable, StyleSheet, TextInput, View, type TextInputInstance } from 'react-native';

import { OTP_LENGTH, normalizeOtp } from '@/features/auth/validation';
import { radius, spacing, typography, useTheme } from '@/theme';

import { AppText } from './ui';

// One hidden input (keeps paste and iOS code autofill) rendered as 6 boxes
export function OtpInput({
  value,
  onChange,
  label,
  autoFocus = true,
}: {
  value: string;
  onChange: (code: string) => void;
  label: string;
  autoFocus?: boolean;
}) {
  const { colors } = useTheme();
  const input = useRef<TextInputInstance>(null);
  return (
    <Pressable onPress={() => input.current?.focus()} accessible={false}>
      <View style={styles.row}>
        {Array.from({ length: OTP_LENGTH }, (_, i) => {
          const active = i === Math.min(value.length, OTP_LENGTH - 1);
          return (
            <View
              key={i}
              style={[
                styles.box,
                {
                  backgroundColor: colors.card,
                  borderColor: active ? colors.primary : colors.border,
                },
              ]}
            >
              <AppText variant="title">{value[i] ?? ''}</AppText>
            </View>
          );
        })}
      </View>
      <TextInput
        ref={input}
        value={value}
        onChangeText={(text) => onChange(normalizeOtp(text))}
        autoFocus={autoFocus}
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoComplete="one-time-code"
        maxLength={OTP_LENGTH + 4}
        accessibilityLabel={label}
        caretHidden
        style={[typography.body, styles.hidden]}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm },
  box: {
    flex: 1,
    aspectRatio: 0.85,
    maxWidth: 56,
    borderWidth: 1.5,
    borderRadius: radius.badge,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Kept focusable but invisible
  hidden: { position: 'absolute', width: 1, height: 1, opacity: 0 },
});
