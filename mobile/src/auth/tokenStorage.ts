import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import type { User } from '@/api/types';

const KEY = 'pricing-feeds.session';

export interface StoredSession {
  accessToken: string;
  user: User;
}

/**
 * Tokens live in the iOS Keychain / Android Keystore (expo-secure-store), never in
 * AsyncStorage. The web build (used only for quick demos) falls back to sessionStorage.
 */
export const tokenStorage = {
  async load(): Promise<StoredSession | null> {
    const raw = Platform.OS === 'web' ? globalThis.sessionStorage?.getItem(KEY) : await SecureStore.getItemAsync(KEY);
    if (!raw) return null;
    try {
      const session = JSON.parse(raw) as StoredSession;
      return isExpired(session.accessToken) ? null : session;
    } catch {
      return null;
    }
  },
  async save(session: StoredSession): Promise<void> {
    const raw = JSON.stringify(session);
    if (Platform.OS === 'web') globalThis.sessionStorage?.setItem(KEY, raw);
    else await SecureStore.setItemAsync(KEY, raw, { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY });
  },
  async clear(): Promise<void> {
    if (Platform.OS === 'web') globalThis.sessionStorage?.removeItem(KEY);
    else await SecureStore.deleteItemAsync(KEY);
  },
};

function isExpired(jwt: string): boolean {
  try {
    const b64 = jwt.split('.')[1]!.replace(/-/g, '+').replace(/_/g, '/');
    const payload = JSON.parse(atob(b64.padEnd(Math.ceil(b64.length / 4) * 4, '=')));
    return typeof payload.exp === 'number' && payload.exp * 1000 < Date.now();
  } catch {
    return true;
  }
}
