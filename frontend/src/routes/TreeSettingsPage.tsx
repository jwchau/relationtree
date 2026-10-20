import { useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Copy, Link2, X } from 'lucide-react';
import { toast } from 'sonner';
import type { Member, Tree, TreeRole } from '@/api/client';
import { useCurrentTree } from '@/hooks/useCurrentTree';
import { useCreateInvite, useInvites, useRevokeInvite } from '@/hooks/useInvites';
import {
  useAddMember,
  useChangeRole,
  useMembers,
  useRemoveMember,
  useRenameTree,
} from '@/hooks/useTrees';
import { expiresIn, inviteUrl } from '@/lib/invites';
import { permissionsFor } from '@/lib/trees';
import { Note, PageBand, PageBody, SectionHead } from '@/components/kiln/Page';
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

  if (loading || !tree) {
    return (
      <>
        <PageBand back={{ to: '/', label: 'Back to people' }} title={loading ? 'Loading...' : 'Tree not found'} />
        <PageBody>{!loading && <Note>Tree not found.</Note>}</PageBody>
      </>
    );
  }
  // Keyed so the rename field resets when moving between trees' settings.
  return <TreeSettings key={tree.id} tree={tree} />;
}

function TreeSettings({ tree }: { tree: Tree }) {
  const { canManage } = permissionsFor(tree.role);

  return (
    <>
      <PageBand
        back={{ to: '/', label: 'Back to people' }}
        title={tree.name}
        meta={
          <span>
            You&apos;re {tree.role === 'owner' ? 'an' : 'a'} {tree.role}. {ROLE_HELP[tree.role]}
          </span>
        }
      />
      <PageBody className="space-y-[var(--section-gap)] *:max-w-[760px]">
        {canManage && <RenameForm tree={tree} />}
        <MemberSection tree={tree} canManage={canManage} />
        {canManage && <InviteSection treeId={tree.id} />}
      </PageBody>
    </>
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
    <form onSubmit={handleSubmit} className="panel space-y-2 p-5">
      <Label htmlFor="tree-name">Name</Label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          id="tree-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={200}
          className="sm:max-w-sm"
        />
        <Button
          type="submit"
          variant="secondary"
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
    <section aria-labelledby="members-head">
      <SectionHead id="members-head" title="Members" />
      <div className="panel px-1.5 py-1.5 sm:px-2">
        {members.isPending && <Note className="p-3">Loading members...</Note>}
        {members.error && <Note tone="error" className="p-3">{members.error.message}</Note>}
        {members.data && (
          <ul aria-label="Members">
            {members.data.map((m) => (
              <MemberRow key={m.user_id} tree={tree} member={m} canManage={canManage} />
            ))}
          </ul>
        )}
        {canManage && <AddMemberForm treeId={tree.id} />}
      </div>
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
    <li className="before:bg-hairline relative flex min-h-14 flex-wrap items-center justify-between gap-2 px-3 py-2 before:absolute before:inset-x-3 before:top-0 before:h-px first:before:hidden">
      <div className="flex min-w-0 items-center gap-2">
        <span className="truncate font-semibold">{member.username}</span>
        {member.is_me && <Badge>You</Badge>}
      </div>
      <div className="flex items-center gap-2">
        {canManage ? (
          <Select value={member.role} onValueChange={handleRoleChange} disabled={changeRole.isPending}>
            <SelectTrigger size="sm" className="w-32 capitalize" aria-label={`Role for ${member.username}`}>
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
          <span className="text-muted-foreground text-[15px] capitalize">{member.role}</span>
        )}
        {/* Fixed width, so the role pickers line up whether a row has Leave or remove. */}
        <div className="flex w-20 justify-end">
          {member.is_me ? (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" size="sm" disabled={remove.isPending}>
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
                size="icon-sm"
                className="text-muted-foreground hover:text-text"
                onClick={handleRemove}
                disabled={remove.isPending}
                aria-label={`Remove ${member.username}`}
              >
                <X />
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
    <form
      onSubmit={handleSubmit}
      className="border-hairline mx-1.5 mt-1.5 flex flex-col gap-2 border-t px-1.5 pt-4 pb-2.5 sm:flex-row"
    >
      <Input
        value={username}
        onChange={(e) => setUsername(e.target.value)}
        placeholder="Username"
        aria-label="Username to add"
        autoComplete="off"
        className="sm:max-w-xs"
      />
      <Select value={role} onValueChange={(v) => setRole(v as TreeRole)}>
        <SelectTrigger className="capitalize sm:w-32" aria-label="Role for the new member">
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
      <Button type="submit" variant="secondary" disabled={!username.trim() || addMember.isPending}>
        Add member
      </Button>
    </form>
  );
}

function InviteSection({ treeId }: { treeId: string }) {
  const invites = useInvites(treeId);
  const createInvite = useCreateInvite(treeId);
  const revokeInvite = useRevokeInvite(treeId);
  const [role, setRole] = useState<TreeRole>('viewer');
  // The token only exists in this response, so the link can't be shown again later.
  const [link, setLink] = useState<string | null>(null);

  function handleCreate() {
    createInvite.mutate(role, {
      onSuccess: (created) => setLink(inviteUrl(window.location.origin, created.token)),
      onError: showError('Failed to create invite'),
    });
  }

  async function copyLink() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      toast.success('Link copied');
    } catch {
      toast.error('Copy failed. Select the link and copy it yourself.');
    }
  }

  return (
    <section aria-labelledby="invites-head">
      <SectionHead id="invites-head" title="Invite links" />
      <div className="panel space-y-4 p-5">
      <p className="text-muted-foreground max-w-[65ch] text-[15px] leading-[22px]">
        For someone without an account, or to share without knowing their username. Each link
        works once and lasts a week.
      </p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Select value={role} onValueChange={(v) => setRole(v as TreeRole)}>
          <SelectTrigger className="capitalize sm:w-32" aria-label="Role for the invite">
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
        <Button variant="secondary" onClick={handleCreate} disabled={createInvite.isPending}>
          <Link2 />
          Create link
        </Button>
      </div>
      {link && (
        <div className="bg-surface-2 space-y-2 rounded-[12px] p-3">
          <div className="flex gap-2">
            <Input
              readOnly
              value={link}
              aria-label="Invite link"
              onFocus={(e) => e.target.select()}
            />
            <Button onClick={copyLink}>
              <Copy />
              Copy
            </Button>
          </div>
          <p className="text-accent-text text-[14px] leading-5 font-medium">
            Copy it now: it won&apos;t be shown again.
          </p>
        </div>
      )}
      {invites.data && invites.data.length > 0 && (
        <ul className="border-hairline -mx-2 border-t pt-1" aria-label="Pending invite links">
          {invites.data.map((i) => (
            <li
              key={i.id}
              className="before:bg-hairline relative flex min-h-14 flex-wrap items-center justify-between gap-2 px-3 py-2 before:absolute before:inset-x-3 before:top-0 before:h-px first:before:hidden text-[15px]"
            >
              <span>
                <span className="font-semibold capitalize">{i.role}</span> link
                <span className="text-muted-foreground">
                  {' '}
                  · {expiresIn(i.expires_at)}
                  {i.created_by && ` · made by ${i.created_by}`}
                </span>
              </span>
              <Button
                variant="destructive"
                size="sm"
                disabled={revokeInvite.isPending}
                onClick={() =>
                  revokeInvite.mutate(i.id, {
                    onSuccess: () => toast.success('Link revoked'),
                    onError: showError('Failed to revoke'),
                  })
                }
              >
                Revoke
              </Button>
            </li>
          ))}
        </ul>
      )}
      </div>
    </section>
  );
}
