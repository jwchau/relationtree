import { describe, expect, it } from 'vitest';
import { capBand, overflowId, parseOverflowId } from './overflow';

const people = (n: number) => Array.from({ length: n }, (_, i) => `p${String(i).padStart(3, '0')}`);
// Names sort the other way round from ids, so name order is visible in the results.
const nameOf = (id: string) => `Name ${999 - Number(id.slice(1))}`;

describe('capBand', () => {
  it('keeps a band of up to 24 as it is', () => {
    expect(capBand('A', 'coworkers', people(24), nameOf)).toEqual({ shown: people(24), rest: [] });
  });

  it('shows 23 people and a "+N more" tile past 24, the rest sorted by name', () => {
    const { shown, rest } = capBand('A', 'coworkers', people(25), nameOf);
    expect(shown).toEqual([...people(23), 'A~coworkers']);
    expect(rest).toEqual(['p024', 'p023']);
  });

  it('loses no one and repeats no one, however many there are', () => {
    for (const n of [25, 60, 200]) {
      const { shown, rest } = capBand('A', 'friends', people(n), nameOf);
      expect(shown).toHaveLength(24);
      expect(new Set([...shown.slice(0, -1), ...rest])).toEqual(new Set(people(n)));
      expect(rest).toHaveLength(n - 23);
    }
  });
});

describe('overflow ids', () => {
  it('round-trips the owner and the band', () => {
    expect(parseOverflowId(overflowId('c3b3', 'acquaintances'))).toEqual({ owner: 'c3b3', band: 'acquaintances' });
  });

  it("doesn't take a person's id for one", () => {
    expect(parseOverflowId('c3b3933c-09d6-4a93-ad28-c601d3622f2a')).toBeNull();
    expect(parseOverflowId('A~cousins')).toBeNull();
  });
});
