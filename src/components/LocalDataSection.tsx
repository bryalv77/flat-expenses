import { ListRow, Section } from '@/components/ui';
import { useT } from '@/i18n';

interface Props {
  onExport?: () => void;
  onImport?: () => void;
  onDeleteAll?: () => void;
}

const noop = () => undefined;

/** Export / import / delete-all rows for local mode; T11 passes the real handlers. */
export function LocalDataSection({ onExport = noop, onImport = noop, onDeleteAll = noop }: Props) {
  const { t } = useT();
  return (
    <Section header={t('localMode.data')}>
      <ListRow icon="share" title={t('localMode.export')} chevron onPress={onExport} />
      <ListRow icon="archive" title={t('localMode.import')} chevron onPress={onImport} />
      <ListRow icon="trash" title={t('localMode.deleteAll')} destructive onPress={onDeleteAll} />
    </Section>
  );
}
