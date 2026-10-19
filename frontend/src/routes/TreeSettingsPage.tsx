import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, X } from 'lucide-react';
import { toast } from 'sonner';
import type { Member, Tree, TreeRole } from '@/api/client';
import { useCurrentTree } from '@/hooks/useCurrentTree';
import {
  useAddMember,
  useChangeRole,
  useMembers,
  useRemoveMember,
  useRenameTree,
} from '@/hooks/useTrees';
import { permissionsFor } from '@/lib/trees';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

const ROLES: TreeRole[] = ['owner', 'editor', 'viewer'];
const ROLE_HELP: Record<TreeRole, string> = {
  owner: 'Owners can do everything, including managing members.',
  editor: 'Editors can add and change people and connections.',
  viewer: 'Viewers can only look.',
};

function showError(fallback: string) {
  return (err: Error) => toast.error(err.message || fallback);
}

export default function TreeSettingsPage() {
  const { treeId = '' } = useParams<{ treeId: string }>();
  const { trees, loading } = useCurrentTree();
  const tree = trees.find((t) => t.id === treeId);

  if (loading) return <p className="text-muted-foreground">Loading...</p>;
  if (!tree) return <p className="text-muted-foreground">Tree not found.</p>;
  // Keyed so the rename field resets when moving between trees' settings.
  return <TreeSettings key={tree.id} tree={tree} />;
}

function TreeSettings({ tree }: { tree: Tree }) {
  const { canManage } = permissionsFor(tree.role);

  return (
    <div className="max-w-2xl space-y-8">
      <Link
        to="/"
        className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-sm"
      >
        <ArrowLeft className="size-4" />
        Back to people
      </Link>
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">{tree.name}</h1>
        <p className="text-muted-foreground text-sm">
          You&apos;re {tree.role === 'owner' ? 'an' : 'a'} {tree.role}. {ROLE_HELP[tree.role]}
        </p>
      </div>
      {canManage && <RenameForm tree={tree} />}
      <MemberSection tree={tree} canManage={canManage} />
    </div>
  );
}

function RenameForm({ tree }: { tree: Tree }) {
  const [name, setName] = useState(tree.name);
  const rename = useRenameTree(tree.id);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    rename.mutate(name.trim(), {
      onSuccess: () => toast.success('Renamed'),
      onError: showError('Failed to rename'),
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-2">
      <Label htmlFor="tree-name">Name</Label>
      <div className="flex gap-2">
        <Input
          id="tree-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={200}
          className="max-w-sm"
        />
        <Button
          type="submit"
          variant="outline"
          disabled={!name.trim() || name.trim() === tree.name || rename.isPending}
        >
          Rename
        </Button>
      </div>
    </form>
  );
}

function MemberSection({ tree, canManage }: { tree: Tree; canManage: boolean }) {
  const members = useMembers(tree.id);

  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">Members</h2>
      {members.isPending && <p className="text-muted-foreground text-sm">Loading members...</p>}
      {members.error && <p className="text-destructive text-sm">{members.error.message}</p>}
      {members.data && (
        <ul className="space-y-2">
          {members.data.map((m) => (
            <MemberRow key={m.user_id} tree={tree} member={m} canManage={canManage} />
          ))}
        </ul>
      )}
      {canManage && <AddMemberForm treeId={tree.id} />}
    </section>
  );
}

function MemberRow({ tree, member, canManage }: { tree: Tree; member: Member; canManage: boolean }) {
  const navigate = useNavigate();
  const changeRole = useChangeRole(tree.id);
  const remove = useRemoveMember(tree.id);

  function handleRoleChange(role: string) {
    changeRole.mutate(
      { userId: member.user_id, role: role as TreeRole },
      { onError: showError('Failed to change role') },
    );
  }

  function handleRemove() {
    remove.mutate(member.user_id, {
      onSuccess: () => {
        if (member.is_me) {
          toast.success(`You left ${tree.name}`);
          navigate('/');
        } else {
          toast.success(`${member.username} removed`);
        }
      },
      onError: showError('Failed to remove'),
    });
  }

  return (
    <li className="flex items-center justify-between gap-2 rounded-md border px-3 py-2">
      <div className="flex items-center gap-2">
        <span className="font-medium">{member.username}</span>
        {member.is_me && <Badge variant="secondary">You</Badge>}
      </div>
      <div className="flex items-center gap-2">
        {canManage ? (
          <Select value={member.role} onValueChange={handleRoleChange} disabled={changeRole.isPending}>
            <SelectTrigger className="w-28 capitalize" aria-label={`Role for ${member.username}`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ROLES.map((role) => (
                <SelectItem key={role} value={role} className="capitalize">
                  {role}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <span className="text-muted-foreground text-sm capitalize">{member.role}</span>
        )}
        {/* Fixed width, so the role pickers line up whether a row has Leave or remove. */}
        <div className="flex w-16 justify-end">
          {member.is_me ? (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" size="sm" disabled={remove.isPending}>
                  Leave
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Leave {tree.name}?</AlertDialogTitle>
                  <AlertDialogDescription>
                    You&apos;ll lose access to its people until an owner adds you again.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleRemove}>Leave</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          ) : (
            canManage && (
              <Button
                variant="ghost"
                size="icon"
                className="size-7"
                onClick={handleRemove}
                disabled={remove.isPending}
                aria-label={`Remove ${member.username}`}
              >
                <X className="size-4" />
              </Button>
            )
          )}
        </div>
      </div>
    </li>
  );
}

function AddMemberForm({ treeId }: { treeId: string }) {
  const [username, setUsername] = useState('');
  const [role, setRole] = useState<TreeRole>('viewer');
  const addMember = useAddMember(treeId);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    addMember.mutate(
      { username: username.trim(), role },
      {
        onSuccess: (added) => {
          toast.success(`${added.username} added as ${added.role}`);
          setUsername('');
        },
        onError: showError('Failed to add member'),
      },
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2 pt-2 sm:flex-row">
      <Input
        value={username}
        onChange={(e) => setUsername(e.target.value)}
        placeholder="Username"
        aria-label="Username to add"
        autoComplete="off"
        className="sm:max-w-xs"
      />
      <Select value={role} onValueChange={(v) => setRole(v as TreeRole)}>
        <SelectTrigger className="capitalize sm:w-28" aria-label="Role for the new member">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {ROLES.map((r) => (
            <SelectItem key={r} value={r} className="capitalize">
              {r}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button type="submit" disabled={!username.trim() || addMember.isPending}>
        Add member
      </Button>
    </form>
  );
}
