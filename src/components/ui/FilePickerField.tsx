import * as DocumentPicker from 'expo-document-picker';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';

import { useT } from '@/i18n';
import { formatFileSize } from '@/lib/format';
import { MIN_TOUCH, radii, spacing, useTheme } from '@/theme';

import { ActionSheet } from './ActionSheet';
import { FileDropzone } from './FileDropzone';
import { Icon } from './Icon';
import { Text } from './Text';

export interface PickedFile {
  uri: string;
  name: string;
  mimeType: string;
  size: number | null;
}

export interface FilePickerFieldProps {
  value: PickedFile | null;
  onChange: (file: PickedFile | null) => void;
  label: string;
  error?: string;
  /** Disallow PDFs (e.g. avatars). */
  imageOnly?: boolean;
}

function fromImageAsset(a: ImagePicker.ImagePickerAsset): PickedFile {
  const mimeType = a.mimeType ?? 'image/jpeg';
  const ext = mimeType.split('/')[1] ?? 'jpg';
  return { uri: a.uri, name: a.fileName ?? `photo-${Date.now()}.${ext}`, mimeType, size: a.fileSize ?? null };
}

export function FilePickerField({ value, onChange, label, error, imageOnly }: FilePickerFieldProps) {
  const { colors } = useTheme();
  const { t } = useT();
  const [sheet, setSheet] = useState(false);

  const fromCamera = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) return;
    const res = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 1 });
    if (!res.canceled && res.assets[0]) onChange(fromImageAsset(res.assets[0]));
  };
  const fromLibrary = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1, allowsEditing: !!imageOnly, aspect: imageOnly ? [1, 1] : undefined });
    if (!res.canceled && res.assets[0]) onChange(fromImageAsset(res.assets[0]));
  };
  const fromFiles = async () => {
    const res = await DocumentPicker.getDocumentAsync({ type: ['application/pdf', 'image/*'], copyToCacheDirectory: true });
    if (!res.canceled && res.assets[0]) {
      const a = res.assets[0];
      onChange({ uri: a.uri, name: a.name, mimeType: a.mimeType ?? 'application/octet-stream', size: a.size ?? null });
    }
  };

  const options = [
    ...(Platform.OS !== 'web' ? [{ label: t('expenses.takePhoto'), onPress: () => void fromCamera() }] : []),
    { label: t('expenses.library'), onPress: () => void fromLibrary() },
    ...(!imageOnly ? [{ label: t('expenses.files'), onPress: () => void fromFiles() }] : []),
  ];
  const isImage = value?.mimeType.startsWith('image/');

  if (Platform.OS === 'web') {
    return <FileDropzone value={value} onChange={onChange} label={label} error={error} imageOnly={imageOnly} />;
  }

  return (
    <View style={{ marginBottom: spacing.md }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        onPress={() => setSheet(true)}
        style={[styles.box, { backgroundColor: colors.grouped, borderColor: error ? colors.red : 'transparent' }]}
      >
        {value ? (
          <>
            {isImage ? (
              <Image source={{ uri: value.uri }} style={styles.thumb} contentFit="cover" />
            ) : (
              <View style={[styles.thumb, { backgroundColor: colors.secondaryFill, alignItems: 'center', justifyContent: 'center' }]}>
                <Icon name="document" size={24} color={colors.red} />
              </View>
            )}
            <View style={{ flex: 1 }}>
              <Text variant="body" numberOfLines={1}>
                {value.name}
              </Text>
              {value.size != null ? (
                <Text variant="footnote" color="secondaryLabel">
                  {formatFileSize(value.size)}
                </Text>
              ) : null}
            </View>
            <Pressable accessibilityLabel={t('common.delete')} hitSlop={12} onPress={() => onChange(null)}>
              <Icon name="close" size={18} color={colors.tertiaryLabel} />
            </Pressable>
          </>
        ) : (
          <>
            <Icon name="plus" size={20} color={colors.tint} />
            <Text variant="body" color="tint">
              {label}
            </Text>
          </>
        )}
      </Pressable>
      {error ? (
        <Text variant="footnote" color="red" style={{ marginTop: spacing.xs, marginHorizontal: spacing.lg }}>
          {error}
        </Text>
      ) : null}
      <ActionSheet visible={sheet} onClose={() => setSheet(false)} title={label} options={options} cancelLabel={t('common.cancel')} />
    </View>
  );
}

const styles = StyleSheet.create({
  box: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, borderRadius: radii.md, borderWidth: 1.5, padding: spacing.md, minHeight: MIN_TOUCH + 12 },
  thumb: { width: 48, height: 48, borderRadius: radii.sm - 2 },
});
