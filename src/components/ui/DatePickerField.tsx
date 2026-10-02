import DateTimePicker, { DateTimePickerAndroid, type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { createElement, useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';

import { useT } from '@/i18n';
import { formatDate } from '@/lib/format';
import { parseISODate, toISODate, todayISO } from '@/lib/dates';
import { MIN_TOUCH, fontFamily, radii, spacing, useTheme } from '@/theme';

import { BottomSheet } from './BottomSheet';
import { Button } from './Button';
import { Icon } from './Icon';
import { Text } from './Text';

export interface DatePickerFieldProps {
  /** 'YYYY-MM-DD' or null. */
  value: string | null;
  onChange: (iso: string | null) => void;
  label: string;
  error?: string;
  /** Show a clear button when a value is set (for optional dates). */
  clearable?: boolean;
}

function toDate(iso: string): Date {
  const { y, m, d } = parseISODate(iso);
  return new Date(y, m - 1, d);
}
function fromDate(date: Date): string {
  return toISODate({ y: date.getFullYear(), m: date.getMonth() + 1, d: date.getDate() });
}

export function DatePickerField({ value, onChange, label, error, clearable }: DatePickerFieldProps) {
  const { colors, scheme } = useTheme();
  const { t, locale } = useT();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Date>(toDate(value ?? todayISO()));

  const display = value ? formatDate(value, locale) : t('common.optional');

  const onPress = () => {
    const current = toDate(value ?? todayISO());
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: current,
        mode: 'date',
        onChange: (e: DateTimePickerEvent, d?: Date) => {
          if (e.type === 'set' && d) onChange(fromDate(d));
        },
      });
    } else {
      setDraft(current);
      setOpen(true);
    }
  };

  if (Platform.OS === 'web') {
    return (
      <View style={{ marginBottom: spacing.md }}>
        <View style={[styles.box, { backgroundColor: colors.grouped, borderColor: error ? colors.red : 'transparent' }]}>
          <Text variant="footnote" color="secondaryLabel">
            {label}
          </Text>
          {createElement('input', {
            type: 'date',
            value: value ?? '',
            'aria-label': label,
            onChange: (e: { target: { value: string } }) => onChange(e.target.value || null),
            style: {
              fontFamily,
              fontSize: 17,
              color: colors.label,
              background: 'transparent',
              border: 'none',
              outline: 'none',
              minHeight: MIN_TOUCH - 8,
              colorScheme: scheme,
              width: '100%',
            },
          })}
        </View>
        {error ? (
          <Text variant="footnote" color="red" style={styles.msg}>
            {error}
          </Text>
        ) : null}
      </View>
    );
  }

  return (
    <View style={{ marginBottom: spacing.md }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${display}`}
        onPress={onPress}
        style={[styles.box, { backgroundColor: colors.grouped, borderColor: error ? colors.red : 'transparent' }]}
      >
        <Text variant="footnote" color="secondaryLabel">
          {label}
        </Text>
        <View style={styles.valueRow}>
          <Icon name="calendar" size={18} color={colors.tint} />
          <Text variant="body" color={value ? 'label' : 'tertiaryLabel'} style={{ flex: 1 }}>
            {display}
          </Text>
          {clearable && value ? (
            <Pressable accessibilityLabel="Clear" hitSlop={10} onPress={() => onChange(null)}>
              <Icon name="close" size={16} color={colors.tertiaryLabel} />
            </Pressable>
          ) : null}
        </View>
      </Pressable>
      {error ? (
        <Text variant="footnote" color="red" style={styles.msg}>
          {error}
        </Text>
      ) : null}
      {Platform.OS === 'ios' ? (
        <BottomSheet visible={open} onClose={() => setOpen(false)} title={label}>
          <DateTimePicker value={draft} mode="date" display="inline" themeVariant={scheme} accentColor={colors.tint} onChange={(_, d) => d && setDraft(d)} />
          <Button
            title={t('common.done')}
            onPress={() => {
              onChange(fromDate(draft));
              setOpen(false);
            }}
          />
        </BottomSheet>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { borderRadius: radii.md, borderWidth: 1.5, paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.xs, minHeight: MIN_TOUCH + 12 },
  valueRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: MIN_TOUCH - 8 },
  msg: { marginTop: spacing.xs, marginHorizontal: spacing.lg },
});
