import { Handle, Position, type NodeProps } from '@xyflow/react';
import { User } from 'lucide-react';
import { usePhotoUrl } from '@/hooks/usePhotoUrl';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';

export interface PersonNodeData extends Record<string, unknown> {
  name: string;
  photoKey: string | null | undefined;
  isCenter: boolean;
}

export function PersonNode({ data }: NodeProps) {
  const { name, photoKey, isCenter } = data as PersonNodeData;
  const url = usePhotoUrl(photoKey);

  return (
    <div
      className={cn(
        'bg-background flex flex-col items-center gap-1 rounded-lg border px-3 py-2 shadow-sm',
        isCenter && 'ring-primary ring-2',
      )}
    >
      <Handle type="target" position={Position.Top} className="opacity-0" />
      <Avatar className={isCenter ? 'size-12' : 'size-9'}>
        <AvatarImage src={url ?? undefined} alt={name} />
        <AvatarFallback>
          <User className="size-4" />
        </AvatarFallback>
      </Avatar>
      <span className="max-w-24 truncate text-xs font-medium">{name}</span>
      <Handle type="source" position={Position.Bottom} className="opacity-0" />
    </div>
  );
}
