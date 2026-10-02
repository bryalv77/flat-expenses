import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useMemo, useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { ScrollView, StyleSheet, View } from 'react-native';
import { z } from 'zod';

import {
  Button,
  Chip,
  DatePickerField,
  FilePickerField,
  isIconName,
  MoneyInput,
  Section,
  Text,
  TextField,
  type PickedFile,
} from '@/components/ui';
import { useT } from '@/i18n';
import { compareISO } from '@/lib/dates';
import { spacing, useTheme } from '@/theme';
import type { Bill, ExpenseCategory } from '@/types/domain';

import { BillFilePreview } from './BillFilePreview';

export interface BillFormValues {
  categoryId: string;
  amountCents: number;
  chargeDate: string | null;
  periodStartDate: string | null;
  periodEndDate: string | null;
  notes: string | null;
}

export interface BillFormSubmit {
  values: BillFormValues;
  file: PickedFile | null;
  removeFile: boolean;
}

interface Props {
  categories: ExpenseCategory[];
  initial?: Bill;
  submitLabel: string;
  submitting: boolean;
  /** Upload progress 0..1 while a file is uploading. */
  progress: number | null;
  errorMessage?: string | null;
  onSubmit: (data: BillFormSubmit) => void;
}

export function BillForm({ categories, initial, submitLabel, submitting, progress, errorMessage, onSubmit }: Props) {
  const { t } = useT();
  const { colors } = useTheme();
  const [file, setFile] = useState<PickedFile | null>(null);
  const [removeFile, setRemoveFile] = useState(false);

  const schema = useMemo(
    () =>
      z
        .object({
          categoryId: z.string().min(1, t('expenses.categoryRequired')),
          amountCents: z.number({ message: t('expenses.amountPositive') }).int().positive(t('expenses.amountPositive')),
          chargeDate: z.string().nullable(),
          periodStartDate: z.string().nullable(),
          periodEndDate: z.string().nullable(),
          notes: z.string().max(1000).nullable(),
        })
        .refine((v) => !v.periodStartDate || !v.periodEndDate || compareISO(v.periodStartDate, v.periodEndDate) <= 0, {
          path: ['periodEndDate'],
          message: t('billsUi.invalidPeriod'),
        }),
    [t],
  );

  const { control, handleSubmit, setValue, formState } = useForm<BillFormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      categoryId: initial?.categoryId ?? '',
      amountCents: initial?.amountCents,
      chargeDate: initial?.chargeDate ?? null,
      periodStartDate: initial?.periodStartDate ?? null,
      periodEndDate: initial?.periodEndDate ?? null,
      notes: initial?.notes ?? null,
    },
  });

  const categoryId = useWatch({ control, name: 'categoryId' });
  const selectable = categories.filter((c) => c.isActive || c.id === initial?.categoryId);
  const amountDirty = Boolean(formState.dirtyFields.amountCents);

  // FIXED categories prefill the amount (still editable) unless the user already typed one.
  useEffect(() => {
    if (initial || amountDirty) return;
    const cat = categories.find((c) => c.id === categoryId);
    if (cat?.amountType === 'FIXED' && cat.expectedAmountCents) {
      setValue('amountCents', cat.expectedAmountCents);
    }
  }, [categoryId, categories, initial, amountDirty, setValue]);

  const hasExistingFile = Boolean(initial?.fileStoragePath) && !removeFile && !file;

  return (
    <View style={styles.form}>
      <Controller
        control={control}
        name="categoryId"
        render={({ field, fieldState }) => (
          <View style={styles.block}>
            <Text variant="footnote" color="secondaryLabel">
              {t('expenses.category').toUpperCase()}
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
              {selectable.map((c) => (
                <Chip
                  key={c.id}
                  label={c.name}
                  color={c.color}
                  icon={isIconName(c.icon) ? c.icon : undefined}
                  selected={field.value === c.id}
                  onPress={() => field.onChange(c.id)}
                />
              ))}
            </ScrollView>
            {fieldState.error ? (
              <Text variant="footnote" color="red">
                {fieldState.error.message}
              </Text>
            ) : null}
          </View>
        )}
      />

      <Section>
        <Controller
          control={control}
          name="amountCents"
          render={({ field, fieldState }) => (
            <MoneyInput
              label={t('expenses.amount')}
              value={field.value ?? null}
              onChange={(v) => field.onChange(v ?? undefined)}
              error={fieldState.error?.message}
              inline
            />
          )}
        />
        <Controller
          control={control}
          name="chargeDate"
          render={({ field, fieldState }) => (
            <DatePickerField label={t('expenses.chargeDate')} value={field.value} onChange={field.onChange} error={fieldState.error?.message} clearable />
          )}
        />
        <Controller
          control={control}
          name="periodStartDate"
          render={({ field }) => (
            <DatePickerField label={t('expenses.periodStart')} value={field.value} onChange={field.onChange} clearable />
          )}
        />
        <Controller
          control={control}
          name="periodEndDate"
          render={({ field, fieldState }) => (
            <DatePickerField label={t('expenses.cutoffDate')} value={field.value} onChange={field.onChange} error={fieldState.error?.message} clearable />
          )}
        />
      </Section>

      <View style={styles.block}>
        {hasExistingFile && initial ? (
          <>
            <BillFilePreview bill={initial} />
            <Button title={t('billsUi.removeFile')} variant="plain" destructive onPress={() => setRemoveFile(true)} />
          </>
        ) : null}
        <FilePickerField
          label={hasExistingFile ? t('billsUi.replaceFile') : t('expenses.file')}
          value={file}
          onChange={(f) => {
            setFile(f);
            if (f) setRemoveFile(false);
          }}
        />
        {progress !== null ? (
          <View accessibilityRole="progressbar" style={[styles.track, { backgroundColor: colors.secondaryFill }]}>
            <View style={[styles.bar, { width: `${Math.round(progress * 100)}%`, backgroundColor: colors.tint }]} />
          </View>
        ) : null}
      </View>

      <Controller
        control={control}
        name="notes"
        render={({ field }) => (
          <TextField
            label={t('expenses.notes')}
            value={field.value ?? ''}
            onChangeText={(v) => field.onChange(v.length ? v : null)}
            multiline
          />
        )}
      />

      {errorMessage ? (
        <Text variant="footnote" color="red" accessibilityRole="alert">
          {errorMessage}
        </Text>
      ) : null}
      <Button
        title={errorMessage && file ? t('billsUi.retryUpload') : submitLabel}
        loading={submitting}
        onPress={handleSubmit((values) => onSubmit({ values, file, removeFile }))}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  form: { gap: spacing.lg, paddingHorizontal: spacing.lg },
  block: { gap: spacing.sm },
  chips: { gap: spacing.sm, paddingVertical: spacing.xs },
  track: { height: 6, borderRadius: 3, overflow: 'hidden' },
  bar: { height: 6, borderRadius: 3 },
});
