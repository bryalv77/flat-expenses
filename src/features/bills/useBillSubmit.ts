import { useRouter } from 'expo-router';
import { useState } from 'react';

import { useToast } from '@/components/ui';
import { useT } from '@/i18n';
import { haptics } from '@/lib/haptics';

/** Upload progress, error text and the saved/failed feedback shared by the new-bill and edit-bill screens. */
export function useBillSubmit() {
  const { t } = useT();
  const router = useRouter();
  const toast = useToast();
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = (
    hasNewFiles: boolean,
    start: (onProgress: (fraction: number) => void, callbacks: { onSuccess: () => void; onError: () => void }) => void,
  ) => {
    setError(null);
    setProgress(hasNewFiles ? 0 : null);
    start(setProgress, {
      onSuccess: () => {
        haptics.success();
        toast.success(t('billsUi.saved'));
        router.back();
      },
      onError: () => {
        haptics.error();
        setError(hasNewFiles ? t('billsUi.uploadFailed') : t('errors.generic'));
        setProgress(null);
      },
    });
  };

  return { progress, error, run };
}
