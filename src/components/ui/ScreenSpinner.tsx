import { ActivityIndicator, StyleSheet } from 'react-native';

import { spacing, useTheme } from '@/theme';

import { Screen } from './Screen';

/** A screen that is just a loading indicator. */
export function ScreenSpinner() {
  const { colors } = useTheme();
  return (
    <Screen>
      <ActivityIndicator color={colors.tint} style={styles.spinner} />
    </Screen>
  );
}

const styles = StyleSheet.create({ spinner: { marginTop: spacing.xxxl } });
