import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ReactFlow, Background, Controls } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { buildEgoGraph } from '@/components/graph/graphLayout';
import { PersonNode } from '@/components/graph/PersonNode';
import type { ConnectionWithPerson } from '@/hooks/useConnections';

const nodeTypes = { person: PersonNode };

export interface EgoGraphProps {
  centerId: string;
  centerName: string;
  centerPhotoUrl: string | null;
  connections: ConnectionWithPerson[];
}

export function EgoGraph({ centerId, centerName, centerPhotoUrl, connections }: EgoGraphProps) {
  const navigate = useNavigate();
  const { nodes, edges } = useMemo(
    () => buildEgoGraph(centerId, centerName, centerPhotoUrl, connections),
    [centerId, centerName, centerPhotoUrl, connections],
  );

  if (connections.length === 0) {
    return (
      <div className="text-muted-foreground flex h-48 items-center justify-center rounded-md border text-sm">
        No connections to visualize yet.
      </div>
    );
  }

  return (
    <div className="h-80 rounded-md border">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodeClick={(_, node) => {
          if (node.id !== centerId) navigate(`/people/${node.id}`);
        }}
        fitView
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        proOptions={{ hideAttribution: true }}
      >
        <Background />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}
