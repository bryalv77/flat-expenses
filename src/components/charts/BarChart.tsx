import { Pressable, View } from 'react-native';
import Svg, { G, Line, Rect, Text as SvgText } from 'react-native-svg';

import { haptics } from '@/lib/haptics';
import { fontFamily, useTheme } from '@/theme';

import { ChartFrame, GRID_LINES, compactLabel, niceMax, useChartWidth } from './shared';

export interface BarDatum {
  key: string;
  label: string;
  /** Integer cents. */
  value: number;
  color?: string;
}

export interface BarChartProps {
  data: BarDatum[];
  height?: number;
  selectedKey?: string | null;
  onSelect?: (key: string) => void;
  accessibilityLabel?: string;
  formatValue?: (cents: number) => string;
}

const PAD = { top: 10, bottom: 24, left: 34, right: 4 };

export function BarChart({ data, height = 200, selectedKey, onSelect, accessibilityLabel, formatValue }: BarChartProps) {
  const { colors } = useTheme();
  const { width, onLayout } = useChartWidth();
  const max = niceMax(Math.max(0, ...data.map((d) => d.value)));
  const plotW = width - PAD.left - PAD.right;
  const plotH = height - PAD.top - PAD.bottom;
  const slot = data.length ? plotW / data.length : plotW;
  const barW = Math.min(36, slot * 0.62);
  const y = (v: number) => PAD.top + plotH - (v / max) * plotH;

  return (
    <ChartFrame onLayout={onLayout}>
      <View accessible accessibilityRole="image" accessibilityLabel={accessibilityLabel ?? data.map((d) => `${d.label}: ${(formatValue ?? compactLabel)(d.value)}`).join(', ')}>
        <Svg width={width} height={height}>
          {Array.from({ length: GRID_LINES + 1 }, (_, i) => {
            const v = (max / GRID_LINES) * i;
            return (
              <G key={i}>
                <Line x1={PAD.left} x2={width - PAD.right} y1={y(v)} y2={y(v)} stroke={colors.separator} strokeWidth={0.5} />
                <SvgText x={PAD.left - 6} y={y(v) + 4} fontSize={10} fontFamily={fontFamily} fill={colors.secondaryLabel} textAnchor="end">
                  {compactLabel(v)}
                </SvgText>
              </G>
            );
          })}
          {data.map((d, i) => {
            const x = PAD.left + slot * i + (slot - barW) / 2;
            const selected = selectedKey == null || selectedKey === d.key;
            const h = Math.max(d.value > 0 ? 2 : 0, plotH - (y(d.value) - PAD.top));
            return (
              <G key={d.key}>
                <Rect x={x} y={PAD.top + plotH - h} width={barW} height={h} rx={4} fill={d.color ?? colors.tint} opacity={selected ? 1 : 0.35} />
                <SvgText x={x + barW / 2} y={height - 8} fontSize={10} fontFamily={fontFamily} fill={colors.secondaryLabel} textAnchor="middle">
                  {d.label}
                </SvgText>
              </G>
            );
          })}
        </Svg>
        {onSelect ? (
          <View style={{ position: 'absolute', left: PAD.left, top: 0, width: plotW, height, flexDirection: 'row' }}>
            {data.map((d) => (
              <Pressable
                key={d.key}
                accessibilityRole="button"
                accessibilityLabel={`${d.label}: ${(formatValue ?? compactLabel)(d.value)}`}
                style={{ flex: 1 }}
                onPress={() => {
                  haptics.selection();
                  onSelect(d.key);
                }}
              />
            ))}
          </View>
        ) : null}
      </View>
    </ChartFrame>
  );
}
