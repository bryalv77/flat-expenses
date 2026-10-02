import * as WebBrowser from 'expo-web-browser';
import { Stack } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import {
  ActionSheet,
  BottomSheet,
  Button,
  EmptyState,
  FilePickerField,
  ListRow,
  Screen,
  SegmentedControl,
  Section,
  Skeleton,
  Text,
  useToast,
  type PickedFile,
} from '@/components/ui';
import { useAddDocument, useDeleteDocument, useMyDocuments } from '@/features/profile/hooks';
import { useT, type TranslationKey } from '@/i18n';
import { formatDate, formatFileSize } from '@/lib/format';
import { haptics } from '@/lib/haptics';
import { FileValidationError, getFileUrl } from '@/lib/storage';
import { spacing } from '@/theme';
import type { DocumentType, UserDocument } from '@/types/domain';

const TYPE_LABEL: Record<DocumentType, TranslationKey> = {
  PASSPORT: 'profile.passport',
  NATIONAL_ID: 'profile.nationalId',
};

export default function DocumentsScreen() {
  const { t, locale } = useT();
  const toast = useToast();
  const documents = useMyDocuments();
  const addDocument = useAddDocument();
  const deleteDocument = useDeleteDocument();

  const [formOpen, setFormOpen] = useState(false);
  const [replacing, setReplacing] = useState<UserDocument | null>(null);
  const [type, setType] = useState<DocumentType>('NATIONAL_ID');
  const [file, setFile] = useState<PickedFile | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [toDelete, setToDelete] = useState<UserDocument | null>(null);

  const typeOptions: { value: DocumentType; label: string }[] = [
    { value: 'NATIONAL_ID', label: t('profile.nationalId') },
    { value: 'PASSPORT', label: t('profile.passport') },
  ];

  const openForm = (doc: UserDocument | null) => {
    setReplacing(doc);
    setType(doc?.type ?? 'NATIONAL_ID');
    setFile(null);
    setFormOpen(true);
  };

  const submit = async () => {
    if (!file) return;
    setProgress(0);
    try {
      await addDocument.mutateAsync({ type, file, onProgress: setProgress });
      if (replacing) await deleteDocument.mutateAsync(replacing);
      haptics.success();
      toast.success(t('account.uploaded'));
      setFormOpen(false);
    } catch (e) {
      haptics.error();
      const key: TranslationKey =
        e instanceof FileValidationError ? (e.code === 'too-large' ? 'errors.fileTooLarge' : 'errors.fileType') : 'errors.generic';
      toast.error(t(key));
    } finally {
      setProgress(null);
    }
  };

  const view = async (doc: UserDocument) => {
    try {
      const url = await getFileUrl(doc.storagePath);
      await WebBrowser.openBrowserAsync(url);
    } catch {
      toast.error(t('errors.generic'));
    }
  };

  const items = documents.data ?? [];

  return (
    <Screen refreshing={documents.isRefetching} onRefresh={() => void documents.refetch()}>
      <Stack.Screen options={{ title: t('profile.documents') }} />
      <View style={styles.block}>
        <Text variant="footnote" color="secondaryLabel">
          {t('account.documentsHint')}
        </Text>
        <Button title={t('profile.addDocument')} icon="plus" onPress={() => openForm(null)} />
      </View>
      {documents.isLoading ? (
        <View style={styles.block}>
          <Skeleton height={56} />
        </View>
      ) : items.length === 0 ? (
        <EmptyState icon="document" title={t('account.noDocuments')} actionLabel={t('profile.addDocument')} onAction={() => openForm(null)} />
      ) : (
        <Section>
          {items.map((doc) => (
            <ListRow
              key={doc.id}
              icon={doc.mimeType === 'application/pdf' ? 'document' : 'photo'}
              title={t(TYPE_LABEL[doc.type])}
              subtitle={`${doc.fileName} · ${formatFileSize(doc.sizeBytes)} · ${formatDate(doc.uploadedAt.slice(0, 10), locale)}`}
              chevron
              onPress={() => void view(doc)}
              accessibilityLabel={`${t('account.view')} ${t(TYPE_LABEL[doc.type])}`}
              swipeActions={[
                { label: t('account.replace'), onPress: () => openForm(doc) },
                { label: t('common.delete'), destructive: true, onPress: () => setToDelete(doc) },
              ]}
            />
          ))}
        </Section>
      )}

      <BottomSheet visible={formOpen} onClose={() => (progress === null ? setFormOpen(false) : undefined)} title={t('profile.addDocument')}>
        <View style={styles.block}>
          <Text variant="footnote" color="secondaryLabel">
            {t('account.docType')}
          </Text>
          <SegmentedControl options={typeOptions} value={type} onChange={setType} />
          <FilePickerField label={t('expenses.file')} value={file} onChange={setFile} />
          <Button
            title={progress !== null ? `${t('expenses.uploading')} ${Math.round(progress * 100)}%` : t('common.save')}
            onPress={() => void submit()}
            loading={progress !== null}
            disabled={!file}
          />
        </View>
      </BottomSheet>

      <ActionSheet
        visible={toDelete !== null}
        onClose={() => setToDelete(null)}
        title={t('account.deleteDocConfirm')}
        cancelLabel={t('common.cancel')}
        options={[
          {
            label: t('common.delete'),
            destructive: true,
            onPress: () => {
              if (toDelete) deleteDocument.mutate(toDelete);
              setToDelete(null);
            },
          },
        ]}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  block: { gap: spacing.sm, paddingHorizontal: spacing.lg, paddingBottom: spacing.lg },
});
