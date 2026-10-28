import { describe, expect, it } from 'vitest';
import type { Proposal } from '@/api/client';
import { buildApplyRequest, describeConnection, initialReview, savedMessage } from './extract';

const proposal: Proposal = {
  people: [
    { ref: 'p1', name: 'Jordan Park', match_id: null, category: 'FRIEND', context: 'Met at the wedding', note: null },
    { ref: 'p2', name: 'Alex Rivera', match_id: 'alex', category: null, context: null, note: 'Got married' },
    { ref: 'p3', name: 'Sam', match_id: null, category: null, context: null, note: null },
  ],
  connections: [
    { a: 'p1', b: 'p2', type: 'FRIEND' },
    { a: 'p2', b: 'p3', type: 'SIBLING' },
  ],
};

describe('initialReview', () => {
  it('starts with everything included as the model proposed it', () => {
    const review = initialReview(proposal);
    expect(review.people.map((p) => [p.ref, p.matchId, p.text, p.include])).toEqual([
      ['p1', null, 'Met at the wedding', true],
      ['p2', 'alex', 'Got married', true],
      ['p3', null, '', true],
    ]);
    expect(review.connections.every((c) => c.include)).toBe(true);
  });
});

describe('buildApplyRequest', () => {
  it('sends what the model proposed when nothing was changed', () => {
    expect(buildApplyRequest(initialReview(proposal))).toEqual({
      people: [
        { ref: 'p1', name: 'Jordan Park', match_id: null, category: 'FRIEND', context: 'Met at the wedding', note: null },
        { ref: 'p2', name: 'Alex Rivera', match_id: 'alex', category: null, context: null, note: 'Got married' },
        { ref: 'p3', name: 'Sam', match_id: null, category: null, context: null, note: null },
      ],
      connections: proposal.connections,
    });
  });

  it('drops skipped people and every connection to them', () => {
    const review = initialReview(proposal);
    review.people[2].include = false;
    const request = buildApplyRequest(review);
    expect(request.people.map((p) => p.ref)).toEqual(['p1', 'p2']);
    expect(request.connections).toEqual([{ a: 'p1', b: 'p2', type: 'FRIEND' }]);
  });

  it('applies edited names and matches, and moves the text to fit', () => {
    const review = initialReview(proposal);
    review.people[0].name = '  Jordan Parker ';
    review.people[2].matchId = 'sam-lee'; // "Sam" is really an existing person
    review.people[2].text = 'Moving to Denver';
    review.people[1].matchId = null; // and "Alex" turns out to be someone new
    const [jordan, alex, sam] = buildApplyRequest(review).people;
    expect(jordan.name).toBe('Jordan Parker');
    expect(alex).toMatchObject({ match_id: null, context: 'Got married', note: null });
    expect(sam).toMatchObject({ match_id: 'sam-lee', context: null, note: 'Moving to Denver', category: null });
  });

  it('leaves out unticked text and unticked connections', () => {
    const review = initialReview(proposal);
    review.people[1].includeText = false;
    review.connections[0].include = false;
    const request = buildApplyRequest(review);
    expect(request.people[1].note).toBeNull();
    expect(request.connections).toEqual([{ a: 'p2', b: 'p3', type: 'SIBLING' }]);
  });
});

describe('describeConnection', () => {
  it('says which way round a directional connection goes', () => {
    expect(describeConnection('Alex', 'Jordan', 'MANAGER')).toBe("Alex is Jordan's manager");
    expect(describeConnection('Nina', 'Lily', 'PARENT')).toBe("Nina is Lily's parent");
  });

  it('has no direction for the others', () => {
    expect(describeConnection('Alex', 'Jordan', 'FRIEND')).toBe('Alex and Jordan: Friend');
  });

  it('names step, adoptive and former links', () => {
    expect(describeConnection('Lee', 'Kit', 'PARENT', { parent_kind: 'STEP' })).toBe("Lee is Kit's step-parent");
    expect(describeConnection('Mae', 'Robin', 'PARENT', { parent_kind: 'ADOPTIVE' })).toBe(
      "Mae is Robin's adoptive parent",
    );
    expect(describeConnection('Nina', 'Lily', 'PARENT', { parent_kind: 'BIOLOGICAL' })).toBe("Nina is Lily's parent");
    expect(describeConnection('Robin', 'Lee', 'SPOUSE', { ended: true })).toBe('Robin and Lee: Former spouse');
  });
});

describe('buildApplyRequest and kinds', () => {
  it('sends back the kind and whether a partnership has ended', () => {
    const withKinds: Proposal = {
      people: [
        { ref: 'p1', name: 'Robin', match_id: 'robin', category: null, context: null, note: null },
        { ref: 'p2', name: 'Lee', match_id: null, category: null, context: null, note: null },
      ],
      connections: [
        { a: 'p1', b: 'p2', type: 'SPOUSE', parent_kind: null, ended: true },
        { a: 'p2', b: 'p1', type: 'PARENT', parent_kind: 'STEP', ended: false },
      ],
    };
    expect(buildApplyRequest(initialReview(withKinds)).connections).toEqual(withKinds.connections);
  });
});

describe('savedMessage', () => {
  const person = { id: 'x', name: 'X' } as never;
  const applied = (counts: { created?: number; updated?: number; added?: number; changed?: number }) => ({
    created: Array(counts.created ?? 0).fill(person),
    updated: Array(counts.updated ?? 0).fill(person),
    connections_added: counts.added ?? 0,
    connections_updated: counts.changed ?? 0,
    connections_skipped: 0,
  });

  it('counts what was saved, including links the note changed', () => {
    expect(savedMessage(applied({ created: 1, added: 2, changed: 1 }))).toBe(
      'Saved: 1 added, 2 connections, 1 connection changed',
    );
    expect(savedMessage(applied({ updated: 2, changed: 2 }))).toBe('Saved: 2 updated, 2 connections changed');
  });

  it('says when there was nothing new', () => {
    expect(savedMessage(applied({}))).toBe('Nothing new to save');
  });
});
