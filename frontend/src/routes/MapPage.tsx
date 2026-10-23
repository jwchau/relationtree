import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import type { GraphPerson } from '@/api/client';
import { MapCanvas } from '@/components/map/MapCanvas';
import { Note, PageBand, PageBody } from '@/components/kiln/Page';
import { PersonAvatar } from '@/components/person/PersonAvatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useCurrentTree } from '@/hooks/useCurrentTree';
import { useSetMe } from '@/hooks/usePerson';
import { useTreeGraph } from '@/hooks/useTreeGraph';
import { familyCore } from '@/lib/map/familyCore';
import { resolveRoot } from '@/lib/map/mapRoot';

const PICKER_LIMIT = 30;

export default function MapPage() {
  const { tree, loading: treesLoading, error: treesError } = useCurrentTree();
  const { graph, loading: graphLoading, error: graphError } = useTreeGraph(tree?.id);
  const [params] = useSearchParams();
  const rootParam = params.get('root');
  const loading = treesLoading || (tree !== null && graphLoading);
  const error = treesError ?? graphError;

  const people = useMemo(() => new Map(graph?.people.map((p) => [p.id, p])), [graph]);
  const root = graph ? resolveRoot(graph, rootParam) : null;
  const rootId = root?.kind === 'person' ? root.id : null;
  const core = useMemo(() => (graph && rootId ? familyCore(graph, rootId) : null), [graph, rootId]);
  const centre = core ? people.get(core.self) : undefined;

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
            className="panel bg-surface-2 h-[calc(100svh-15rem)] min-h-[360px] animate-pulse"
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

        {graph && core && (
          <div className="panel overflow-hidden">
            <MapCanvas core={core} people={people} className="h-[calc(100svh-15rem)] min-h-[360px] w-full" />
          </div>
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
