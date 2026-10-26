/** How much of a person to draw, by their slot's width on screen (design doc Q5). At
 * 'frame' the slot opens into the person's own frame (when they own anyone to show). */
export type Detail = 'dot' | 'avatar' | 'name' | 'card' | 'frame';

const LEVELS: Detail[] = ['dot', 'avatar', 'name', 'card', 'frame'];

/** The slot widths, in screen pixels, where each level after 'dot' starts. */
export const DETAIL_THRESHOLDS = [12, 40, 120, 360] as const;

export function detailFor(slotScreenPx: number): Detail {
  return LEVELS[DETAIL_THRESHOLDS.filter((t) => slotScreenPx >= t).length];
}
