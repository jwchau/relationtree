import { createContext } from 'react';

/** What the slots need from the map, given through context rather than props so memoised
 * slots don't redraw for it. */
export interface MapContextValue {
  /** The map's root: its own card has no "Make centre". */
  rootId: string;
  /** Moves the camera to where a person is drawn (a chip's action, FG-7). */
  goTo: (personId: string) => void;
  /** Whether a person has a frame of their own to zoom into. */
  hasFrame: (personId: string) => boolean;
  /** Zooms into a person's own frame (a slot's action, FG-12). */
  zoomInto: (personId: string) => void;
  /** The name of the person whose frame really draws someone, for a chip's label; null
   * for the root, who is drawn at the centre of the map. */
  drawnIn: (personId: string) => string | null;
}

export const MapContext = createContext<MapContextValue | null>(null);
