import { Handle, Position, type NodeProps } from '@xyflow/react';
import { PersonAvatar } from '@/components/person/PersonAvatar';
import { cn } from '@/lib/utils';

export interface PersonNodeData extends Record<string, unknown> {
  name: string;
  photoUrl: string | null;
  isCenter: boolean;
}

const SIDES = ['top', 'bottom', 'left', 'right'] as const;
const POSITIONS = {
  top: Position.Top,
  bottom: Position.Bottom,
  left: Position.Left,
  right: Position.Right,
};

export function PersonNode({ data }: NodeProps) {
  const { name, photoUrl, isCenter } = data as PersonNodeData;

  return (
    <div
      className={cn(
        'bg-surface-2 flex flex-col items-center gap-1.5 rounded-[12px] px-3 py-2.5 shadow-[var(--elevation-3)] transition-colors duration-200',
        isCenter
          ? 'shadow-[inset_0_0_0_2px_var(--accent-text),var(--elevation-3)]'
          : 'hover:bg-surface-3 cursor-pointer',
      )}
    >
      <PersonAvatar name={name} photoUrl={photoUrl} className={isCenter ? 'size-12' : 'size-9'} />
      <span className="max-w-28 truncate text-[13px] leading-[18px] font-semibold">{name}</span>
      {/* Edges pick the side facing the other person (see graphLayout.ts). */}
      {SIDES.map((side) => (
        <Handle key={`s-${side}`} id={side} type="source" position={POSITIONS[side]} className="opacity-0" />
      ))}
      {SIDES.map((side) => (
        <Handle key={`t-${side}`} id={side} type="target" position={POSITIONS[side]} className="opacity-0" />
      ))}
    </div>
  );
}
