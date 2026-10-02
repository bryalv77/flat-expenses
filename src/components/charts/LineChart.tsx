import { Pressable, View } from 'react-native';
import Svg, { Circle, G, Line, Path, Text as SvgText } from 'react-native-svg';

import { haptics } from '@/lib/haptics';
import { fontFamily, useTheme } from '@/theme';

import { ChartFrame, GRID_LINES, compactLabel, niceMax, useChartWidth } from './shared';

export interface LineSeries {
  key: string;
  label: string;
  color: string;
  /** One value (cents) per x label; null leaves a gap. */
  values: Array<number | null>;
  dashed?: boolean;
}

export interface LineChartProps {
  xLabels: string[];
  series: LineSeries[];
  height?: number;
  selectedIndex?: number | null;
  onSelect?: (index: number) => void;
  accessibilityLabel?: string;
}

const PAD = { top: 10, bottom: 24, left: 34, right: 10 };

export function LineChart({ xLabels, series, height = 200, selectedIndex, onSelect, accessibilityLabel }: LineChartProps) {
  const { colors } = useTheme();
  const { width, onLayout } = useChartWidth();
  const all = series.flatMap((s) => s.values).filter((v): v is number => v != null);
  const max = niceMax(Math.max(0, ...all));
  const plotW = width - PAD.left - PAD.right;
  const plotH = height - PAD.top - PAD.bottom;
  const n = xLabels.length;
  const x = (i: number) => PAD.left + (n <= 1 ? plotW / 2 : (plotW * i) / (n - 1));
  const y = (v: number) => PAD.top + plotH - (v / max) * plotH;
  const labelEvery = Math.max(1, Math.ceil(n / Math.max(1, Math.floor(plotW / 38))));

  const pathFor = (values: Array<number | null>) => {
    let d = '';
    let pen = false;
    values.forEach((v, i) => {
      if (v == null) {
        pen = false;
        return;
      }
      d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)} `;
      pen = true;
    });
    return d.trim();
  };

  return (
    <ChartFrame onLayout={onLayout}>
      <View accessible accessibilityRole="image" accessibilityLabel={accessibilityLabel ?? series.map((s) => s.label).join(', ')}>
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
          {xLabels.map((l, i) =>
            i % labelEvery === 0 ? (
              <SvgText key={i} x={x(i)} y={height - 8} fontSize={10} fontFamily={fontFamily} fill={colors.secondaryLabel} textAnchor="middle">
                {l}
              </SvgText>
            ) : null,
          )}
          {selectedIndex != null ? <Line x1={x(selectedIndex)} x2={x(selectedIndex)} y1={PAD.top} y2={PAD.top + plotH} stroke={colors.tertiaryLabel} strokeWidth={1} strokeDasharray="3 3" /> : null}
          {series.map((s) => (
            <G key={s.key}>
              <Path d={pathFor(s.values)} stroke={s.color} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" fill="none" strokeDasharray={s.dashed ? '6 5' : undefined} />
              {s.values.map((v, i) => (v != null && (n <= 14 || i === selectedIndex) ? <Circle key={i} cx={x(i)} cy={y(v)} r={selectedIndex === i ? 5 : 3} fill={s.color} /> : null))}
            </G>
          ))}
        </Svg>
        {onSelect ? (
          <View style={{ position: 'absolute', left: PAD.left - 10, top: 0, width: plotW + 20, height, flexDirection: 'row' }}>
            {xLabels.map((l, i) => (
              <Pressable
                key={i}
                accessibilityRole="button"
                accessibilityLabel={l}
                style={{ flex: 1 }}
                onPress={() => {
                  haptics.selection();
                  onSelect(i);
                }}
              />
            ))}
          </View>
        ) : null}
      </View>
    </ChartFrame>
  );
}
