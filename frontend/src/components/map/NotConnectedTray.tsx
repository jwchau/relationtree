import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { GraphPerson, TreeGraph } from '@/api/client';
import { SectionHead } from '@/components/kiln/Page';
import { MapCanvas } from '@/components/map/MapCanvas';
import { PersonAvatar } from '@/components/person/PersonAvatar';
import { Button } from '@/components/ui/button';
import { mapModel } from '@/lib/map/model';
import { notConnected } from '@/lib/map/notConnected';

/** About two rows of people on a laptop (AB); the rest wait behind "Show all". */
const SHOWN = 12;

/** The people with no path to the root, under the map (FG-11). Clicking one previews their
 * own map here, leaving the main map where it is. */
export function NotConnectedTray({
  graph,
  rootId,
  people,
  canEdit,
}: {
  graph: TreeGraph;
  rootId: string;
  people: Map<string, GraphPerson>;
  canEdit: boolean;
}) {
  const unreached = useMemo(() => notConnected(graph, mapModel(graph, rootId).ownership), [graph, rootId]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const selected = unreached.find((p) => p.id === selectedId);
  if (unreached.length === 0) return null;

  return (
    <section className="panel p-5" aria-labelledby="not-connected-title">
      <SectionHead id="not-connected-title" title={`Not connected · ${unreached.length}`} />
      <ul className="flex flex-wrap gap-2">
        {(showAll ? unreached : unreached.slice(0, SHOWN)).map((person) => (
          <li key={person.id}>
            <Button
              variant="ghost"
              aria-pressed={person.id === selectedId}
              onClick={() => setSelectedId(person.id === selectedId ? null : person.id)}
              className="aria-pressed:bg-ghost-active gap-2 pl-2"
            >
              <PersonAvatar name={person.name} photoUrl={person.photo_url} className="size-8 text-xs" />
              <span>{person.name}</span>
            </Button>
          </li>
        ))}
        {!showAll && unreached.length > SHOWN && (
          <li>
            <Button variant="ghost" onClick={() => setShowAll(true)}>
              Show all {unreached.length}
            </Button>
          </li>
        )}
      </ul>
      {selected && (
        <div className="mt-4 space-y-3">
          <MapCanvas key={selected.id} graph={graph} rootId={selected.id} people={people} embedded className="bg-surface-2 h-[280px] rounded-[12px]" />
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="secondary">
              <Link to={`/map?root=${selected.id}`} aria-label={`Make ${selected.name} the centre`}>
                Make centre
              </Link>
            </Button>
            {/* No editing on the canvas (Q6): the person's page opens with Add connection. */}
            {canEdit && (
              <Button asChild variant="ghost">
                <Link to={`/people/${selected.id}?connect=1`} aria-label={`Link ${selected.name} to…`}>
                  Link to…
                </Link>
              </Button>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
