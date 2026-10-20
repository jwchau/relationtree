import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ReactFlow, Background, Controls } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { buildEgoGraph } from '@/components/graph/graphLayout';
import { PersonNode } from '@/components/graph/PersonNode';
import { GroupLabelNode } from '@/components/graph/GroupLabelNode';
import { LabeledEdge } from '@/components/graph/LabeledEdge';
import type { ConnectionWithPerson } from '@/hooks/useConnections';

const nodeTypes = { person: PersonNode, groupLabel: GroupLabelNode };
const edgeTypes = { labeled: LabeledEdge };
const defaultEdgeOptions = { type: 'labeled' };

export interface EgoGraphProps {
  centerId: string;
  centerName: string;
  centerPhotoUrl: string | null;
  centerBirthday: string | null;
  connections: ConnectionWithPerson[];
}

export function EgoGraph({ centerId, centerName, centerPhotoUrl, centerBirthday, connections }: EgoGraphProps) {
  const navigate = useNavigate();
  const { nodes, edges } = useMemo(
    () => buildEgoGraph(centerId, centerName, centerPhotoUrl, connections, centerBirthday),
    [centerId, centerName, centerPhotoUrl, connections, centerBirthday],
  );

  if (connections.length === 0) {
    return (
      <div className="panel text-muted-foreground flex h-48 items-center justify-center p-5 text-[15px]">
        No connections to visualize yet.
      </div>
    );
  }

  return (
    <div className="panel h-96 overflow-hidden">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        defaultEdgeOptions={defaultEdgeOptions}
        onNodeClick={(_, node) => {
          if (node.type === 'person' && node.id !== centerId) navigate(`/people/${node.id}`);
        }}
        nodeOrigin={[0.5, 0.5]}
        fitView
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        proOptions={{ hideAttribution: true }}
      >
        <Background gap={24} size={1.5} />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}
