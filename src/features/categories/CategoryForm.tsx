import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm } from 'react-hook-form';
import { View } from 'react-native';
import { z } from 'zod';

import { Button, ColorPicker, DatePickerField, IconPicker, ListRow, MoneyInput, Section, SegmentedControl, Switch, TextField } from '@/components/ui';
import { useT } from '@/i18n';
import type { CategoryInput } from '@/lib/db';
import { todayISO } from '@/lib/dates';
import { spacing } from '@/theme';
import type { AmountType, ExpenseCategory, IntervalUnit } from '@/types/domain';

const schema = z
  .object({
    name: z.string().trim().min(1),
    icon: z.string().min(1),
    color: z.string().min(4),
    amountType: z.enum(['FIXED', 'VARIABLE']),
    expectedAmountCents: z.number().int().min(0).nullable(),
    intervalCount: z.number().int().min(1),
    intervalUnit: z.enum(['DAY', 'WEEK', 'MONTH', 'YEAR']),
    anchorDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    isActive: z.boolean(),
    notes: z.string().optional(),
  })
  .superRefine((v, ctx) => {
    if (v.amountType === 'FIXED' && (v.expectedAmountCents === null || v.expectedAmountCents <= 0)) {
      ctx.addIssue({ code: 'custom', path: ['expectedAmountCents'], message: 'required' });
    }
  });
type FormValues = z.infer<typeof schema>;

interface Props {
  initial?: ExpenseCategory;
  submitLabel: string;
  onSubmit: (input: CategoryInput) => Promise<void>;
}

export function CategoryForm({ initial, submitLabel, onSubmit }: Props) {
  const { t } = useT();
  const { control, handleSubmit, watch, formState } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: initial?.name ?? '',
      icon: initial?.icon ?? 'home',
      color: initial?.color ?? '#007AFF',
      amountType: initial?.amountType ?? 'VARIABLE',
      expectedAmountCents: initial?.expectedAmountCents ?? null,
      intervalCount: initial?.intervalCount ?? 1,
      intervalUnit: initial?.intervalUnit ?? 'MONTH',
      anchorDate: initial?.anchorDate ?? todayISO(),
      isActive: initial?.isActive ?? true,
      notes: initial?.notes ?? '',
    },
  });
  const amountType = watch('amountType');
  const color = watch('color');
  const errors = formState.errors;

  const submit = handleSubmit((v) =>
    onSubmit({
      name: v.name,
      icon: v.icon,
      color: v.color,
      amountType: v.amountType,
      expectedAmountCents: v.expectedAmountCents,
      intervalUnit: v.intervalUnit,
      intervalCount: v.intervalCount,
      anchorDate: v.anchorDate,
      isActive: v.isActive,
      notes: v.notes ? v.notes : null,
    }),
  );

  return (
    <View style={{ gap: spacing.lg }}>
      <Section>
        <Controller control={control} name="name" render={({ field }) => <TextField inline label={t('categories.name')} value={field.value} onChangeText={field.onChange} error={errors.name ? t('hub.nameRequired') : undefined} />} />
      </Section>
      <Section header={t('categories.icon')}>
        <View style={{ padding: spacing.md }}>
          <Controller control={control} name="icon" render={({ field }) => <IconPicker value={field.value} onChange={field.onChange} color={color} />} />
        </View>
      </Section>
      <Section header={t('categories.color')}>
        <View style={{ padding: spacing.md }}>
          <Controller control={control} name="color" render={({ field }) => <ColorPicker value={field.value} onChange={field.onChange} />} />
        </View>
      </Section>
      <Controller
        control={control}
        name="amountType"
        render={({ field }) => (
          <SegmentedControl<AmountType>
            value={field.value}
            onChange={field.onChange}
            options={[
              { value: 'FIXED', label: t('categories.fixed') },
              { value: 'VARIABLE', label: t('categories.variable') },
            ]}
          />
        )}
      />
      <Section>
        <Controller
          control={control}
          name="expectedAmountCents"
          render={({ field }) => (
            <MoneyInput inline label={t('categories.expected')} value={field.value} onChange={field.onChange} error={errors.expectedAmountCents ? t('hub.expectedRequired') : undefined} hint={amountType === 'VARIABLE' ? t('common.optional') : undefined} />
          )}
        />
      </Section>
      <Section header={t('categories.every')}>
        <Controller
          control={control}
          name="intervalCount"
          render={({ field }) => (
            <TextField inline label={t('hub.intervalCount')} keyboardType="number-pad" value={String(field.value)} onChangeText={(s) => field.onChange(Math.max(1, Number(s.replace(/\D/g, '')) || 1))} />
          )}
        />
      </Section>
      <Controller
        control={control}
        name="intervalUnit"
        render={({ field }) => (
          <SegmentedControl<IntervalUnit>
            value={field.value}
            onChange={field.onChange}
            options={[
              { value: 'DAY', label: t('categories.days') },
              { value: 'WEEK', label: t('categories.weeks') },
              { value: 'MONTH', label: t('categories.months') },
              { value: 'YEAR', label: t('categories.years') },
            ]}
          />
        )}
      />
      <Section>
        <Controller control={control} name="anchorDate" render={({ field }) => <DatePickerField label={t('categories.anchor')} value={field.value} onChange={(v) => field.onChange(v ?? todayISO())} />} />
        <Controller control={control} name="isActive" render={({ field }) => <ListRow title={t('categories.active')} trailing={<Switch value={field.value} onValueChange={field.onChange} accessibilityLabel={t('categories.active')} />} />} />
      </Section>
      <Section>
        <Controller control={control} name="notes" render={({ field }) => <TextField inline label={t('expenses.notes')} multiline value={field.value ?? ''} onChangeText={field.onChange} />} />
      </Section>
      <Button title={submitLabel} loading={formState.isSubmitting} onPress={submit} />
    </View>
  );
}
