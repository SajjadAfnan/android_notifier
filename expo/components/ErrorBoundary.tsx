	import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
}

export class ErrorBoundary extends React.Component<Props, State> {
  public state: State = {
    hasError: false,
  };

  public static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  public componentDidCatch(error: Error): void {
    console.log('Root error boundary captured an error', error);
  }

  private handleRetry = (): void => {
    this.setState({ hasError: false });
  };

  public render(): React.ReactNode {
    if (this.state.hasError) {
      return (
        <View style={styles.container} testID="error-boundary-screen">
          <Text style={styles.title}>Something went wrong</Text>
          <Text style={styles.description}>Please reopen the app to continue prayer alerts.</Text>
          <Pressable onPress={this.handleRetry} style={styles.button} testID="error-boundary-retry-button">
            <Text style={styles.buttonText}>Retry</Text>
          </Pressable>
        </View>
      );
    }

    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#08131E',
    paddingHorizontal: 24,
    gap: 12,
  },
  title: {
    color: '#F8FAFC',
    fontSize: 24,
    fontWeight: '700',
  },
  description: {
    color: '#94A3B8',
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
  },
  button: {
    marginTop: 8,
    backgroundColor: '#22C55E',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 999,
  },
  buttonText: {
    color: '#03120A',
    fontSize: 15,
    fontWeight: '700',
  },
});

