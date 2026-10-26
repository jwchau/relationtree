import { createContext } from 'react';

/** The map's root, so cards can leave out "Make centre" on the person already at the centre.
 * A context rather than a prop, so memoised slots don't redraw for it. */
export const MapRootContext = createContext<string | null>(null);
