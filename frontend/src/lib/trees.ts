import type { Tree, TreeRole } from '@/api/client';

/**
 * The tree to show: the one this browser remembers, if the user is still in it; else one they
 * own; else any. Null only when they belong to no tree at all.
 */
export function pickCurrentTree(trees: Tree[], rememberedId: string | null): Tree | null {
  return (
    trees.find((t) => t.id === rememberedId) ??
    trees.find((t) => t.role === 'owner') ??
    trees[0] ??
    null
  );
}

/** What the UI offers for a role. The API enforces the same rules; this only hides controls. */
export function permissionsFor(role: TreeRole | undefined) {
  return { canEdit: role === 'owner' || role === 'editor', canManage: role === 'owner' };
}
