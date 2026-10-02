import { forwardRef, useState } from 'react';
import { StyleSheet, TextInput, View, type TextInputProps } from 'react-native';

import { MIN_TOUCH, fontFamily, radii, spacing, useTheme } from '@/theme';

import { Text } from './Text';

export interface TextFieldProps extends Omit<TextInputProps, 'style'> {
  label?: string;
  error?: string;
  hint?: string;
  /** Label to the left of the input (iOS settings style) instead of above. */
  inline?: boolean;
}

/** Works with react-hook-form via `<Controller render={({field}) => <TextField value={field.value} onChangeText={field.onChange} onBlur={field.onBlur} />}`. */
export const TextField = forwardRef<TextInput, TextFieldProps>(function TextField({ label, error, hint, inline, multiline, ...rest }, ref) {
  const { colors } = useTheme();
  const [focused, setFocused] = useState(false);
  const input = (
    <TextInput
      ref={ref}
      {...rest}
      multiline={multiline}
      accessibilityLabel={rest.accessibilityLabel ?? label}
      placeholderTextColor={colors.tertiaryLabel}
      onFocus={(e) => {
        setFocused(true);
        rest.onFocus?.(e);
      }}
      onBlur={(e) => {
        setFocused(false);
        rest.onBlur?.(e);
      }}
      selectionColor={colors.tint}
      style={[
        styles.input,
        { color: colors.label, fontFamily, textAlign: inline ? 'right' : 'left' },
        multiline && { minHeight: 88, textAlignVertical: 'top', paddingTop: spacing.md },
        // Remove the default focus ring on web; we draw our own border.
        { outlineStyle: 'none' } as object,
      ]}
    />
  );

  return (
    <View style={{ marginBottom: spacing.md }}>
      <View
        style={[
          styles.box,
          { backgroundColor: colors.grouped, borderColor: error ? colors.red : focused ? colors.tint : 'transparent' },
          inline && styles.inlineBox,
        ]}
      >
        {label ? (
          <Text variant={inline ? 'body' : 'footnote'} color="secondaryLabel" style={inline ? styles.inlineLabel : styles.label}>
            {label}
          </Text>
        ) : null}
        {input}
      </View>
      {error ? (
        <Text variant="footnote" color="red" style={styles.msg} accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : hint ? (
        <Text variant="footnote" color="secondaryLabel" style={styles.msg}>
          {hint}
        </Text>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  box: { borderRadius: radii.md, borderWidth: 1.5, paddingHorizontal: spacing.lg, paddingTop: spacing.sm, minHeight: MIN_TOUCH + 12 },
  inlineBox: { flexDirection: 'row', alignItems: 'center', paddingTop: 0 },
  label: { marginBottom: 0 },
  inlineLabel: { marginRight: spacing.md },
  input: { fontSize: 17, minHeight: MIN_TOUCH - 8, paddingVertical: spacing.xs, flex: 1 },
  msg: { marginTop: spacing.xs, marginHorizontal: spacing.lg },
});
