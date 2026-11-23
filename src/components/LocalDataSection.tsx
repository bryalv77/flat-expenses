import { ListRow, Section } from '@/components/ui';
import { useT } from '@/i18n';

interface Props {
  onExport: () => void;
  onImport: () => void;
  onDeleteAll: () => void;
}

export function LocalDataSection({ onExport, onImport, onDeleteAll }: Props) {
  const { t } = useT();
  return (
    <Section header={t('localMode.data')}>
      <ListRow icon="share" title={t('localMode.export')} chevron onPress={onExport} />
      <ListRow icon="archive" title={t('localMode.import')} chevron onPress={onImport} />
      <ListRow icon="trash" title={t('localMode.deleteAll')} destructive onPress={onDeleteAll} />
    </Section>
  );
}
