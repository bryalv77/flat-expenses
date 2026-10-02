import { Avatar } from '@/components/ui';
import { useFileUrl } from '@/lib/useFileUrl';

export function MemberAvatar({ name, photoPath, size = 40 }: { name: string; photoPath: string | null; size?: number }) {
  const { data } = useFileUrl(photoPath);
  return <Avatar name={name} uri={data ?? undefined} size={size} />;
}
