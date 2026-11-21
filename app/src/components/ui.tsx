// Shared UI building blocks (buttons, text, cards, chips, fields).
import type { ComponentRef, ReactNode, Ref } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { radius, sizes, spacing, typography, useTheme } from '@/theme';

type Variant = keyof typeof typography;

export function AppText({
  variant = 'body',
  tone = 'primary',
  style,
  children,
  ...rest
}: {
  variant?: Variant;
  tone?: 'primary' | 'secondary' | 'body' | 'link' | 'danger' | 'onPrimary';
  style?: TextStyle | TextStyle[];
  children: ReactNode;
  accessibilityRole?: 'header' | 'text' | 'link';
  accessibilityLabel?: string;
  numberOfLines?: number;
}) {
  const { colors } = useTheme();
  const color = {
    primary: colors.text,
    secondary: colors.textSecondary,
    body: colors.textBody,
    link: colors.link,
    danger: colors.danger,
    onPrimary: colors.onPrimary,
  }[tone];
  return (
    <Text style={[typography[variant], { color }, style]} {...rest}>
      {children}
    </Text>
  );
}

export function Screen({
  children,
  scroll = false,
  footer,
  header,
  scrollRef,
}: {
  children: ReactNode;
  scroll?: boolean;
  footer?: ReactNode;
  header?: ReactNode;
  // Lets a screen scroll to one of its sections (Today's journey and guided tour)
  scrollRef?: Ref<ComponentRef<typeof ScrollView>>;
}) {
  const { colors } = useTheme();
  const body = scroll ? (
    <ScrollView
      ref={scrollRef}
      contentContainerStyle={styles.scrollContent}
      keyboardShouldPersistTaps="handled"
      // Scrolling closes the keyboard (multi-line fields have no "done" key)
      keyboardDismissMode="on-drag"
      showsVerticalScrollIndicator={false}
    >
      {children}
    </ScrollView>
  ) : (
    <View style={styles.content}>{children}</View>
  );
  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      {header ? <View style={styles.header}>{header}</View> : null}
      {body}
      {footer ? <View style={styles.footer}>{footer}</View> : null}
    </SafeAreaView>
  );
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled = false,
  loading = false,
  style,
  accessibilityLabel,
}: {
  label: string;
  // Spoken label when the visible one is ambiguous (e.g. several "Done" buttons)
  accessibilityLabel?: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'ghost';
  disabled?: boolean;
  loading?: boolean;
  style?: ViewStyle;
}) {
  const { colors } = useTheme();
  const inactive = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: inactive, busy: loading }}
      disabled={inactive}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        variant === 'primary' && {
          backgroundColor: pressed ? colors.primaryPressed : colors.primary,
        },
        variant === 'secondary' && {
          backgroundColor: colors.card,
          borderWidth: 1,
          borderColor: colors.border,
        },
        variant === 'ghost' && styles.ghost,
        inactive && styles.disabled,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={variant === 'primary' ? colors.onPrimary : colors.primary} />
      ) : (
        <AppText
          variant="bodyStrong"
          tone={variant === 'primary' ? 'onPrimary' : variant === 'ghost' ? 'secondary' : 'primary'}
        >
          {label}
        </AppText>
      )}
    </Pressable>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  const { colors } = useTheme();
  return (
    <View
      style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }, style]}
    >
      {children}
    </View>
  );
}

export function Chip({
  label,
  selected,
  onPress,
  disabled = false,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  disabled?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.chip,
        {
          borderColor: selected ? colors.primary : colors.border,
          backgroundColor: selected ? colors.primarySoft : colors.card,
        },
        disabled && !selected && styles.disabled,
      ]}
    >
      <AppText variant="bodyStrong">{label}</AppText>
    </Pressable>
  );
}

export function TextField({
  label,
  style,
  ...props
}: TextInputProps & { label?: string; style?: TextStyle }) {
  const { colors } = useTheme();
  return (
    <View style={styles.field}>
      {label ? (
        <AppText variant="caption" tone="secondary">
          {label}
        </AppText>
      ) : null}
      <TextInput
        placeholderTextColor={colors.textSecondary}
        style={[
          typography.body,
          styles.input,
          { color: colors.text, backgroundColor: colors.card, borderColor: colors.border },
          style,
        ]}
        {...props}
      />
    </View>
  );
}

export function ProgressBar({ value }: { value: number }) {
  const { colors } = useTheme();
  const pct = Math.max(0, Math.min(1, value)) * 100;
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: Math.round(pct) }}
      style={[styles.progressTrack, { backgroundColor: colors.border }]}
    >
      <View style={[styles.progressFill, { width: `${pct}%`, backgroundColor: colors.primary }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: { paddingHorizontal: spacing.xl, paddingTop: spacing.md },
  content: { flex: 1, paddingHorizontal: spacing.xl },
  scrollContent: { paddingHorizontal: spacing.xl, paddingBottom: spacing.xl, gap: spacing.lg },
  footer: { paddingHorizontal: spacing.xl, paddingBottom: spacing.lg, gap: spacing.sm },
  button: {
    height: sizes.buttonHeight,
    borderRadius: radius.button,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  ghost: { height: 44, backgroundColor: 'transparent' },
  disabled: { opacity: 0.45 },
  card: { borderRadius: radius.card, borderWidth: 1, padding: spacing.lg, gap: spacing.sm },
  chip: {
    minHeight: 48,
    borderRadius: radius.badge,
    borderWidth: 1.5,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    justifyContent: 'center',
  },
  field: { gap: spacing.xs },
  input: {
    minHeight: 52,
    borderWidth: 1,
    borderRadius: radius.badge,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  progressTrack: { height: 6, borderRadius: 3, overflow: 'hidden' },
  progressFill: { height: 6, borderRadius: 3 },
});
