/** How much of a person to draw, by their slot's width on screen (design doc Q5). */
export type Detail = 'dot' | 'avatar' | 'name' | 'card';

export function detailFor(slotScreenPx: number): Detail {
  if (slotScreenPx < 12) return 'dot';
  if (slotScreenPx < 40) return 'avatar';
  if (slotScreenPx < 120) return 'name';
  return 'card';
}
