import { Image } from 'expo-image';
import * as WebBrowser from 'expo-web-browser';
import { ActivityIndicator, Linking, Platform, StyleSheet, View } from 'react-native';

import { Button, Card, Text } from '@/components/ui';
import { useT } from '@/i18n';
import { formatFileSize } from '@/lib/format';
import { useFileUrl } from '@/lib/useFileUrl';
import { radii, spacing, useTheme } from '@/theme';
import type { Bill } from '@/types/domain';

/** Inline preview: images via expo-image, PDFs in an iframe on web and in the system browser on native. */
export function BillFilePreview({ bill }: { bill: Pick<Bill, 'fileStoragePath' | 'fileName' | 'fileMimeType' | 'fileSizeBytes'> }) {
  const { t } = useT();
  const { colors } = useTheme();
  const url = useFileUrl(bill.fileStoragePath);

  if (!bill.fileStoragePath) {
    return (
      <Text variant="subhead" color="secondaryLabel">
        {t('billsUi.noFile')}
      </Text>
    );
  }
  if (url.isLoading) return <ActivityIndicator color={colors.tint} />;
  if (!url.data) {
    return (
      <Button title={t('common.retry')} variant="tinted" onPress={() => void url.refetch()} />
    );
  }

  const uri = url.data;
  const isPdf = bill.fileMimeType === 'application/pdf';
  const open = () => {
    if (Platform.OS === 'web') void Linking.openURL(uri);
    else void WebBrowser.openBrowserAsync(uri);
  };

  return (
    <View style={styles.wrap}>
      <Card padded={false}>
        {isPdf ? (
          Platform.OS === 'web' ? (
            <View style={styles.frame}>
              <iframe src={uri} title={bill.fileName ?? 'PDF'} style={{ width: '100%', height: '100%', border: 0 }} />
            </View>
          ) : null
        ) : (
          <Image
            source={{ uri }}
            style={styles.image}
            contentFit="contain"
            accessibilityLabel={bill.fileName ?? undefined}
          />
        )}
      </Card>
      <Text variant="footnote" color="secondaryLabel">
        {[bill.fileName, bill.fileSizeBytes ? formatFileSize(bill.fileSizeBytes) : null].filter(Boolean).join(' · ')}
      </Text>
      <Button title={t('billsUi.openFile')} variant="tinted" icon={isPdf ? 'document' : 'photo'} onPress={open} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  image: { width: '100%', height: 320, borderRadius: radii.md },
  frame: { width: '100%', height: 480, borderRadius: radii.md, overflow: 'hidden' },
});
