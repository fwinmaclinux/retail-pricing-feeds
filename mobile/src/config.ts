import Constants from 'expo-constants';
import { Platform } from 'react-native';

/**
 * API base URL per environment. Release builds get EXPO_PUBLIC_API_URL from the EAS build
 * profile (the regional endpoint is then chosen from the user's token claims).
 * In development we reuse the host that serves the JS bundle, so simulators, emulators and
 * physical devices on the same network all reach the local API without extra setup.
 */
function resolveApiBaseUrl(): string {
  const fromEnv = process.env.EXPO_PUBLIC_API_URL;
  if (fromEnv) return fromEnv.replace(/\/$/, '');
  const devHost = Constants.expoConfig?.hostUri?.split(':')[0];
  if (devHost) return `http://${devHost}:4000`;
  if (Platform.OS === 'android') return 'http://10.0.2.2:4000';
  return 'http://localhost:4000';
}

export const config = {
  apiBaseUrl: resolveApiBaseUrl(),
  requestTimeoutMs: 20_000,
  maxUploadBytes: 50 * 1024 * 1024,
  appVersion: Constants.expoConfig?.version ?? '1.0.0',
};
