import type { PickedFile as UiPickedFile } from '@/components/ui';
import type { PickedFile as StoragePickedFile } from '@/lib/storage';

/** The picker reports `size: number | null`; the storage layer expects an optional number. */
export function toStorageFiles(files: UiPickedFile[]): StoragePickedFile[] {
  return files.map((f) => ({ uri: f.uri, name: f.name, mimeType: f.mimeType, size: f.size ?? undefined }));
}
