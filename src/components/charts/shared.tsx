import { useState } from 'react';
import { type LayoutChangeEvent, View, type ViewStyle } from 'react-native';

/** Measures the available width so SVG charts can be responsive on every platform. */
export function useChartWidth(initial = 320) {
  const [width, setWidth] = useState(initial);
  const onLayout = (e: LayoutChangeEvent) => {
    const w = Math.floor(e.nativeEvent.layout.width);
    if (w > 0 && w !== width) setWidth(w);
  };
  return { width, onLayout };
}

export function ChartFrame({ children, onLayout, style }: { children: React.ReactNode; onLayout: (e: LayoutChangeEvent) => void; style?: ViewStyle }) {
  return (
    <View onLayout={onLayout} style={[{ width: '100%' }, style]}>
      {children}
    </View>
  );
}

/** Round an axis maximum up to 1/2/2.5/5/10 × 10^n so gridlines look tidy. */
export function niceMax(max: number): number {
  if (max <= 0) return 1;
  const exp = Math.pow(10, Math.floor(Math.log10(max)));
  const f = max / exp;
  const nice = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10;
  return nice * exp;
}

export const GRID_LINES = 4;

export function compactLabel(cents: number): string {
  const eur = cents / 100;
  if (Math.abs(eur) >= 1000) return `${Math.round(eur / 100) / 10}k`;
  return String(Math.round(eur));
}
