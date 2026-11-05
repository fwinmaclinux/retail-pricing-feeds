import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { pricesApi, storesApi } from '@/api/endpoints';
import type { PriceRecord, SearchCriteria } from '@/api/types';
import { useUser } from '@/auth/SessionProvider';

// Every key starts with the user id, so cached data can never leak across users on a shared device.

export function useStores() {
  const user = useUser();
  return useQuery({
    queryKey: ['stores', user.userId],
    queryFn: storesApi.list,
    staleTime: 24 * 60 * 60 * 1000,
  });
}

export function usePriceSearch(criteria: SearchCriteria) {
  const user = useUser();
  return useInfiniteQuery({
    queryKey: ['prices', user.userId, 'search', criteria],
    queryFn: ({ pageParam, signal }) => pricesApi.search(criteria, pageParam, signal),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    placeholderData: (previous) => previous,
  });
}

export function usePrice(id: string) {
  const user = useUser();
  return useQuery({ queryKey: ['prices', user.userId, 'record', id], queryFn: () => pricesApi.get(id) });
}

export function usePriceHistory(id: string) {
  const user = useUser();
  return useQuery({ queryKey: ['prices', user.userId, 'history', id], queryFn: () => pricesApi.history(id) });
}

export function useUpdatePrice(id: string) {
  const user = useUser();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { version: number; price?: string; productName?: string; reason: string }) =>
      pricesApi.update(id, input.version, { price: input.price, productName: input.productName, reason: input.reason }),
    onSuccess: (record: PriceRecord) => {
      queryClient.setQueryData(['prices', user.userId, 'record', id], record);
      void queryClient.invalidateQueries({ queryKey: ['prices', user.userId, 'history', id] });
      void queryClient.invalidateQueries({ queryKey: ['prices', user.userId, 'search'] });
    },
  });
}
