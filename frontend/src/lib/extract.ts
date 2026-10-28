import type { Applied, Proposal, ProposedPerson } from '@/api/client';
import { relationshipLabel, type ParentKind, type RelationshipType } from '@/lib/relationshipTypes';

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
  /** Step or adoptive on a parent link, and a partnership that has ended: shown, not edited. */
  parent_kind?: ParentKind | null;
  ended?: boolean;
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
      .map(({ a, b, type, parent_kind, ended }) => ({ a, b, type, parent_kind, ended })),
  };
}

/** The toast after saving a reviewed note: who was added or updated, and which links were
 * added or changed (a link the note now calls former, step or adoptive). */
export function savedMessage(applied: Applied): string {
  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
  const parts = [
    applied.created.length && `${applied.created.length} added`,
    applied.updated.length && `${applied.updated.length} updated`,
    applied.connections_added && plural(applied.connections_added, 'connection'),
    applied.connections_updated && `${plural(applied.connections_updated, 'connection')} changed`,
  ].filter(Boolean);
  return parts.length ? `Saved: ${parts.join(', ')}` : 'Nothing new to save';
}

const DIRECTIONAL: Partial<Record<RelationshipType, string>> = { PARENT: 'parent', MANAGER: 'manager' };
const PARENT_OF_KIND: Partial<Record<ParentKind, string>> = { STEP: 'step-parent', ADOPTIVE: 'adoptive parent' };

/** How a proposed connection reads in the review list, the right way round, naming a step,
 * adoptive or former link. */
export function describeConnection(
  a: string,
  b: string,
  type: RelationshipType,
  { parent_kind, ended }: Pick<ConnectionReview, 'parent_kind' | 'ended'> = {},
) {
  const role = (type === 'PARENT' && parent_kind && PARENT_OF_KIND[parent_kind]) || DIRECTIONAL[type];
  if (role) return `${a} is ${b}'s ${role}`;
  return `${a} and ${b}: ${type === 'SPOUSE' && ended ? 'Former spouse' : relationshipLabel(type)}`;
}
