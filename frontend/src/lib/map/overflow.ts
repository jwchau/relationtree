import type { BandKind } from './frameLayout';

/** Most slots a band shows (Q8c). Past it, the last becomes a "+N more" tile. */
export const BAND_CAP = 24;

const BANDS: BandKind[] = ['friends', 'coworkers', 'acquaintances'];

/** The id of a band's overflow frame: a frame that isn't a person, holding everyone past the
 * cap. It goes in `?focus=` and frame paths like a person's id. */
export function overflowId(owner: string, band: BandKind): string {
  return `${owner}~${band}`;
}

export function parseOverflowId(id: string): { owner: string; band: BandKind } | null {
  const at = id.lastIndexOf('~');
  if (at < 0) return null;
  const band = id.slice(at + 1) as BandKind;
  return BANDS.includes(band) ? { owner: id.slice(0, at), band } : null;
}

/** A band within the cap: the first 23 in the band's own order and a tile for the rest,
 * who go to the overflow frame sorted by name (decisions V, W). */
export function capBand(
  owner: string,
  band: BandKind,
  ids: string[],
  nameOf: (id: string) => string,
): { shown: string[]; rest: string[] } {
  if (ids.length <= BAND_CAP) return { shown: ids, rest: [] };
  const rest = ids
    .slice(BAND_CAP - 1)
    .sort((a, b) => nameOf(a).localeCompare(nameOf(b)) || (a < b ? -1 : a > b ? 1 : 0));
  return { shown: [...ids.slice(0, BAND_CAP - 1), overflowId(owner, band)], rest };
}

const BAND_NAMES: Record<BandKind, string> = {
  friends: 'Friends',
  coworkers: 'Coworkers',
  acquaintances: 'Acquaintances',
};

/** How the breadcrumb names a frame: the person, or an overflow frame's band and count. */
export function frameName(
  id: string,
  nameOf: (personId: string) => string | undefined,
  countOf: (frameId: string) => number,
): string {
  const over = parseOverflowId(id);
  if (!over) return nameOf(id) ?? '?';
  return `${BAND_NAMES[over.band]} (${countOf(id)} more)`;
}
