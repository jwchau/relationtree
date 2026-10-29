import { useState } from 'react';
import { Plus } from 'lucide-react';
import { toast } from 'sonner';
import type { Person } from '@/api/client';
import { useCreatePerson } from '@/hooks/usePerson';
import { useCreateConnection } from '@/hooks/useConnections';
import {
  CONNECTION_CHOICES,
  connectionChoiceLabel,
  connectionChoiceRole,
  connectionChoiceType,
  connectionFromChoice,
  connectionLabel,
  type ConnectionChoice,
} from '@/lib/relationshipTypes';
import {
  RELATIONSHIP_CATEGORIES,
  categoryLabel,
  type RelationshipCategory,
} from '@/lib/relationshipTypes';
import { PersonPicker } from '@/components/connection/PersonPicker';
import { ConnectionKindFields, type ConnectionKind } from '@/components/connection/ConnectionKindFields';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';

export interface AddConnectionDialogProps {
  personId: string;
  personName: string;
  /** The person's tree: new people are added to it, and only its people can be picked. */
  treeId: string;
  /** Open on first render, as when the map's Link to… sends someone here (FG-11). */
  defaultOpen?: boolean;
}

const NO_KIND: ConnectionKind = { parentKind: null, ended: false };

export function AddConnectionDialog({
  personId,
  personName,
  treeId,
  defaultOpen = false,
}: AddConnectionDialogProps) {
  const [open, setOpen] = useState(defaultOpen);
  const [otherPerson, setOtherPerson] = useState<Person | null>(null);
  const [newPersonName, setNewPersonName] = useState<string | null>(null);
  const [newPersonCategory, setNewPersonCategory] = useState<RelationshipCategory>('FRIEND');
  const [choice, setChoice] = useState<ConnectionChoice>('FRIEND');
  const [kind, setKind] = useState<ConnectionKind>(NO_KIND);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const createPerson = useCreatePerson(treeId);
  const createConnection = useCreateConnection();

  function reset() {
    setOtherPerson(null);
    setNewPersonName(null);
    setNewPersonCategory('FRIEND');
    setChoice('FRIEND');
    setKind(NO_KIND);
  }

  async function handleSubmit() {
    setIsSubmitting(true);
    try {
      let targetPersonId = otherPerson?.id;
      let targetPersonName = otherPerson?.name;

      if (!targetPersonId && newPersonName) {
        const created = await createPerson.mutateAsync({
          name: newPersonName,
          relationship_category: newPersonCategory,
        });
        targetPersonId = created.id;
        targetPersonName = created.name;
      }

      if (!targetPersonId) {
        toast.error('Choose or add a person first');
        return;
      }

      await createConnection.mutateAsync({
        ...connectionFromChoice(choice, personId, targetPersonId),
        parentKind: kind.parentKind,
        ended: kind.ended,
      });

      toast.success(`Connected ${personName} and ${targetPersonName}`);
      setOpen(false);
      reset();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to add connection');
    } finally {
      setIsSubmitting(false);
    }
  }

  const otherName = otherPerson?.name ?? newPersonName;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button variant="secondary">
          <Plus />
          Add connection
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add connection</DialogTitle>
          <DialogDescription>
            Link {personName} to someone already in RelationTree, or add a new person.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div className="space-y-2">
            <Label>Person</Label>
            <PersonPicker
              treeId={treeId}
              excludePersonId={personId}
              value={otherPerson}
              onChange={(person) => {
                setOtherPerson(person);
                setNewPersonName(null);
              }}
              onCreateNew={(name) => {
                setNewPersonName(name);
                setOtherPerson(null);
              }}
            />
          </div>

          {newPersonName && (
            <div className="bg-surface-2 space-y-3 rounded-[12px] p-4">
              <p className="text-[15px]">
                Creating a new person: <span className="font-medium">{newPersonName}</span>
              </p>
              <Label>Category</Label>
              <Select
                value={newPersonCategory}
                onValueChange={(v) => setNewPersonCategory(v as RelationshipCategory)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {RELATIONSHIP_CATEGORIES.map((category) => (
                    <SelectItem key={category} value={category}>
                      {categoryLabel(category)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-2">
            <Label>Relationship</Label>
            <Select
              value={choice}
              onValueChange={(v) => {
                setChoice(v as ConnectionChoice);
                setKind(NO_KIND);
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CONNECTION_CHOICES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {connectionChoiceLabel(c)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {otherName && (
              <p className="text-muted-foreground text-[15px] leading-[22px]">
                {personName} is the{' '}
                {connectionLabel(
                  connectionChoiceRole(choice),
                  kind.parentKind,
                  kind.ended,
                ).toLowerCase()}{' '}
                of {otherName}.
              </p>
            )}
          </div>

          <ConnectionKindFields type={connectionChoiceType(choice)} {...kind} onChange={setKind} />
        </div>

        <DialogFooter>
          <Button
            onClick={handleSubmit}
            disabled={isSubmitting || (!otherPerson && !newPersonName)}
          >
            {isSubmitting ? 'Saving...' : 'Add connection'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
