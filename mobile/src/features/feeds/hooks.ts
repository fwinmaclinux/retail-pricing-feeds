import { useQuery } from '@tanstack/react-query';
import { feedsApi } from '@/api/endpoints';
import type { FeedStatus } from '@/api/types';
import { useUser } from '@/auth/SessionProvider';

export const IN_PROGRESS: FeedStatus[] = ['AWAITING_UPLOAD', 'QUEUED', 'PROCESSING'];

export function useFeeds() {
  const user = useUser();
  return useQuery({
    queryKey: ['feeds', user.userId],
    queryFn: feedsApi.list,
    // Keep the list live while any of the user's feeds is still being processed.
    refetchInterval: (q) => (q.state.data?.some((f) => IN_PROGRESS.includes(f.status)) ? 3000 : false),
  });
}

export function useFeed(feedId: string) {
  const user = useUser();
  return useQuery({
    queryKey: ['feed', user.userId, feedId],
    queryFn: () => feedsApi.get(feedId),
    // Production also sends a push notification on completion; polling covers the open screen.
    refetchInterval: (q) => (q.state.data && IN_PROGRESS.includes(q.state.data.status) ? 1500 : false),
  });
}

export function useFeedErrors(feedId: string, enabled: boolean) {
  const user = useUser();
  return useQuery({
    queryKey: ['feed', user.userId, feedId, 'errors'],
    queryFn: () => feedsApi.errors(feedId),
    enabled,
  });
}
