const STORAGE_KEY = 'relationtree.currentTree';

// Remembering the tree is a convenience: without storage (private window, blocked site data)
// the app falls back to a tree the user owns.
export function readRememberedTree(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function rememberTree(treeId: string) {
  try {
    localStorage.setItem(STORAGE_KEY, treeId);
  } catch {
    // Not remembered across reloads; nothing else to do.
  }
}
