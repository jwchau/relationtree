import { useState } from 'react';
import { toast } from 'sonner';
import type { Person } from '@/api/client';
import { useCreatePerson } from '@/hooks/usePerson';
import { useCreateConnection } from '@/hooks/useConnections';
import {
  RELATIONSHIP_TYPES,
  relationshipLabel,
  type RelationshipType,
} from '@/lib/relationshipTypes';
import {
  RELATIONSHIP_CATEGORIES,
  categoryLabel,
  type RelationshipCategory,
} from '@/lib/relationshipTypes';
import { PersonPicker } from '@/components/connection/PersonPicker';
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
}

export function AddConnectionDialog({ personId, personName }: AddConnectionDialogProps) {
  const [open, setOpen] = useState(false);
  const [otherPerson, setOtherPerson] = useState<Person | null>(null);
  const [newPersonName, setNewPersonName] = useState<string | null>(null);
  const [newPersonCategory, setNewPersonCategory] = useState<RelationshipCategory>('FRIEND');
  const [relationshipType, setRelationshipType] = useState<RelationshipType>('FRIEND');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const createPerson = useCreatePerson();
  const createConnection = useCreateConnection();

  function reset() {
    setOtherPerson(null);
    setNewPersonName(null);
    setNewPersonCategory('FRIEND');
    setRelationshipType('FRIEND');
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
        personAId: personId,
        personBId: targetPersonId,
        type: relationshipType,
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
        <Button variant="outline" size="sm">
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

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Person</Label>
            <PersonPicker
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
            <div className="space-y-2 rounded-md border p-3">
              <p className="text-sm">
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
              value={relationshipType}
              onValueChange={(v) => setRelationshipType(v as RelationshipType)}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {RELATIONSHIP_TYPES.map((type) => (
                  <SelectItem key={type} value={type}>
                    {relationshipLabel(type)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {otherName && (
              <p className="text-muted-foreground text-sm">
                {personName} is the {relationshipLabel(relationshipType).toLowerCase()} of{' '}
                {otherName}.
              </p>
            )}
          </div>
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
