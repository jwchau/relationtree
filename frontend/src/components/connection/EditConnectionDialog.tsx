import { useState } from 'react';
import { Pencil } from 'lucide-react';
import { toast } from 'sonner';
import { useEditConnection, type ConnectionWithPerson } from '@/hooks/useConnections';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { ConnectionKindFields, type ConnectionKind } from './ConnectionKindFields';

/** Edits what can change about an existing link: a parent's kind, or whether a partnership
 * has ended (FG-8). The people and the type stay; remove and re-add to change those. */
export function EditConnectionDialog({ connection }: { connection: ConnectionWithPerson }) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<ConnectionKind>({
    parentKind: connection.parentKind,
    ended: connection.ended,
  });
  const edit = useEditConnection();
  const name = connection.otherPerson.name;
  const isParent = connection.relationshipType === 'PARENT';

  async function handleSave() {
    try {
      await edit.mutateAsync({
        connectionId: connection.connectionId,
        parentKind: isParent ? (kind.parentKind ?? 'BIOLOGICAL') : undefined,
        ended: isParent ? undefined : kind.ended,
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save the connection');
      return;
    }
    toast.success('Connection saved');
    setOpen(false);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        // Opening again starts from what's saved.
        if (next) setKind({ parentKind: connection.parentKind, ended: connection.ended });
      }}
    >
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          className="text-muted-foreground hover:text-text"
          aria-label={`Edit connection to ${name}`}
        >
          <Pencil />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit connection</DialogTitle>
          <DialogDescription>
            {isParent ? `What kind of parent link is this with ${name}?` : `Is ${name} a former partner?`}
          </DialogDescription>
        </DialogHeader>
        <ConnectionKindFields type={connection.relationshipType} {...kind} onChange={setKind} />
        <DialogFooter>
          <Button onClick={handleSave} disabled={edit.isPending}>
            {edit.isPending ? 'Saving...' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
