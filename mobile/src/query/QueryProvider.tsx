import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { focusManager, onlineManager, QueryClient } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { useEffect, type ReactNode } from 'react';
import { AppState, Platform } from 'react-native';
import { ApiError } from '@/api/client';

/**
 * Server-state cache. Store networks are unreliable, so:
 *  - queries retry transient failures with backoff, but never 4xx responses;
 *  - the last results are persisted on the device, so search still works offline (read-only);
 *  - mutations pause while offline and resume automatically when connectivity returns.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 24 * 60 * 60 * 1000,
      retry: (failureCount, error) => {
        if (error instanceof ApiError && error.status >= 400 && error.status < 500) return false;
        return failureCount < 3;
      },
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
    },
    mutations: { retry: 0 },
  },
});

const persister = createAsyncStoragePersister({ storage: AsyncStorage, key: 'pricing-feeds.query-cache', throttleTime: 2000 });

// React Query's online state follows the device's real connectivity.
onlineManager.setEventListener((setOnline) =>
  NetInfo.addEventListener((state) => setOnline(state.isConnected !== false)),
);

export function QueryProvider({ children }: { children: ReactNode }) {
  // Refetch stale data when the app comes back to the foreground.
  useEffect(() => {
    if (Platform.OS === 'web') return;
    const sub = AppState.addEventListener('change', (s) => focusManager.setFocused(s === 'active'));
    return () => sub.remove();
  }, []);

  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister,
        maxAge: 24 * 60 * 60 * 1000,
        buster: 'v1',
        // Only persist reference data and search results - not feed status polling.
        dehydrateOptions: { shouldDehydrateQuery: (q) => q.state.status === 'success' && q.queryKey[0] !== 'feed' },
      }}
    >
      {children}
    </PersistQueryClientProvider>
  );
}
