import { Badge } from '@/components/ui';
import { useT } from '@/i18n';
import type { HouseRole } from '@/types/domain';

export function RoleBadge({ role, small }: { role: HouseRole; small?: boolean }) {
  const { t } = useT();
  return <Badge small={small} label={role === 'ADMIN' ? t('house.admin') : t('house.roommate')} tone={role === 'ADMIN' ? 'blue' : 'neutral'} />;
}
