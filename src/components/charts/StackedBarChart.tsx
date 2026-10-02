import { Pressable, View } from 'react-native';
import Svg, { G, Line, Rect, Text as SvgText } from 'react-native-svg';

import { haptics } from '@/lib/haptics';
import { fontFamily, useTheme } from '@/theme';

import { ChartFrame, GRID_LINES, compactLabel, niceMax, useChartWidth } from './shared';

export interface StackSegment {
  key: string;
  value: number;
  color: string;
}
export interface StackedDatum {
  key: string;
  label: string;
  segments: StackSegment[];
}

export interface StackedBarChartProps {
  data: StackedDatum[];
  height?: number;
  selectedKey?: string | null;
  onSelect?: (key: string) => void;
  accessibilityLabel?: string;
}

const PAD = { top: 10, bottom: 24, left: 34, right: 4 };

export function StackedBarChart({ data, height = 220, selectedKey, onSelect, accessibilityLabel }: StackedBarChartProps) {
  const { colors } = useTheme();
  const { width, onLayout } = useChartWidth();
  const totals = data.map((d) => d.segments.reduce((s, x) => s + x.value, 0));
  const max = niceMax(Math.max(0, ...totals));
  const plotW = width - PAD.left - PAD.right;
  const plotH = height - PAD.top - PAD.bottom;
  const slot = data.length ? plotW / data.length : plotW;
  const barW = Math.min(36, slot * 0.62);
  const scale = (v: number) => (v / max) * plotH;

  return (
    <ChartFrame onLayout={onLayout}>
      <View accessible accessibilityRole="image" accessibilityLabel={accessibilityLabel ?? data.map((d, i) => `${d.label}: ${compactLabel(totals[i])}`).join(', ')}>
        <Svg width={width} height={height}>
          {Array.from({ length: GRID_LINES + 1 }, (_, i) => {
            const v = (max / GRID_LINES) * i;
            const yy = PAD.top + plotH - scale(v);
            return (
              <G key={i}>
                <Line x1={PAD.left} x2={width - PAD.right} y1={yy} y2={yy} stroke={colors.separator} strokeWidth={0.5} />
                <SvgText x={PAD.left - 6} y={yy + 4} fontSize={10} fontFamily={fontFamily} fill={colors.secondaryLabel} textAnchor="end">
                  {compactLabel(v)}
                </SvgText>
              </G>
            );
          })}
          {data.map((d, i) => {
            const x = PAD.left + slot * i + (slot - barW) / 2;
            const dim = selectedKey != null && selectedKey !== d.key;
            let acc = 0;
            return (
              <G key={d.key} opacity={dim ? 0.35 : 1}>
                {d.segments
                  .filter((s) => s.value > 0)
                  .map((s) => {
                    const h = scale(s.value);
                    const yy = PAD.top + plotH - scale(acc) - h;
                    acc += s.value;
                    return <Rect key={s.key} x={x} y={yy} width={barW} height={Math.max(1, h - 1)} fill={s.color} rx={2} />;
                  })}
                <SvgText x={x + barW / 2} y={height - 8} fontSize={10} fontFamily={fontFamily} fill={colors.secondaryLabel} textAnchor="middle">
                  {d.label}
                </SvgText>
              </G>
            );
          })}
        </Svg>
        {onSelect ? (
          <View style={{ position: 'absolute', left: PAD.left, top: 0, width: plotW, height, flexDirection: 'row' }}>
            {data.map((d, i) => (
              <Pressable
                key={d.key}
                accessibilityRole="button"
                accessibilityLabel={`${d.label}: ${compactLabel(totals[i])}`}
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
