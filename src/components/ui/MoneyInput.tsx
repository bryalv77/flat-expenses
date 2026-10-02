import { useEffect, useRef, useState } from 'react';

import { centsToInputString, parseMoneyToCents } from '@/lib/format';
import { useT } from '@/i18n';

import { TextField } from './TextField';

export interface MoneyInputProps {
  /** Integer cents, or null when empty/invalid. */
  value: number | null;
  onChange: (cents: number | null) => void;
  label?: string;
  error?: string;
  hint?: string;
  inline?: boolean;
  placeholder?: string;
}

/** Cents-safe EUR input. Never touches floats: text <-> cents goes through the shared format helpers. */
export function MoneyInput({ value, onChange, label, error, hint, inline, placeholder = '0,00' }: MoneyInputProps) {
  const { locale } = useT();
  const [text, setText] = useState(value == null ? '' : centsToInputString(value, locale));
  const lastEmitted = useRef<number | null>(value);

  // Sync when the parent changes the value externally (e.g. prefill from a category).
  useEffect(() => {
    if (value !== lastEmitted.current) {
      lastEmitted.current = value;
      setText(value == null ? '' : centsToInputString(value, locale));
    }
  }, [value, locale]);

  return (
    <TextField
      label={label}
      error={error}
      hint={hint}
      inline={inline}
      placeholder={placeholder}
      keyboardType="decimal-pad"
      inputMode="decimal"
      value={text}
      onChangeText={(next) => {
        const cleaned = next.replace(/[^\d.,]/g, '');
        setText(cleaned);
        const cents = cleaned === '' ? null : parseMoneyToCents(cleaned, locale);
        lastEmitted.current = cents;
        onChange(cents);
      }}
      onBlur={() => {
        if (lastEmitted.current != null) setText(centsToInputString(lastEmitted.current, locale));
      }}
    />
  );
}
