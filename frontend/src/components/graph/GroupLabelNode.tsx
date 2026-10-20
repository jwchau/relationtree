import type { NodeProps } from '@xyflow/react';

export interface GroupLabelData extends Record<string, unknown> {
  label: string;
}

/** A heading over one group of people in the ego graph (Family, Friends, Work...). */
export function GroupLabelNode({ data }: NodeProps) {
  const { label } = data as GroupLabelData;
  return (
    <span className="text-muted-foreground pointer-events-none text-[13px] leading-[18px] font-semibold whitespace-nowrap">
      {label}
    </span>
  );
}
