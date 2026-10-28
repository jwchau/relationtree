import type { QueryClient } from '@tanstack/react-query';
import { meQuery } from '@/hooks/useAuth';
import { connectionsQuery } from '@/hooks/useConnections';
import { personQuery } from '@/hooks/usePerson';
import { personListQuery } from '@/hooks/usePersonList';
import { treesQuery } from '@/hooks/useTrees';
import { treeGraphQuery } from '@/hooks/useTreeGraph';

/** Starts the first page's requests together, before React renders. Otherwise each waits on
 * the one before (the session, then the trees, then the page's data), and in production each
 * of those is a round trip through the tunnel. The results land in the same cache the hooks
 * read. `rememberedTree` is the tree the app last showed; if it's gone, the page fetches what
 * it needs as usual. Failures are dropped here: the page asks again and shows its own error. */
export function prefetchStartup(
  queryClient: QueryClient,
  pathname: string,
  rememberedTree: string | null,
): Promise<void> {
  const queries = [queryClient.prefetchQuery(meQuery), queryClient.prefetchQuery(treesQuery)];
  const match = /^\/people\/([^/]+)$/.exec(pathname)?.[1];
  const person = match === 'new' ? undefined : match;
  if (person) {
    queries.push(queryClient.prefetchQuery(personQuery(person)));
    queries.push(queryClient.prefetchQuery(connectionsQuery(person)));
  }
  if (rememberedTree) {
    if (pathname === '/') queries.push(queryClient.prefetchQuery(personListQuery(rememberedTree)));
    // A person's page and the map both draw the tree's graph.
    if (pathname === '/map' || person) queries.push(queryClient.prefetchQuery(treeGraphQuery(rememberedTree)));
  }
  return Promise.all(queries).then(() => undefined);
}
