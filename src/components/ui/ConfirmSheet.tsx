import { ActionSheet } from './ActionSheet';

interface Props {
  visible: boolean;
  title: string;
  message?: string;
  confirmLabel: string;
  onConfirm: () => void;
  onClose: () => void;
}

/** Cross-platform destructive confirmation (Alert.alert is a no-op on web). */
export function ConfirmSheet({ visible, title, message, confirmLabel, onConfirm, onClose }: Props) {
  return (
    <ActionSheet
      visible={visible}
      onClose={onClose}
      title={title}
      message={message}
      options={[{ label: confirmLabel, destructive: true, onPress: onConfirm }]}
    />
  );
}
