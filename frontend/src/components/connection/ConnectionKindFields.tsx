import { useId } from 'react';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  PARENT_KINDS,
  parentKindLabel,
  type ParentKind,
  type RelationshipType,
} from '@/lib/relationshipTypes';

export interface ConnectionKind {
  parentKind: ParentKind | null;
  ended: boolean;
}

/** The extra detail a link can carry (FG-8): a parent link's kind, or whether a spouse link
 * has ended. Nothing for other links. Used when adding a connection and when editing one. */
export function ConnectionKindFields({
  type,
  parentKind,
  ended,
  onChange,
}: ConnectionKind & { type: RelationshipType; onChange: (next: ConnectionKind) => void }) {
  const id = useId();
  if (type === 'PARENT') {
    return (
      <div className="space-y-2">
        <Label id={`${id}-kind`}>Kind</Label>
        <Select
          value={parentKind ?? 'BIOLOGICAL'}
          onValueChange={(v) => onChange({ parentKind: v as ParentKind, ended: false })}
        >
          <SelectTrigger className="w-full" aria-labelledby={`${id}-kind`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PARENT_KINDS.map((kind) => (
              <SelectItem key={kind} value={kind}>
                {parentKindLabel(kind)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    );
  }
  if (type === 'SPOUSE') {
    return (
      <label className="flex min-h-12 cursor-pointer items-center gap-3 text-[15px]">
        <input
          type="checkbox"
          className="size-5"
          checked={ended}
          onChange={(e) => onChange({ parentKind: null, ended: e.target.checked })}
        />
        Former partner
      </label>
    );
  }
  return null;
}
