import { BaseEdge, EdgeLabelRenderer, getBezierPath, type EdgeProps } from '@xyflow/react';

/**
 * A bezier edge whose label is drawn in React Flow's HTML label layer, above every line.
 * The built-in SVG label sits inside its own edge's SVG, so lines drawn later cover it.
 */
export function LabeledEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  label,
  markerEnd,
  style,
}: EdgeProps) {
  const [path, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  return (
    <>
      <BaseEdge id={id} path={path} markerEnd={markerEnd} style={style} />
      {label && (
        <EdgeLabelRenderer>
          <span
            className="nodrag nopan bg-surface-2 text-muted-foreground pointer-events-none absolute rounded-[6px] px-1.5 py-0.5 text-[12px] leading-4 font-semibold whitespace-nowrap shadow-[var(--elevation-3)]"
            style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}
          >
            {label}
          </span>
        </EdgeLabelRenderer>
      )}
    </>
  );
}
