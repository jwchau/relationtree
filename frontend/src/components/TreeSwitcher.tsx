import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ChevronsUpDown, Plus, Settings } from 'lucide-react';
import { toast } from 'sonner';
import { useCurrentTree } from '@/hooks/useCurrentTree';
import { useCreateTree } from '@/hooks/useTrees';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

/** Header menu: which tree the app shows, its settings, and making a new one. */
export function TreeSwitcher() {
  const { tree, trees, select } = useCurrentTree();
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);

  function switchTo(treeId: string) {
    select(treeId);
    navigate('/');
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="max-w-56">
            <span className="truncate">{tree?.name ?? 'No tree'}</span>
            <ChevronsUpDown className="opacity-50" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-64">
          <DropdownMenuLabel>Trees</DropdownMenuLabel>
          <DropdownMenuRadioGroup value={tree?.id} onValueChange={switchTo}>
            {trees.map((t) => (
              <DropdownMenuRadioItem key={t.id} value={t.id}>
                <span className="truncate">{t.name}</span>
                <span className="text-muted-foreground ml-auto text-xs capitalize">{t.role}</span>
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
          <DropdownMenuSeparator />
          {tree && (
            <DropdownMenuItem asChild>
              <Link to={`/trees/${tree.id}`}>
                <Settings />
                Members and settings
              </Link>
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onSelect={() => setCreating(true)}>
            <Plus />
            New tree
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <NewTreeDialog open={creating} onOpenChange={setCreating} onCreated={switchTo} />
    </>
  );
}

function NewTreeDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (treeId: string) => void;
}) {
  const [name, setName] = useState('');
  const createTree = useCreateTree();

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    try {
      const created = await createTree.mutateAsync(name.trim());
      toast.success(`${created.name} created`);
      setName('');
      onOpenChange(false);
      onCreated(created.id);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create tree');
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>New tree</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="new-tree-name">Name</Label>
            <Input
              id="new-tree-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Work"
              maxLength={200}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={!name.trim() || createTree.isPending}>
              Create
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
