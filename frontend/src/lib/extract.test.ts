import { describe, expect, it } from 'vitest';
import type { Proposal } from '@/api/client';
import { buildApplyRequest, describeConnection, initialReview } from './extract';

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
});
