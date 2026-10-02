import type { PickedFile as UiPickedFile } from '@/components/ui';
import type { PickedFile as StoragePickedFile } from '@/lib/storage';

/** The picker reports `size: number | null`; the storage layer expects an optional number. */
export function toStorageFile(file: UiPickedFile | null): StoragePickedFile | undefined {
  return file ? { uri: file.uri, name: file.name, mimeType: file.mimeType, size: file.size ?? undefined } : undefined;
}
