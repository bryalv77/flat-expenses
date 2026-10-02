import { ActionSheet } from '@/components/ui';
import { useT } from '@/i18n';

interface Props {
  visible: boolean;
  title: string;
  confirmLabel: string;
  destructive?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

/** Cross-platform confirmation (Alert.alert is a no-op on web). */
export function ConfirmSheet({ visible, title, confirmLabel, destructive = true, onConfirm, onClose }: Props) {
  const { t } = useT();
  return (
    <ActionSheet
      visible={visible}
      onClose={onClose}
      title={title}
      cancelLabel={t('common.cancel')}
      options={[{ label: confirmLabel, destructive, onPress: onConfirm }]}
    />
  );
}
