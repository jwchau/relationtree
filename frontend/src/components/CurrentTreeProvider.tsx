import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { CurrentTreeContext } from '@/hooks/useCurrentTree';
import { useTrees } from '@/hooks/useTrees';
import { readRememberedTree, rememberTree } from '@/lib/currentTreeStorage';
import { pickCurrentTree } from '@/lib/trees';

export function CurrentTreeProvider({ children }: { children: ReactNode }) {
  const trees = useTrees();
  const [rememberedId, setRememberedId] = useState(readRememberedTree);

  const select = useCallback((treeId: string) => {
    setRememberedId(treeId);
    rememberTree(treeId);
  }, []);

  const value = useMemo(
    () => ({
      tree: trees.data ? pickCurrentTree(trees.data, rememberedId) : null,
      trees: trees.data ?? [],
      loading: trees.isPending,
      error: trees.error?.message ?? null,
      select,
    }),
    [trees.data, trees.isPending, trees.error, rememberedId, select],
  );

  return <CurrentTreeContext.Provider value={value}>{children}</CurrentTreeContext.Provider>;
}
