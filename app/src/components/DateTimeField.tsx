import DateTimePicker from '@react-native-community/datetimepicker';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform, Pressable, StyleSheet, View } from 'react-native';

import { localDateString } from '@/features/onboarding/rules';
import { radius, spacing, useTheme } from '@/theme';

import { AppText } from './ui';

function fromIsoDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1);
}

function fromTime(hhmm: string): Date {
  const [h, m] = hhmm.split(':').map(Number);
  const date = new Date();
  date.setHours(h ?? 0, m ?? 0, 0, 0);
  return date;
}

const toTime = (date: Date) =>
  `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;

// iOS: inline calendar; Android: system dialog opened from a button
export function DateField({
  value,
  onChange,
  minimumDate,
  placeholder,
}: {
  value: string | null;
  onChange: (iso: string) => void;
  minimumDate: Date;
  placeholder: string;
}) {
  const { i18n } = useTranslation();
  const { colors, scheme } = useTheme();
  const [open, setOpen] = useState(false);
  const date = value ? fromIsoDate(value) : minimumDate;
  // onValueChange: date picked; onDismiss: Android dialog cancelled
  const pick = (_event: unknown, selected: Date) => {
    setOpen(false);
    onChange(localDateString(selected));
  };
  const dismiss = () => setOpen(false);

  if (Platform.OS === 'ios') {
    return (
      <View style={[styles.box, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <DateTimePicker
          value={date}
          mode="date"
          display="inline"
          minimumDate={minimumDate}
          locale={i18n.language}
          themeVariant={scheme}
          accentColor={colors.primary}
          onValueChange={pick}
        />
      </View>
    );
  }
  return (
    <>
      <Pressable
        accessibilityRole="button"
        onPress={() => setOpen(true)}
        style={[styles.button, { backgroundColor: colors.card, borderColor: colors.border }]}
      >
        <AppText>{value ? date.toLocaleDateString(i18n.language) : placeholder}</AppText>
      </Pressable>
      {open ? (
        <DateTimePicker
          value={date}
          mode="date"
          minimumDate={minimumDate}
          onValueChange={pick}
          onDismiss={dismiss}
        />
      ) : null}
    </>
  );
}

export function TimeField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (hhmm: string) => void;
}) {
  const { colors, scheme } = useTheme();
  const [open, setOpen] = useState(false);
  const pick = (_event: unknown, selected: Date) => {
    setOpen(false);
    onChange(toTime(selected));
  };
  const dismiss = () => setOpen(false);
  return (
    <View style={[styles.timeRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <AppText variant="bodyStrong">{label}</AppText>
      {Platform.OS === 'ios' ? (
        <DateTimePicker
          value={fromTime(value)}
          mode="time"
          display="compact"
          themeVariant={scheme}
          accentColor={colors.primary}
          onValueChange={pick}
          accessibilityLabel={label}
        />
      ) : (
        <>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={label}
            onPress={() => setOpen(true)}
          >
            <AppText tone="link" variant="bodyStrong">
              {value}
            </AppText>
          </Pressable>
          {open ? (
            <DateTimePicker
              value={fromTime(value)}
              mode="time"
              is24Hour
              onValueChange={pick}
              onDismiss={dismiss}
            />
          ) : null}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { borderWidth: 1, borderRadius: radius.card, padding: spacing.sm },
  button: {
    minHeight: 52,
    borderWidth: 1,
    borderRadius: radius.badge,
    paddingHorizontal: spacing.lg,
    justifyContent: 'center',
  },
  timeRow: {
    minHeight: 60,
    borderWidth: 1,
    borderRadius: radius.badge,
    paddingHorizontal: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
});
