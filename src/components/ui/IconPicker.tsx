import { Pressable, View } from 'react-native';

import { haptics } from '@/lib/haptics';
import { radii, spacing, useTheme } from '@/theme';

import { Icon, categoryIconNames } from './Icon';

export interface IconPickerProps {
  value: string;
  onChange: (name: string) => void;
  /** Tint for the selected icon bubble. */
  color?: string;
}

export function IconPicker({ value, onChange, color }: IconPickerProps) {
  const { colors } = useTheme();
  const accent = color ?? colors.tint;
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, padding: spacing.md, backgroundColor: colors.grouped, borderRadius: radii.md }}>
      {categoryIconNames.map((name) => {
        const selected = name === value;
        return (
          <Pressable
            key={name}
            accessibilityRole="radio"
            accessibilityLabel={name}
            accessibilityState={{ selected }}
            onPress={() => {
              haptics.selection();
              onChange(name);
            }}
            style={{ width: 44, height: 44, borderRadius: radii.sm, alignItems: 'center', justifyContent: 'center', backgroundColor: selected ? accent : colors.secondaryFill }}
          >
            <Icon name={name} size={22} color={selected ? '#FFFFFF' : colors.label} />
          </Pressable>
        );
      })}
    </View>
  );
}
