import { createContext, useContext } from 'react';
import type { Tree } from '@/api/client';
import { hueFor } from '@/lib/categoryHues';
import type { RelationshipCategory } from '@/lib/relationshipTypes';
import { permissionsFor } from '@/lib/trees';

export interface CurrentTree {
  /** Null while loading, or when the user belongs to no tree. */
  tree: Tree | null;
  trees: Tree[];
  loading: boolean;
  error: string | null;
  select: (treeId: string) => void;
}

export const CurrentTreeContext = createContext<CurrentTree | null>(null);

/** The tree the app is showing (picked in the header), and what the user may do in it. */
export function useCurrentTree() {
  const context = useContext(CurrentTreeContext);
  if (!context) throw new Error('useCurrentTree must be used inside CurrentTreeProvider');
  return { ...context, ...permissionsFor(context.tree?.role) };
}

/** What the user may do with a record in some tree (which may not be the current one). */
export function useTreePermissions(treeId: string | undefined) {
  const { trees } = useCurrentTree();
  return permissionsFor(trees.find((t) => t.id === treeId)?.role);
}

/** How a tree (by default the current one) colours each category: a `data-hue` value, or
 * undefined for plain. */
export function useCategoryHue(treeId?: string) {
  const { tree, trees } = useCurrentTree();
  const hues = (treeId ? trees.find((t) => t.id === treeId) : tree)?.category_hues;
  return (category: RelationshipCategory | null | undefined) => hueFor(hues, category);
}
