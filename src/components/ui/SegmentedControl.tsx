import { Pressable, StyleSheet, View } from 'react-native';

import { haptics } from '@/lib/haptics';
import { MIN_TOUCH, radii, spacing, useTheme } from '@/theme';

import { Text } from './Text';

export interface SegmentedControlProps<T extends string> {
  options: ReadonlyArray<{ value: T; label: string }>;
  value: T;
  onChange: (value: T) => void;
}

export function SegmentedControl<T extends string>({ options, value, onChange }: SegmentedControlProps<T>) {
  const { colors, scheme } = useTheme();
  return (
    <View style={[styles.track, { backgroundColor: scheme === 'dark' ? colors.grouped : '#7676801F' }]} accessibilityRole="tablist">
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            onPress={() => {
              if (!selected) {
                haptics.selection();
                onChange(o.value);
              }
            }}
            style={[styles.seg, selected && { backgroundColor: scheme === 'dark' ? colors.elevated : '#FFFFFF', shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 3, shadowOffset: { width: 0, height: 1 } }]}
          >
            <Text variant="subhead" style={{ fontWeight: selected ? '600' : '400' }} numberOfLines={1}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: { flexDirection: 'row', borderRadius: radii.sm - 2, padding: 2 },
  seg: { flex: 1, minHeight: MIN_TOUCH - 12, alignItems: 'center', justifyContent: 'center', borderRadius: radii.sm - 4, paddingHorizontal: spacing.sm },
});
