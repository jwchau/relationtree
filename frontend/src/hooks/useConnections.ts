import type { Person } from '@/api/client';
import type { RelationshipType } from '@/lib/relationshipTypes';

// Connections are being rebuilt on the Django API (M9, see docs/backend-migration-plan.md).
// Until then they're disabled; these keep the connection UI compiling for that rewire.

export const CONNECTIONS_ENABLED = false;

export interface ConnectionWithPerson {
  connectionId: string;
  relationshipType: RelationshipType;
  displayLabel: string;
  otherPerson: Person;
}

const NOT_YET = 'Connections are coming back in the next update.';

export function useConnections(_personId: string | undefined) {
  return {
    connections: [] as ConnectionWithPerson[],
    loading: false,
    error: null as string | null,
    refresh: () => {},
  };
}

export async function createConnection(_input: {
  personAId: string;
  personBId: string;
  relationshipType: RelationshipType;
}): Promise<void> {
  throw new Error(NOT_YET);
}

export async function deleteConnection(_connectionId: string): Promise<void> {
  throw new Error(NOT_YET);
}
