import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import type { Tree } from '@/api/client';
import { useMe } from '@/hooks/useAuth';
import { useAcceptInvite, useInviteDetails, useSignupWithInvite } from '@/hooks/useInvites';
import { rememberTree } from '@/lib/currentTreeStorage';
import { expiresIn, inviteHeadline } from '@/lib/invites';
import { NarrowFrame, Note } from '@/components/kiln/Page';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

/**
 * Where an invite link lands. Public: a logged-in visitor joins with one click; anyone else
 * creates an account here (the only way to sign up) or signs in and comes back.
 */
export default function InvitePage() {
  const { token = '' } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const invite = useInviteDetails(token);
  const me = useMe();

  // Open the app on the tree they just joined.
  function openTree(tree: Tree) {
    rememberTree(tree.id);
    toast.success(`You joined ${tree.name}`);
    navigate('/', { replace: true });
  }

  if (invite.isPending || me.isPending) {
    return (
      <NarrowFrame title="Loading...">
        <span />
      </NarrowFrame>
    );
  }
  if (invite.error) {
    return (
      <NarrowFrame title="Invite">
        <Note tone="error">{invite.error.message}</Note>
      </NarrowFrame>
    );
  }
  if (!invite.data) {
    return (
      <NarrowFrame title="This invite link is invalid or has expired">
        <div className="panel p-5">
          <Note>Links work once and last a week. Ask whoever sent it for a new one.</Note>
        </div>
      </NarrowFrame>
    );
  }
  return (
    <NarrowFrame
      title={inviteHeadline(invite.data)}
      meta={`This link ${expiresIn(invite.data.expires_at)} and works once.`}
    >
      {me.data ? (
        <JoinAs username={me.data.username} token={token} onJoined={openTree} />
      ) : (
        <SignupForm token={token} onJoined={openTree} />
      )}
    </NarrowFrame>
  );
}

function JoinAs({
  username,
  token,
  onJoined,
}: {
  username: string;
  token: string;
  onJoined: (tree: Tree) => void;
}) {
  const accept = useAcceptInvite(token);

  return (
    <div className="panel space-y-3 p-5 sm:p-6">
      <Button
        size="lg"
        className="w-full"
        disabled={accept.isPending}
        onClick={() => accept.mutate(undefined, { onSuccess: onJoined })}
      >
        {accept.isPending ? 'Joining...' : `Join as ${username}`}
      </Button>
      {accept.error && <Note tone="error">{accept.error.message}</Note>}
    </div>
  );
}

function SignupForm({ token, onJoined }: { token: string; onJoined: (tree: Tree) => void }) {
  const signup = useSignupWithInvite(token);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const mismatch = confirm.length > 0 && confirm !== password;

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (mismatch) return;
    signup.mutate({ username: username.trim(), password }, { onSuccess: onJoined });
  }

  return (
    <form onSubmit={handleSubmit} className="panel space-y-5 p-5 sm:p-6">
      <h2 className="display-face text-[20px] leading-[26px]">Create your account</h2>
      <div className="space-y-2">
        <Label htmlFor="username">Username</Label>
        <Input
          id="username"
          autoComplete="username"
          autoFocus
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          maxLength={150}
          required
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="confirm">Confirm password</Label>
        <Input
          id="confirm"
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          aria-invalid={mismatch}
          required
        />
        {mismatch && <Note tone="error">Passwords don&apos;t match</Note>}
      </div>
      {signup.error && <Note tone="error">{signup.error.message}</Note>}
      <Button type="submit" size="lg" className="w-full" disabled={signup.isPending || mismatch}>
        {signup.isPending ? 'Creating account...' : 'Create account and join'}
      </Button>
      <p className="text-muted-foreground text-center text-[15px]">
        Already have an account?{' '}
        <Link
          to="/login"
          state={{ from: `/invite/${token}` }}
          className="text-accent-text font-medium underline underline-offset-4"
        >
          Sign in
        </Link>
      </p>
    </form>
  );
}
