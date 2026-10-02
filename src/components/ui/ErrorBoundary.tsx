import { Component, type ErrorInfo, type ReactNode } from 'react';
import { View } from 'react-native';

import { Button } from './Button';
import { Text } from './Text';

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
  retryLabel?: string;
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
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 }}>
        <Text variant="title3">{this.props.fallbackTitle ?? 'Algo salió mal'}</Text>
        <Text variant="footnote" color="secondaryLabel" style={{ textAlign: 'center' }}>
          {this.state.error.message}
        </Text>
        <Button title={this.props.retryLabel ?? 'Reintentar'} fullWidth={false} onPress={() => this.setState({ error: null })} />
      </View>
    );
  }
}
