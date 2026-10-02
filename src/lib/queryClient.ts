import { QueryClient } from '@tanstack/react-query';

/** Offline-friendly defaults: cached data is reused, failures retry with backoff, mutations never retry blindly. */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Cost guard: Firestore bills per document read, so cached data stays fresh for 5 minutes and
      // never refetches just because the window/tab regained focus (mutations invalidate explicitly).
      staleTime: 5 * 60_000,
      refetchOnWindowFocus: false,
      gcTime: 24 * 60 * 60 * 1000,
      retry: 2,
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
      refetchOnReconnect: true,
      networkMode: 'offlineFirst',
    },
    mutations: { retry: 0 },
  },
});
