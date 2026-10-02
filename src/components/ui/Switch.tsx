import { Switch as RNSwitch } from 'react-native';

import { haptics } from '@/lib/haptics';
import { useTheme } from '@/theme';

export interface SwitchProps {
  value: boolean;
  onValueChange: (value: boolean) => void;
  disabled?: boolean;
  accessibilityLabel?: string;
}

/** UISwitch-style (green track). */
export function Switch({ value, onValueChange, disabled, accessibilityLabel }: SwitchProps) {
  const { colors } = useTheme();
  return (
    <RNSwitch
      value={value}
      disabled={disabled}
      accessibilityLabel={accessibilityLabel}
      trackColor={{ false: colors.secondaryFill, true: colors.green }}
      thumbColor="#FFFFFF"
      // @ts-expect-error web-only prop
      activeThumbColor="#FFFFFF"
      ios_backgroundColor={colors.secondaryFill}
      onValueChange={(v) => {
        haptics.selection();
        onValueChange(v);
      }}
    />
  );
}
