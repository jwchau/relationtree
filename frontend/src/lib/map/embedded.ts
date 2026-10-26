/** The parts of a DOM event the embedded map's input rules read. */
export interface InputEvent {
  type: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  button?: number;
  touches?: { length: number };
}

/** d3-zoom's filter for a map inside a scrolling page, like an embedded Google Map. Plain
 * scrolling and one-finger swipes are left to the page. Ctrl/⌘ + wheel (a trackpad pinch
 * arrives as ctrl + wheel) and two fingers move the map. d3-zoom starts a gesture with every
 * finger in `event.touches`, so the finger that was ignored on its own joins the pinch. */
export function embeddedZoomFilter(event: InputEvent): boolean {
  if (event.type === 'wheel') return Boolean(event.ctrlKey || event.metaKey);
  if (event.type === 'touchstart') return (event.touches?.length ?? 0) >= 2;
  // d3-zoom's default for the mouse: the main button, and not ctrl-click (a Mac right-click).
  return !event.ctrlKey && !event.button;
}

export type EmbeddedHint = 'scroll' | 'touch';

/** Which hint to show when the page, not the map, took an input: plain scrolling over the
 * map, or a one-finger swipe across it. */
export function embeddedHint(event: InputEvent): EmbeddedHint | null {
  if (event.type === 'wheel' && !embeddedZoomFilter(event)) return 'scroll';
  if (event.type === 'touchmove' && event.touches?.length === 1) return 'touch';
  return null;
}
