import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from '@/lib/db';
import { auth } from '@/lib/firebase';
import { optimisticOptions } from '@/lib/optimistic';
import { qk } from '@/lib/queryKeys';
import { deleteFile, newId, prepareFile, storagePaths, uploadFile, type PickedFile } from '@/lib/storage';
import type { DocumentType, Locale, User, UserDocument } from '@/types/domain';

export function useMe() {
  return useQuery({ queryKey: qk.me, queryFn: api.getMe });
}

export function useUpdateProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { displayName?: string; locale?: Locale; photoPath?: string | null }) => api.updateMyProfile(v),
    ...optimisticOptions<{ displayName?: string; locale?: Locale; photoPath?: string | null }, User | null>(qc, qk.me, (old, v) =>
      old ? { ...old, ...v } : old,
    ),
  });
}

/** Compresses (512 px JPEG), uploads to users/{uid}/avatar/, saves the path and removes the previous avatar. */
export function useUploadAvatar() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ file, previousPath, onProgress }: { file: PickedFile; previousPath?: string | null; onProgress?: (f: number) => void }) => {
      const uid = auth.currentUser?.uid;
      if (!uid) throw new Error('Not signed in');
      const prepared = await prepareFile(file, 'avatar');
      const uploaded = await uploadFile(storagePaths.avatar(uid, `${newId()}-${prepared.name}`), prepared, onProgress);
      await api.updateMyProfile({ photoPath: uploaded.storagePath });
      if (previousPath) await deleteFile(previousPath).catch(() => undefined);
      return uploaded.storagePath;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.me }),
  });
}

export function useMyDocuments() {
  return useQuery({ queryKey: qk.myDocuments, queryFn: api.listMyDocuments });
}

/** Identity document (passport / national id) as image or PDF. Replace = add new + delete old. */
export function useAddDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ type, file, onProgress }: { type: DocumentType; file: PickedFile; onProgress?: (f: number) => void }) => {
      const uid = auth.currentUser?.uid;
      if (!uid) throw new Error('Not signed in');
      const id = newId();
      const prepared = await prepareFile(file, 'document');
      const uploaded = await uploadFile(storagePaths.userDocument(uid, id, prepared.name), prepared, onProgress);
      try {
        await api.addMyDocument({ id, type, ...uploaded, mimeType: uploaded.mimeType });
      } catch (e) {
        await deleteFile(uploaded.storagePath).catch(() => undefined);
        throw e;
      }
      return id;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.myDocuments }),
  });
}

export function useDeleteDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (doc: UserDocument) => {
      await api.deleteMyDocument({ id: doc.id });
      await deleteFile(doc.storagePath).catch(() => undefined);
    },
    ...optimisticOptions<UserDocument, UserDocument[]>(qc, qk.myDocuments, (old, doc) => old.filter((d) => d.id !== doc.id)),
  });
}

/** SENSITIVE — house admins only (server enforced): documents of an ACTIVE member of their house. */
export function useMemberDocuments(houseId: string | null | undefined, userId: string | null | undefined, enabled = true) {
  return useQuery({
    queryKey: qk.memberDocuments(houseId ?? '', userId ?? ''),
    queryFn: () => api.listMemberDocuments({ houseId: houseId as string, userId: userId as string }),
    enabled: Boolean(houseId && userId) && enabled,
  });
}
