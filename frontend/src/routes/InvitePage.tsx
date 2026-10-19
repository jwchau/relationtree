import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import type { Tree } from '@/api/client';
import { useMe } from '@/hooks/useAuth';
import { useAcceptInvite, useInviteDetails, useSignupWithInvite } from '@/hooks/useInvites';
import { rememberTree } from '@/lib/currentTreeStorage';
import { expiresIn, inviteHeadline } from '@/lib/invites';
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

  let body;
  if (invite.isPending || me.isPending) {
    body = <p className="text-muted-foreground">Loading...</p>;
  } else if (invite.error) {
    body = <p className="text-destructive">{invite.error.message}</p>;
  } else if (!invite.data) {
    body = (
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">This invite link is invalid or has expired</h1>
        <p className="text-muted-foreground text-sm">
          Links work once and last a week. Ask whoever sent it for a new one.
        </p>
      </div>
    );
  } else {
    body = (
      <div className="space-y-6">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">{inviteHeadline(invite.data)}</h1>
          <p className="text-muted-foreground text-sm">
            This link {expiresIn(invite.data.expires_at)} and works once.
          </p>
        </div>
        {me.data ? (
          <JoinAs username={me.data.username} token={token} onJoined={openTree} />
        ) : (
          <SignupForm token={token} onJoined={openTree} />
        )}
      </div>
    );
  }

  return (
    <div className="flex min-h-svh items-center justify-center px-4">
      <div className="w-full max-w-sm">{body}</div>
    </div>
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
    <div className="space-y-3">
      <Button
        className="w-full"
        disabled={accept.isPending}
        onClick={() => accept.mutate(undefined, { onSuccess: onJoined })}
      >
        {accept.isPending ? 'Joining...' : `Join as ${username}`}
      </Button>
      {accept.error && (
        <p role="alert" className="text-destructive text-sm">
          {accept.error.message}
        </p>
      )}
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
    <form onSubmit={handleSubmit} className="space-y-4">
      <p className="text-sm font-medium">Create your account</p>
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
        {mismatch && <p className="text-destructive text-sm">Passwords don&apos;t match</p>}
      </div>
      {signup.error && (
        <p role="alert" className="text-destructive text-sm">
          {signup.error.message}
        </p>
      )}
      <Button type="submit" className="w-full" disabled={signup.isPending || mismatch}>
        {signup.isPending ? 'Creating account...' : 'Create account and join'}
      </Button>
      <p className="text-muted-foreground text-center text-sm">
        Already have an account?{' '}
        <Link
          to="/login"
          state={{ from: `/invite/${token}` }}
          className="text-foreground underline underline-offset-4"
        >
          Sign in
        </Link>
      </p>
    </form>
  );
}
