import { describe, expect, it } from 'vitest';
import { familyCore } from './familyCore';
import { assignOwnership } from './ownership';
import { categoryRuleApplies, socialCircles } from './social';
import { bigTree } from './testTree';

/** FNV-1a over the JSON, so a snapshot holds a short fingerprint rather than megabytes. */
function digest(value: unknown): string {
  let hash = 0x811c9dc5;
  for (const ch of JSON.stringify(value)) hash = Math.imul(hash ^ ch.charCodeAt(0), 0x01000193) >>> 0;
  return hash.toString(16);
}

// FG-12: the map at the product's stated scale. The speed-up (an index per graph) must not
// change a single result, so these pin what the plain scans gave before it.
describe('a 1,000-person tree', () => {
  const graph = bigTree();

  it('has the stated size', () => {
    expect([graph.people.length, graph.connections.length]).toEqual([1000, 3000]);
  });

  it('gives the same ownership from several roots', () => {
    const roots = ['P0', 'P40', 'P333', 'P699', 'P900'];
    expect(roots.map((root) => digest([...assignOwnership(graph, root)]))).toMatchSnapshot();
  });

  it("gives the same family core and social circles for everyone", () => {
    const cores = graph.people.map((p) => familyCore(graph, p.id));
    const circles = graph.people.map((p) =>
      socialCircles(graph, p.id, { categoryRule: categoryRuleApplies(graph, p.id, 'P40') }),
    );
    expect([digest(cores), digest(circles)]).toMatchSnapshot();
  });
});
