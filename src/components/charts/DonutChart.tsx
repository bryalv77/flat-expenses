import { Pressable, View } from 'react-native';
import Svg, { Circle, G } from 'react-native-svg';

import { haptics } from '@/lib/haptics';
import { spacing, useTheme } from '@/theme';

import { Text } from '../ui/Text';

export interface DonutSlice {
  key: string;
  label: string;
  value: number;
  color: string;
}

export interface DonutChartProps {
  slices: DonutSlice[];
  size?: number;
  thickness?: number;
  centerLabel?: string;
  centerValue?: string;
  selectedKey?: string | null;
  onSelect?: (key: string) => void;
}

export function DonutChart({ slices, size = 180, thickness = 22, centerLabel, centerValue, selectedKey, onSelect }: DonutChartProps) {
  const { colors } = useTheme();
  const total = slices.reduce((s, x) => s + x.value, 0);
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  const gap = slices.filter((s) => s.value > 0).length > 1 ? 2 : 0;
  let offset = 0;

  return (
    <View style={{ alignItems: 'center' }} accessible accessibilityRole="image" accessibilityLabel={slices.map((s) => `${s.label}: ${total ? Math.round((s.value / total) * 100) : 0}%`).join(', ')}>
      <View style={{ width: size, height: size }}>
        <Svg width={size} height={size}>
          <G rotation={-90} origin={`${size / 2}, ${size / 2}`}>
            <Circle cx={size / 2} cy={size / 2} r={r} stroke={colors.secondaryFill} strokeWidth={thickness} fill="none" />
            {total > 0
              ? slices
                  .filter((s) => s.value > 0)
                  .map((s) => {
                    const len = (s.value / total) * c;
                    const el = (
                      <Circle
                        key={s.key}
                        cx={size / 2}
                        cy={size / 2}
                        r={r}
                        stroke={s.color}
                        strokeWidth={selectedKey === s.key ? thickness + 4 : thickness}
                        strokeDasharray={`${Math.max(0, len - gap)} ${c - Math.max(0, len - gap)}`}
                        strokeDashoffset={-offset}
                        opacity={selectedKey == null || selectedKey === s.key ? 1 : 0.35}
                        fill="none"
                      />
                    );
                    offset += len;
                    return el;
                  })
              : null}
          </G>
        </Svg>
        <View pointerEvents="none" style={{ position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center', paddingHorizontal: thickness + spacing.sm }}>
          {centerValue ? (
            <Text variant="title2" numberOfLines={1} adjustsFontSizeToFit>
              {centerValue}
            </Text>
          ) : null}
          {centerLabel ? (
            <Text variant="footnote" color="secondaryLabel" numberOfLines={1}>
              {centerLabel}
            </Text>
          ) : null}
        </View>
      </View>
      {onSelect ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: spacing.sm, marginTop: spacing.md }}>
          {slices.map((s) => (
            <Pressable
              key={s.key}
              accessibilityRole="button"
              accessibilityLabel={s.label}
              onPress={() => {
                haptics.selection();
                onSelect(s.key);
              }}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 32 }}
            >
              <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: s.color }} />
              <Text variant="footnote">{s.label}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}
