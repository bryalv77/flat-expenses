import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';

import { useT } from '@/i18n';
import { formatFileSize } from '@/lib/format';
import { radii, spacing, useTheme } from '@/theme';

import { Icon } from './Icon';
import type { FilePickerFieldProps, PickedFile } from './FilePickerField';
import { Text } from './Text';

/** Web-only: drag & drop / click-to-browse with an immediate preview. */
export function FileDropzone({ value, onChange, label, error, imageOnly }: FilePickerFieldProps) {
  const { colors } = useTheme();
  const { t } = useT();
  const inputRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const owned = useRef<string | null>(null);

  // Revoke object URLs we created when replaced/unmounted.
  useEffect(() => {
    return () => {
      if (owned.current) URL.revokeObjectURL(owned.current);
    };
  }, []);

  const accept = imageOnly ? 'image/*' : 'application/pdf,image/*';

  const take = (file: File | undefined) => {
    if (!file) return;
    const ok = file.type.startsWith('image/') || (!imageOnly && file.type === 'application/pdf');
    if (!ok) return;
    if (owned.current) URL.revokeObjectURL(owned.current);
    const uri = URL.createObjectURL(file);
    owned.current = uri;
    const picked: PickedFile = { uri, name: file.name, mimeType: file.type, size: file.size };
    onChange(picked);
  };

  const clear = () => {
    if (owned.current) URL.revokeObjectURL(owned.current);
    owned.current = null;
    if (inputRef.current) inputRef.current.value = '';
    onChange(null);
  };

  const isImage = value?.mimeType.startsWith('image/');
  const borderColor = error ? colors.red : over ? colors.tint : colors.tertiaryLabel;

  return (
    <View style={{ marginBottom: spacing.md }}>
      <div
        role="button"
        tabIndex={0}
        aria-label={label}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          take(e.dataTransfer.files?.[0]);
        }}
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: spacing.sm,
          minHeight: 140,
          padding: spacing.md,
          cursor: 'pointer',
          boxSizing: 'border-box',
          borderRadius: radii.md,
          border: `2px dashed ${borderColor}`,
          backgroundColor: over ? colors.secondaryFill : colors.grouped,
        }}
      >
        <input ref={inputRef} type="file" accept={accept} style={{ display: 'none' }} onChange={(e) => take(e.target.files?.[0])} />
        {value ? (
          <>
            {isImage ? (
              <img src={value.uri} alt={value.name} style={{ maxWidth: '100%', maxHeight: 220, borderRadius: radii.sm, objectFit: 'contain' }} />
            ) : (
              <object data={value.uri} type="application/pdf" style={{ width: '100%', height: 260, borderRadius: radii.sm }}>
                <Icon name="document" size={32} color={colors.red} />
              </object>
            )}
            <Text variant="body" numberOfLines={1}>
              {value.name}
            </Text>
            {value.size != null ? (
              <Text variant="footnote" color="secondaryLabel">
                {formatFileSize(value.size)}
              </Text>
            ) : null}
            <button
              type="button"
              aria-label={t('common.delete')}
              onClick={(e) => {
                e.stopPropagation();
                clear();
              }}
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}
            >
              <Icon name="close" size={18} color={colors.tertiaryLabel} />
            </button>
          </>
        ) : (
          <>
            <Icon name="plus" size={24} color={colors.tint} />
            <Text variant="body" color="tint">
              {label}
            </Text>
            <Text variant="footnote" color="secondaryLabel">
              {t('expenses.dropHint')}
            </Text>
          </>
        )}
      </div>
      {error ? (
        <Text variant="footnote" color="red" style={{ marginTop: spacing.xs, marginHorizontal: spacing.lg }}>
          {error}
        </Text>
      ) : null}
    </View>
  );
}
