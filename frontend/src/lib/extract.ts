import type { Proposal, ProposedPerson } from '@/api/client';
import { relationshipLabel, type RelationshipType } from '@/lib/relationshipTypes';

/** One proposed person as the user reviews them: kept or skipped, new or matched. */
export interface PersonReview {
  ref: string;
  include: boolean;
  /** An existing person in the tree, or null to add them as new. */
  matchId: string | null;
  name: string;
  category: ProposedPerson['category'];
  /** What the note says about them: context for someone new, a dated note for a match. */
  text: string;
  includeText: boolean;
}

export interface ConnectionReview {
  a: string;
  b: string;
  type: Proposal['connections'][number]['type'];
  include: boolean;
}

export interface Review {
  people: PersonReview[];
  connections: ConnectionReview[];
}

export function initialReview(proposal: Proposal): Review {
  return {
    people: proposal.people.map((p) => ({
      ref: p.ref,
      include: true,
      matchId: p.match_id ?? null,
      name: p.name,
      category: p.category ?? null,
      text: p.context ?? p.note ?? '',
      includeText: true,
    })),
    connections: proposal.connections.map((c) => ({ ...c, include: true })),
  };
}

/** The request for /api/extract/apply: only what the user kept, with their edits. */
export function buildApplyRequest(review: Review): Proposal {
  const kept = review.people.filter((p) => p.include);
  const keptRefs = new Set(kept.map((p) => p.ref));
  return {
    people: kept.map((p) => {
      const isNew = p.matchId === null;
      const text = p.includeText && p.text.trim() ? p.text.trim() : null;
      return {
        ref: p.ref,
        name: p.name.trim(),
        match_id: p.matchId,
        category: isNew ? p.category : null,
        context: isNew ? text : null,
        note: isNew ? null : text,
      };
    }),
    connections: review.connections
      .filter((c) => c.include && keptRefs.has(c.a) && keptRefs.has(c.b))
      .map(({ a, b, type }) => ({ a, b, type })),
  };
}

const DIRECTIONAL: Partial<Record<RelationshipType, string>> = { PARENT: 'parent', MANAGER: 'manager' };

/** How a proposed connection reads in the review list, the right way round. */
export function describeConnection(a: string, b: string, type: RelationshipType) {
  const role = DIRECTIONAL[type];
  return role ? `${a} is ${b}'s ${role}` : `${a} and ${b}: ${relationshipLabel(type)}`;
}
