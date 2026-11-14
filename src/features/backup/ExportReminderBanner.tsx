import { View } from 'react-native';

import { Button, Card, Text } from '@/components/ui';
import { useT } from '@/i18n';
import { spacing } from '@/theme';

import { useExportReminder } from './useExportReminder';

/** Local mode only: visibility comes from shouldRemind, which is false in cloud mode. */
export function ExportReminderBanner({ onExport }: { onExport: () => void | Promise<void> }) {
  const { t } = useT();
  const { visible, snooze, exportNow } = useExportReminder(onExport);
  if (!visible) return null;
  return (
    <Card>
      <View style={{ padding: spacing.md, gap: spacing.sm }}>
        <Text variant="headline">{t('backup.reminder.title')}</Text>
        <Text variant="subhead" color="secondaryLabel">{t('backup.reminder.body')}</Text>
        <Button title={t('backup.reminder.exportNow')} onPress={exportNow} />
        <Button title={t('backup.reminder.snooze')} variant="plain" onPress={snooze} />
      </View>
    </Card>
  );
}
