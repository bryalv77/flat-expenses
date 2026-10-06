import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { View } from 'react-native';

import { Button, EmptyState, Screen, Section, Text, TextField } from '@/components/ui';
import { runImport } from '@/features/import/runImport';
import { spacing } from '@/theme';

/** Dev-only, one-off: imports the historical Excel bundle served by scripts/prepare-import-bundle.py. */
export default function ImportScreen() {
  const qc = useQueryClient();
  const [bundleUrl, setBundleUrl] = useState('http://localhost:8765');
  const [houseName, setHouseName] = useState('');
  const [lines, setLines] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  if (!__DEV__) return <Screen><EmptyState icon="lock" title="Dev only" /></Screen>;

  const start = async () => {
    setBusy(true);
    setLines([]);
    try {
      await runImport({ bundleUrl: bundleUrl.replace(/\/$/, ''), houseName: houseName.trim(), log: (l) => setLines((p) => [...p, l]) });
    } catch (e) {
      setLines((p) => [...p, `✖ ${String(e)}`]);
    } finally {
      await qc.invalidateQueries();
      setBusy(false);
    }
  };

  return (
    <Screen>
      <View style={{ paddingHorizontal: spacing.lg, gap: spacing.lg }}>
        <Section footer="Sirve el bundle con: python3 scripts/prepare-import-bundle.py --serve <carpeta>">
          <TextField inline label="Bundle URL" value={bundleUrl} onChangeText={setBundleUrl} autoCapitalize="none" />
          <TextField inline label="Casa" value={houseName} onChangeText={setHouseName} />
        </Section>
        <Button title="Importar" loading={busy} disabled={!houseName.trim()} onPress={() => void start()} />
        {lines.map((l, i) => (
          <Text key={i} variant="footnote">{l}</Text>
        ))}
      </View>
    </Screen>
  );
}
