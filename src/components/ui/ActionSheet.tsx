import { Pressable, StyleSheet, View } from 'react-native';

import { useT } from '@/i18n';
import { haptics } from '@/lib/haptics';
import { MIN_TOUCH, radii, spacing, useTheme } from '@/theme';

import { BottomSheet } from './BottomSheet';
import { Text } from './Text';

export interface ActionSheetOption {
  label: string;
  onPress: () => void;
  destructive?: boolean;
}

export interface ActionSheetProps {
  visible: boolean;
  onClose: () => void;
  title?: string;
  message?: string;
  options: ActionSheetOption[];
}

export function ActionSheet({ visible, onClose, title, message, options }: ActionSheetProps) {
  const { colors } = useTheme();
  const { t } = useT();
  return (
    <BottomSheet visible={visible} onClose={onClose} title={title}>
      {message ? (
        <Text variant="footnote" color="secondaryLabel" style={{ textAlign: 'center', marginBottom: spacing.md }}>
          {message}
        </Text>
      ) : null}
      <View style={[styles.group, { backgroundColor: colors.grouped }]}>
        {options.map((o, i) => (
          <Pressable
            key={o.label}
            accessibilityRole="button"
            onPress={() => {
              haptics.selection();
              onClose();
              o.onPress();
            }}
            style={[styles.item, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.separator }]}
          >
            <Text variant="title3" color={o.destructive ? 'red' : 'tint'} style={{ fontWeight: '400' }}>
              {o.label}
            </Text>
          </Pressable>
        ))}
      </View>
      <Pressable accessibilityRole="button" onPress={onClose} style={[styles.group, styles.item, { backgroundColor: colors.grouped, marginTop: spacing.sm }]}>
        <Text variant="title3" color="tint" style={{ fontWeight: '600' }}>
          {t('common.cancel')}
        </Text>
      </Pressable>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  group: { borderRadius: radii.lg, overflow: 'hidden' },
  item: { minHeight: MIN_TOUCH + 10, alignItems: 'center', justifyContent: 'center' },
});
