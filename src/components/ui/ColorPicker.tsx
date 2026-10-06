import { Pressable, View } from 'react-native';

import { haptics } from '@/lib/haptics';
import { categoryColors, spacing, useTheme } from '@/theme';

import { Icon } from './Icon';

export interface ColorPickerProps {
  value: string;
  onChange: (hex: string) => void;
  colors?: readonly string[];
}

export function ColorPicker({ value, onChange, colors: palette = categoryColors }: ColorPickerProps) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, padding: spacing.lg, backgroundColor: colors.grouped, borderRadius: 12 }}>
      {palette.map((hex) => {
        const selected = hex.toLowerCase() === value.toLowerCase();
        return (
          <Pressable
            key={hex}
            accessibilityRole="radio"
            accessibilityLabel={hex}
            accessibilityState={{ selected }}
            onPress={() => {
              haptics.selection();
              onChange(hex);
            }}
            style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: hex, alignItems: 'center', justifyContent: 'center', borderWidth: selected ? 3 : 0, borderColor: colors.grouped, boxShadow: selected ? `0 0 6px ${hex}99` : undefined }}
          >
            {selected ? <Icon name="check" size={18} color="#FFFFFF" /> : null}
          </Pressable>
        );
      })}
    </View>
  );
}
