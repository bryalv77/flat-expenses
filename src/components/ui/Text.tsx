import { Text as RNText, type TextProps as RNTextProps } from 'react-native';

import { fontFamily, typography, useTheme, type Palette, type TypographyVariant } from '@/theme';

type ColorKey = keyof Pick<Palette, 'label' | 'secondaryLabel' | 'tertiaryLabel' | 'tint' | 'red' | 'green' | 'orange'>;

export interface TextProps extends RNTextProps {
  variant?: TypographyVariant;
  color?: ColorKey | (string & {});
}

export function Text({ variant = 'body', color = 'label', style, ...rest }: TextProps) {
  const { colors } = useTheme();
  const resolved = (colors as unknown as Record<string, string>)[color] ?? color;
  return <RNText {...rest} style={[{ fontFamily, color: resolved }, typography[variant], style]} />;
}
