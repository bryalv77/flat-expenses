import { View } from 'react-native';

import { spacing, useTheme } from '@/theme';

import { Button } from './Button';
import { Icon, type IconName } from './Icon';
import { Text } from './Text';

export interface EmptyStateProps {
  icon?: IconName;
  title: string;
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function EmptyState({ icon = 'tag', title, message, actionLabel, onAction }: EmptyStateProps) {
  const { colors } = useTheme();
  return (
    <View style={{ alignItems: 'center', padding: spacing.xxxl, gap: spacing.sm }}>
      <Icon name={icon} size={44} color={colors.tertiaryLabel} />
      <Text variant="title3" style={{ textAlign: 'center' }}>
        {title}
      </Text>
      {message ? (
        <Text variant="subhead" color="secondaryLabel" style={{ textAlign: 'center' }}>
          {message}
        </Text>
      ) : null}
      {actionLabel && onAction ? (
        <View style={{ marginTop: spacing.md }}>
          <Button title={actionLabel} onPress={onAction} variant="tinted" fullWidth={false} />
        </View>
      ) : null}
    </View>
  );
}
