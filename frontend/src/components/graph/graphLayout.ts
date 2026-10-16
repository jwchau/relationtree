import type { Node, Edge } from '@xyflow/react';
import type { ConnectionWithPerson } from '@/hooks/useConnections';
import type { PersonNodeData } from '@/components/graph/PersonNode';

const RADIUS = 220;

export function buildEgoGraph(
  centerId: string,
  centerName: string,
  centerPhotoUrl: string | null,
  connections: ConnectionWithPerson[],
): { nodes: Node[]; edges: Edge[] } {
  const centerData: PersonNodeData = { name: centerName, photoUrl: centerPhotoUrl, isCenter: true };
  const centerNode: Node = {
    id: centerId,
    type: 'person',
    position: { x: 0, y: 0 },
    data: centerData,
  };

  const count = connections.length;
  const otherNodes: Node[] = connections.map((c, i) => {
    const angle = (2 * Math.PI * i) / Math.max(count, 1) - Math.PI / 2;
    const data: PersonNodeData = {
      name: c.otherPerson.name,
      photoUrl: c.otherPerson.photo_url,
      isCenter: false,
    };
    return {
      id: c.otherPerson.id,
      type: 'person',
      position: { x: RADIUS * Math.cos(angle), y: RADIUS * Math.sin(angle) },
      data,
    };
  });

  const edges: Edge[] = connections.map((c) => ({
    id: c.connectionId,
    source: centerId,
    target: c.otherPerson.id,
    label: c.displayLabel,
  }));

  return { nodes: [centerNode, ...otherNodes], edges };
}
