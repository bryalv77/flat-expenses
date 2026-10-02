import { useQuery } from '@tanstack/react-query';

import { qk } from './queryKeys';
import { getFileUrl } from './storage';

/** Resolves a Storage path (read from Firestore) to a download URL. */
export function useFileUrl(storagePath: string | null | undefined) {
  return useQuery({
    queryKey: qk.fileUrl(storagePath ?? ''),
    queryFn: () => getFileUrl(storagePath as string),
    enabled: Boolean(storagePath),
    staleTime: 50 * 60 * 1000,
  });
}
