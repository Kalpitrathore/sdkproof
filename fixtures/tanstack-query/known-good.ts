// Hand-authored, known-correct TanStack Query v5 usage — proves the fixture can
// express a PASSING answer. See test/fixtures.test.ts.
//
// Exercises the drift-prone surface: object-only useQuery, `gcTime` (v4's
// cacheTime), `placeholderData` (v4's keepPreviousData), the 'pending' status
// literal, and useInfiniteQuery's required `initialPageParam`.
import {
  useQuery,
  useMutation,
  useInfiniteQuery,
  QueryClient,
  keepPreviousData,
} from "@tanstack/react-query";

export const queryClient = new QueryClient({
  defaultOptions: {
    // v5: `gcTime` — v4's `cacheTime` was renamed.
    queries: { gcTime: 5 * 60 * 1000, staleTime: 30_000 },
  },
});

interface Page {
  items: string[];
  next: number | null;
}

export function useThings(page: number) {
  const query = useQuery({
    queryKey: ["things", page],
    queryFn: async (): Promise<string[]> => ["a", "b"],
    // v5: keepPreviousData became a value passed to placeholderData.
    placeholderData: keepPreviousData,
  });

  // v5: the loading status literal is 'pending'.
  const isLoading = query.status === "pending";
  return { ...query, isLoading };
}

export function useAddThing() {
  return useMutation({
    mutationFn: async (name: string) => ({ name }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["things"] }),
  });
}

export function useThingPages() {
  return useInfiniteQuery({
    queryKey: ["things", "infinite"],
    queryFn: async ({ pageParam }): Promise<Page> => ({
      items: ["a"],
      next: pageParam < 3 ? pageParam + 1 : null,
    }),
    // v5: initialPageParam is required.
    initialPageParam: 0,
    getNextPageParam: (last: Page) => last.next,
  });
}
