const NARROW_MAX = 4;

/** The breadcrumb for a focus path: every frame, or on a narrow screen the root, a gap
 * (null) and the last two once there are more than four. */
export function crumbs(path: string[], narrow: boolean): (string | null)[] {
  if (!narrow || path.length <= NARROW_MAX) return path;
  return [path[0], null, ...path.slice(-2)];
}
