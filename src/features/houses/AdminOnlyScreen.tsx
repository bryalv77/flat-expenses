import { EmptyState, Screen } from '@/components/ui';
import { useT } from '@/i18n';

export function AdminOnlyScreen() {
  const { t } = useT();
  return <Screen><EmptyState icon="lock" title={t('hub.adminOnly')} /></Screen>;
}
