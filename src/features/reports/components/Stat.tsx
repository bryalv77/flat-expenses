import { View } from 'react-native';

import { Card, Text } from '@/components/ui';

/** Compact KPI tile (label, big value, optional hint). `inRow` makes it share a row equally with its siblings. */
export function Stat({ label, value, hint, color, inRow }: { label: string; value: string; hint?: string; color?: string; inRow?: boolean }) {
  return (
    <View style={inRow ? { flex: 1 } : undefined}>
      <Card>
        <Text variant="footnote" color="secondaryLabel">{label}</Text>
        <Text variant="title2" style={color ? { color } : undefined}>{value}</Text>
        {hint ? <Text variant="footnote" color="secondaryLabel">{hint}</Text> : null}
      </Card>
    </View>
  );
}
