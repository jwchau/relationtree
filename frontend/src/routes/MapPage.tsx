import { useCallback, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import type { GraphPerson } from '@/api/client';
import { MapCanvas } from '@/components/map/MapCanvas';
import { NotConnectedTray } from '@/components/map/NotConnectedTray';
import { Note, PageBand, PageBody } from '@/components/kiln/Page';
import { PersonAvatar } from '@/components/person/PersonAvatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useCurrentTree } from '@/hooks/useCurrentTree';
import { useSetMe } from '@/hooks/usePerson';
import { useCrossFade } from '@/hooks/useCrossFade';
import { useTreeGraph } from '@/hooks/useTreeGraph';
import { focusParam } from '@/lib/map/focus';
import { resolveRoot } from '@/lib/map/mapRoot';
import { cn } from '@/lib/utils';

const PICKER_LIMIT = 30;
/** Make centre cross-fades the old map into the new one over this long. */
const FADE_MS = 300;
const MAP_HEIGHT = 'h-[calc(100svh-15rem)] min-h-[360px]';

export default function MapPage() {
  const { tree, loading: treesLoading, error: treesError, canEdit } = useCurrentTree();
  const { graph, loading: graphLoading, error: graphError } = useTreeGraph(tree?.id);
  const [params, setParams] = useSearchParams();
  const rootParam = params.get('root');
  // Keep the focused frame in the URL so the view can be shared. Replace, not push: zooming
  // shouldn't fill the history, and Back should leave the map (or, later, the previous root).
  const onFocusChange = useCallback(
    (path: string[]) => {
      setParams(
        (prev) => {
          const focus = focusParam(path);
          if (prev.get('focus') === focus) return prev;
          const next = new URLSearchParams(prev);
          if (focus) next.set('focus', focus);
          else next.delete('focus');
          return next;
        },
        { replace: true },
      );
    },
    [setParams],
  );
  const loading = treesLoading || (tree !== null && graphLoading);
  const error = treesError ?? graphError;

  const people = useMemo(() => new Map(graph?.people.map((p) => [p.id, p])), [graph]);
  const root = graph ? resolveRoot(graph, rootParam) : null;
  const rootId = root?.kind === 'person' ? root.id : null;
  const centre = rootId ? people.get(rootId) : undefined;
  // A new root (Make centre, or Back) fades the old map out under the new one.
  const canvases = useCrossFade(rootId ?? '', FADE_MS).filter((c) => c.key !== '');

  return (
    <>
      <PageBand
        title="Map"
        meta={
          tree &&
          (centre ? (
            <>
              <span>{tree.name}</span>
              <span aria-hidden>·</span>
              <span>Centred on {centre.name}</span>
            </>
          ) : (
            tree.name
          ))
        }
      />
      <PageBody className="space-y-4">
        {!loading && !error && !tree && (
          <div className="panel p-5">
            <Note>You aren&apos;t in any tree. Create one from the tree menu at the top.</Note>
          </div>
        )}
        {loading && (
          <div
            className={`panel bg-surface-2 animate-pulse ${MAP_HEIGHT}`}
            aria-busy="true"
            aria-label="Loading the map"
          />
        )}
        {error && <Note tone="error">{error}</Note>}

        {graph && graph.people.length === 0 && (
          <div className="panel p-5">
            <Note>No one in this tree yet, so there&apos;s nothing to map.</Note>
          </div>
        )}

        {graph && rootId && (
          <div className={`panel relative overflow-hidden ${MAP_HEIGHT}`}>
            {canvases.map(({ key, leaving }) => (
              // The leaving map can't be used and no longer writes the URL; it only fades.
              <div
                key={key}
                inert={leaving}
                className={cn(
                  'absolute inset-0 duration-300 ease-[var(--ease)]',
                  leaving ? 'animate-out fade-out-0 fill-mode-forwards' : canvases.length > 1 && 'animate-in fade-in-0',
                )}
              >
                <MapCanvas
                  graph={graph}
                  rootId={key}
                  people={people}
                  initialFocus={params.get('focus')}
                  onFocusChange={leaving ? undefined : onFocusChange}
                  className="size-full"
                />
              </div>
            ))}
          </div>
        )}

        {graph && rootId && (
          <NotConnectedTray key={rootId} graph={graph} rootId={rootId} people={people} canEdit={canEdit} />
        )}

        {graph && graph.people.length > 0 && root && root.kind !== 'person' && (
          <RootPicker people={graph.people} unknownRoot={root.kind === 'unknown'} />
        )}
      </PageBody>
    </>
  );
}

/** Choose who the map centres on, or mark yourself once so it opens on you next time. */
function RootPicker({ people, unknownRoot }: { people: GraphPerson[]; unknownRoot: boolean }) {
  const [search, setSearch] = useState('');
  const matches = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return people.filter((p) => p.name.toLowerCase().includes(needle)).slice(0, PICKER_LIMIT);
  }, [people, search]);

  return (
    <section className="panel space-y-4 p-5" aria-labelledby="root-picker-title">
      <div className="space-y-1">
        <h2 id="root-picker-title" className="display-face text-[20px] leading-[26px]">
          Who should the map centre on?
        </h2>
        {unknownRoot ? (
          <Note tone="error">That person isn&apos;t in this tree. Pick someone who is.</Note>
        ) : (
          <Note>Mark yourself with &ldquo;This is me&rdquo; and the map will open on you from now on.</Note>
        )}
      </div>
      <Input
        placeholder="Filter by name..."
        aria-label="Filter by name"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="sm:w-72"
      />
      {matches.length === 0 ? (
        <Note>No one matches.</Note>
      ) : (
        <ul className="divide-y divide-hairline">
          {matches.map((person) => (
            <PickerRow key={person.id} person={person} />
          ))}
        </ul>
      )}
    </section>
  );
}

function PickerRow({ person }: { person: GraphPerson }) {
  const setMe = useSetMe(person.id);
  return (
    <li className="flex flex-wrap items-center gap-3 py-2">
      <PersonAvatar name={person.name} photoUrl={person.photo_url} />
      <span className="min-w-0 flex-1 font-medium [overflow-wrap:anywhere]">{person.name}</span>
      <div className="flex gap-2">
        <Button asChild variant="ghost">
          <Link to={`/map?root=${person.id}`}>Centre here</Link>
        </Button>
        <Button variant="secondary" disabled={setMe.isPending} onClick={() => setMe.mutate(true)}>
          This is me
        </Button>
      </div>
    </li>
  );
}
