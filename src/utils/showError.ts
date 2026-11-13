import { Alert, Share } from 'react-native';
import { diagnosticsFor, explainError } from './explainError';

/** An alert that says what failed and what to do next, with the raw detail (redacted) only behind "Share details". */
export function showError(title: string, err: unknown, onRetry?: () => void): void {
  const e = explainError(err, title);
  const message = [e.cause, e.next].filter(Boolean).join('\n\n');
  Alert.alert(title, message, [
    ...(onRetry && e.retryable ? [{ text: 'Try again', onPress: onRetry }] : []),
    { text: 'Share details', onPress: () => { void Share.share({ message: diagnosticsFor(err, title) }); } },
    { text: 'OK', style: 'cancel' as const },
  ]);
}
