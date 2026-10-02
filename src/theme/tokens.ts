import { Platform } from 'react-native';

export type ColorScheme = 'light' | 'dark';

export interface Palette {
  background: string;
  grouped: string;
  elevated: string;
  secondaryFill: string;
  label: string;
  secondaryLabel: string;
  tertiaryLabel: string;
  separator: string;
  tint: string;
  tintOnFilled: string;
  red: string;
  green: string;
  orange: string;
  yellow: string;
  blue: string;
  indigo: string;
  purple: string;
  pink: string;
  teal: string;
  gray: string;
  blur: 'light' | 'dark';
  overlay: string;
}

export const palettes: Record<ColorScheme, Palette> = {
  light: {
    background: '#F2F2F7',
    grouped: '#FFFFFF',
    elevated: '#FFFFFF',
    secondaryFill: '#E5E5EA',
    label: '#000000',
    secondaryLabel: 'rgba(60,60,67,0.6)',
    tertiaryLabel: 'rgba(60,60,67,0.3)',
    separator: 'rgba(60,60,67,0.29)',
    tint: '#007AFF',
    tintOnFilled: '#FFFFFF',
    red: '#FF3B30',
    green: '#34C759',
    orange: '#FF9500',
    yellow: '#FFCC00',
    blue: '#007AFF',
    indigo: '#5856D6',
    purple: '#AF52DE',
    pink: '#FF2D55',
    teal: '#30B0C7',
    gray: '#8E8E93',
    blur: 'light',
    overlay: 'rgba(0,0,0,0.4)',
  },
  dark: {
    background: '#000000',
    grouped: '#1C1C1E',
    elevated: '#2C2C2E',
    secondaryFill: '#2C2C2E',
    label: '#FFFFFF',
    secondaryLabel: 'rgba(235,235,245,0.6)',
    tertiaryLabel: 'rgba(235,235,245,0.3)',
    separator: 'rgba(84,84,88,0.65)',
    tint: '#0A84FF',
    tintOnFilled: '#FFFFFF',
    red: '#FF453A',
    green: '#30D158',
    orange: '#FF9F0A',
    yellow: '#FFD60A',
    blue: '#0A84FF',
    indigo: '#5E5CE6',
    purple: '#BF5AF2',
    pink: '#FF375F',
    teal: '#40C8E0',
    gray: '#8E8E93',
    blur: 'dark',
    overlay: 'rgba(0,0,0,0.6)',
  },
};

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, xxxl: 32 } as const;
export const radii = { sm: 10, md: 12, lg: 16, xl: 24 } as const;

export const fontFamily = Platform.select({
  web: '-apple-system, BlinkMacSystemFont, "SF Pro Text", Inter, system-ui, sans-serif',
  default: 'System',
}) as string;

export const typography = {
  largeTitle: { fontSize: 34, lineHeight: 41, fontWeight: '700' },
  title1: { fontSize: 28, lineHeight: 34, fontWeight: '700' },
  title2: { fontSize: 22, lineHeight: 28, fontWeight: '700' },
  title3: { fontSize: 20, lineHeight: 25, fontWeight: '600' },
  headline: { fontSize: 17, lineHeight: 22, fontWeight: '600' },
  body: { fontSize: 17, lineHeight: 22, fontWeight: '400' },
  callout: { fontSize: 16, lineHeight: 21, fontWeight: '400' },
  subhead: { fontSize: 15, lineHeight: 20, fontWeight: '400' },
  footnote: { fontSize: 13, lineHeight: 18, fontWeight: '400' },
  caption: { fontSize: 12, lineHeight: 16, fontWeight: '400' },
} as const;

export type TypographyVariant = keyof typeof typography;

/** iOS system colors usable by the ColorPicker for category colors. */
export const categoryColors = [
  '#FF3B30',
  '#FF9500',
  '#FFCC00',
  '#34C759',
  '#30B0C7',
  '#007AFF',
  '#5856D6',
  '#AF52DE',
  '#FF2D55',
  '#A2845E',
  '#8E8E93',
  '#00C7BE',
] as const;

export const MAX_CONTENT_WIDTH = 720;
export const WIDE_BREAKPOINT = 1024;
export const MIN_TOUCH = 44;
