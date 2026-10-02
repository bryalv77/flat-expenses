import { Children, isValidElement, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { radii, spacing, useTheme } from '@/theme';

import { Text } from './Text';

export interface SectionProps {
  header?: string;
  footer?: string;
  children: ReactNode;
}

/** UITableView.insetGrouped section: rounded card, rows separated by hairlines (inserted by ListRow via `isLast`). */
export function Section({ header, footer, children }: SectionProps) {
  const { colors } = useTheme();
  const items = Children.toArray(children).filter(isValidElement);
  return (
    <View style={styles.wrap}>
      {header ? (
        <Text variant="footnote" color="secondaryLabel" style={styles.header} accessibilityRole="header">
          {header.toUpperCase()}
        </Text>
      ) : null}
      <View style={[styles.card, { backgroundColor: colors.grouped }]}>
        {items.map((child, i) => (
          <View key={child.key ?? i}>
            {child}
            {i < items.length - 1 ? <View style={[styles.sep, { backgroundColor: colors.separator }]} /> : null}
          </View>
        ))}
      </View>
      {footer ? (
        <Text variant="footnote" color="secondaryLabel" style={styles.footer}>
          {footer}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: spacing.xxl },
  header: { marginLeft: spacing.lg, marginBottom: spacing.sm },
  footer: { marginHorizontal: spacing.lg, marginTop: spacing.sm },
  card: { borderRadius: radii.md, overflow: 'hidden' },
  sep: { height: StyleSheet.hairlineWidth, marginLeft: spacing.lg },
});
