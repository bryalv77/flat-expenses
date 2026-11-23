import { Component, type ErrorInfo, type ReactNode } from 'react';
import { View } from 'react-native';

import { useT } from '@/i18n';

import { Button } from './Button';
import { Text } from './Text';

interface Props {
  children: ReactNode;
}
interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return <Fallback error={this.state.error} onRetry={() => this.setState({ error: null })} />;
  }
}

function Fallback({ error, onRetry }: { error: Error; onRetry: () => void }) {
  const { t } = useT();
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 }}>
      <Text variant="title3">{t('common.error')}</Text>
      <Text variant="footnote" color="secondaryLabel" style={{ textAlign: 'center' }}>
        {error.message}
      </Text>
      <Button title={t('common.retry')} fullWidth={false} onPress={onRetry} />
    </View>
  );
}
