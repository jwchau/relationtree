import type { TreeGraph } from '@/api/client';
import type { FrameLayout } from './frameLayout';
import { frameLayouts } from './frames';
import { assignOwnership, type Ownership } from './ownership';

/** Who each frame draws, and each frame's layout (laid out on first use), for one root. */
export interface MapModel {
  ownership: Ownership;
  layoutOf: (personId: string) => FrameLayout | null;
}

// Per graph object: a refetch with new data is a new object, so its roots are laid out
// again, and the old graph's models go with it. TanStack Query keeps the object while the
// data is unchanged, so moving between roots and back reuses each root's layout (FG-5).
const cache = new WeakMap<TreeGraph, Map<string, MapModel>>();

/** The model for a graph and root, cached so that going back to a root is instant. */
export function mapModel(graph: TreeGraph, rootId: string): MapModel {
  let byRoot = cache.get(graph);
  if (!byRoot) cache.set(graph, (byRoot = new Map()));
  let model = byRoot.get(rootId);
  if (!model) {
    const ownership = assignOwnership(graph, rootId);
    model = { ownership, layoutOf: frameLayouts(graph, rootId, ownership) };
    byRoot.set(rootId, model);
  }
  return model;
}
