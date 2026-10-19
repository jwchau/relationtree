import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { CurrentTreeContext } from '@/hooks/useCurrentTree';
import { useTrees } from '@/hooks/useTrees';
import { pickCurrentTree } from '@/lib/trees';

const STORAGE_KEY = 'relationtree.currentTree';

// Remembering the tree is a convenience: without storage (private window, blocked site data)
// the app falls back to a tree the user owns.
function readRemembered(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function remember(treeId: string) {
  try {
    localStorage.setItem(STORAGE_KEY, treeId);
  } catch {
    // Not remembered across reloads; nothing else to do.
  }
}

export function CurrentTreeProvider({ children }: { children: ReactNode }) {
  const trees = useTrees();
  const [rememberedId, setRememberedId] = useState(readRemembered);

  const select = useCallback((treeId: string) => {
    setRememberedId(treeId);
    remember(treeId);
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
