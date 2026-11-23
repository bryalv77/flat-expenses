import { useQuery } from '@tanstack/react-query';

import { getFileStore } from './fileStore';
import { qk } from './queryKeys';

/** Goes through the active FileStore (cloud URL or local file URI). */
const resolveFileUrl = (storagePath: string) => getFileStore().getUrl(storagePath);

/** Resolves a Storage path (read from the API) to a displayable URL. */
export function useFileUrl(storagePath: string | null | undefined) {
  return useQuery({
    queryKey: qk.fileUrl(storagePath ?? ''),
    queryFn: () => resolveFileUrl(storagePath as string),
    enabled: Boolean(storagePath),
    staleTime: 50 * 60 * 1000,
  });
}
