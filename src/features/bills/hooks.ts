import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api, type BillInput } from '@/lib/db';
import { optimisticOptions } from '@/lib/optimistic';
import { qk } from '@/lib/queryKeys';
import { deleteFile, newId, prepareFile, storagePaths, uploadFile, type PickedFile, type UploadedFile } from '@/lib/storage';
import type { Bill } from '@/types/domain';

type BillFields = Omit<BillInput, 'fileStoragePath' | 'fileName' | 'fileMimeType' | 'fileSizeBytes'>;

/** Bills whose EFFECTIVE date (chargeDate → periodEndDate → createdAt) is in [from, to]. ISO dates, inclusive. */
export function useBills(houseId: string | null | undefined, range: { from: string; to: string; categoryId?: string }) {
  return useQuery({
    queryKey: qk.bills(houseId ?? '', range.from, range.to, range.categoryId),
    queryFn: () => api.listBills({ houseId: houseId as string, ...range }),
    enabled: Boolean(houseId),
  });
}

export function useBill(houseId: string | null | undefined, id: string | null | undefined) {
  return useQuery({
    queryKey: qk.bill(houseId ?? '', id ?? ''),
    queryFn: () => api.getBill({ houseId: houseId as string, id: id as string }),
    enabled: Boolean(houseId && id),
  });
}

async function uploadBillFile(houseId: string, billId: string, file: PickedFile, onProgress?: (f: number) => void): Promise<UploadedFile> {
  const prepared = await prepareFile(file, 'bill'); // compresses images, HEIC → JPEG
  return uploadFile(storagePaths.bill(houseId, billId, prepared.name), prepared, onProgress);
}

const fileFields = (u: UploadedFile): Pick<BillInput, 'fileStoragePath' | 'fileName' | 'fileMimeType' | 'fileSizeBytes'> => ({
  fileStoragePath: u.storagePath,
  fileName: u.fileName,
  fileMimeType: u.mimeType,
  fileSizeBytes: u.sizeBytes,
});

export interface CreateBillVars {
  fields: BillFields;
  file?: PickedFile;
  onProgress?: (fraction: number) => void;
}

/** Uploads the optional file first, then inserts the row; the orphaned upload is removed if the insert fails. */
export function useCreateBill(houseId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ fields, file, onProgress }: CreateBillVars) => {
      const id = newId();
      const uploaded = file ? await uploadBillFile(houseId, id, file, onProgress) : undefined;
      try {
        // ocrStatus stays 'NONE' (set server-side).
        // TODO(ocr): after a successful upload, enqueue extraction here (see src/features/ocr/README.md).
        await api.createBill({ ...fields, ...(uploaded ? fileFields(uploaded) : {}), houseId, id });
      } catch (e) {
        if (uploaded) await deleteFile(uploaded.storagePath).catch(() => undefined);
        throw e;
      }
      return id;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.billsOf(houseId) }),
  });
}

export interface UpdateBillVars {
  id: string;
  fields: Partial<BillFields>;
  /** Replaces the attached file. */
  newFile?: PickedFile;
  /** Path of the file being replaced (deleted after a successful update). */
  oldFilePath?: string | null;
  /** Detach the file without replacing it. */
  removeFile?: boolean;
  onProgress?: (fraction: number) => void;
}

export function useUpdateBill(houseId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, fields, newFile, oldFilePath, removeFile, onProgress }: UpdateBillVars) => {
      const uploaded = newFile ? await uploadBillFile(houseId, id, newFile, onProgress) : undefined;
      const detach = removeFile && !uploaded ? { fileStoragePath: null, fileName: null, fileMimeType: null, fileSizeBytes: null } : {};
      try {
        await api.updateBill({ ...fields, ...(uploaded ? fileFields(uploaded) : detach), houseId, id });
      } catch (e) {
        if (uploaded) await deleteFile(uploaded.storagePath).catch(() => undefined);
        throw e;
      }
      if (oldFilePath && (uploaded || removeFile) && oldFilePath !== uploaded?.storagePath) {
        await deleteFile(oldFilePath).catch(() => undefined);
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.billsOf(houseId) }),
  });
}

/** Deletes the row, then its file. Optimistically removes the bill from every cached list. */
export function useDeleteBill(houseId: string) {
  const qc = useQueryClient();
  const optimistic = optimisticOptions<Bill, Bill[] | Bill | null>(qc, qk.billsOf(houseId), (old, bill) =>
    Array.isArray(old) ? old.filter((b) => b.id !== bill.id) : old,
  );
  return useMutation({
    mutationFn: async (bill: Bill) => {
      await api.deleteBill({ houseId, id: bill.id });
      if (bill.fileStoragePath) await deleteFile(bill.fileStoragePath).catch(() => undefined);
    },
    ...optimistic,
  });
}
