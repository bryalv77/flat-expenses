import { Image } from 'expo-image';
import { View } from 'react-native';

import { useTheme } from '@/theme';

import { Text } from './Text';

export interface AvatarProps {
  name?: string | null;
  /** Resolved download URL (not a storage path). */
  uri?: string | null;
  size?: number;
}

function initials(name?: string | null): string {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

export function Avatar({ name, uri, size = 40 }: AvatarProps) {
  const { colors } = useTheme();
  const box = { width: size, height: size, borderRadius: size / 2 };
  if (uri) {
    return <Image source={{ uri }} style={box} contentFit="cover" accessibilityLabel={name ?? 'avatar'} transition={150} />;
  }
  return (
    <View style={[box, { backgroundColor: colors.secondaryFill, alignItems: 'center', justifyContent: 'center' }]} accessibilityLabel={name ?? 'avatar'}>
      <Text variant="headline" color="secondaryLabel" style={{ fontSize: size * 0.4, lineHeight: size * 0.5 }}>
        {initials(name)}
      </Text>
    </View>
  );
}
