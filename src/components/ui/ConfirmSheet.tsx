import { ActionSheet } from './ActionSheet';

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
  return (
    <ActionSheet
      visible={visible}
      onClose={onClose}
      title={title}
      options={[{ label: confirmLabel, destructive, onPress: onConfirm }]}
    />
  );
}
