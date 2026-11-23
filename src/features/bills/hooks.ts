import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api, type BillInput } from '@/lib/db';
import { optimisticOptions } from '@/lib/optimistic';
import { qk } from '@/lib/queryKeys';
import { getFileStore } from '@/lib/fileStore';
import { storagePaths } from '@/lib/fileKeys';
import { newId, prepareFile, type PickedFile } from '@/lib/storage';
import type { Bill, BillFile } from '@/types/domain';

type BillFields = Omit<BillInput, 'files'>;

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

/** Uploads sequentially (unique names, so equal file names never collide); progress is the overall 0..1 fraction. */
async function uploadBillFiles(houseId: string, billId: string, files: PickedFile[], onProgress?: (f: number) => void): Promise<BillFile[]> {
  const done: BillFile[] = [];
  try {
    for (const file of files) {
      const prepared = await prepareFile(file, 'bill'); // compresses images, HEIC → JPEG
      const path = storagePaths.bill(houseId, billId, `${newId().slice(0, 8)}-${prepared.name}`);
      const u = await getFileStore().upload(path, prepared, (f) => onProgress?.((done.length + f) / files.length));
      done.push({ storagePath: u.storagePath, fileName: u.fileName, mimeType: u.mimeType, sizeBytes: u.sizeBytes });
    }
  } catch (e) {
    await removeFiles(done);
    throw e;
  }
  return done;
}

const removeFiles = (files: BillFile[]) => Promise.all(files.map((f) => getFileStore().delete(f.storagePath).catch(() => undefined)));

export interface CreateBillVars {
  fields: BillFields;
  files?: PickedFile[];
  onProgress?: (fraction: number) => void;
}

/** Uploads the optional files first, then inserts the row; the orphaned uploads are removed if the insert fails. */
export function useCreateBill(houseId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ fields, files = [], onProgress }: CreateBillVars) => {
      const id = newId();
      const uploaded = await uploadBillFiles(houseId, id, files, onProgress);
      try {
        // ocrStatus stays 'NONE' (set server-side).
        // TODO(ocr): after a successful upload, enqueue extraction here (see src/features/ocr/README.md).
        await api.createBill({ ...fields, files: uploaded, houseId, id });
      } catch (e) {
        await removeFiles(uploaded);
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
  /** Files of the bill that stay attached. */
  keptFiles: BillFile[];
  /** Files to upload and append. */
  newFiles: PickedFile[];
  /** Files detached by the user (deleted from Storage after a successful update). */
  removedFiles: BillFile[];
  onProgress?: (fraction: number) => void;
}

export function useUpdateBill(houseId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, fields, keptFiles, newFiles, removedFiles, onProgress }: UpdateBillVars) => {
      const uploaded = await uploadBillFiles(houseId, id, newFiles, onProgress);
      try {
        await api.updateBill({ ...fields, files: [...keptFiles, ...uploaded], houseId, id });
      } catch (e) {
        await removeFiles(uploaded);
        throw e;
      }
      await removeFiles(removedFiles);
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
      await removeFiles(bill.files);
    },
    ...optimistic,
  });
}
