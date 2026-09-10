/**
 * Alerts and confirmations that also work on web (react-native-web's Alert is a no-op).
 */
import { Alert, Platform } from 'react-native';
import { describeError } from '@/src/features/queries';

export function notify(title: string, message: string): void {
  if (Platform.OS === 'web') {
    console.error(`[${title}] ${message}`);
    if (typeof window !== 'undefined' && typeof window.alert === 'function') window.alert(`${title}\n\n${message}`);
    return;
  }
  Alert.alert(title, message);
}

export function notifyError(e: unknown, title = 'Hoppá'): void {
  notify(title, describeError(e));
}

export function confirm(opts: {
  title: string;
  message: string;
  confirmText: string;
  destructive?: boolean;
  onConfirm: () => void;
}): void {
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined' && window.confirm(`${opts.title}\n\n${opts.message}`)) opts.onConfirm();
    return;
  }
  Alert.alert(opts.title, opts.message, [
    { text: 'Mégse', style: 'cancel' },
    { text: opts.confirmText, style: opts.destructive ? 'destructive' : 'default', onPress: opts.onConfirm },
  ]);
}
