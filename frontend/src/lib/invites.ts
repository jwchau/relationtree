import type { InviteDetails, TreeRole } from '@/api/client';

/** The link an owner copies. The token is only ever shown once, right after it's made. */
export function inviteUrl(origin: string, token: string) {
  return `${origin}/invite/${token}`;
}

function withArticle(role: TreeRole) {
  return role === 'owner' ? 'an owner' : role === 'editor' ? 'an editor' : 'a viewer';
}

export function inviteHeadline(invite: Pick<InviteDetails, 'invited_by' | 'tree_name' | 'role'>) {
  const what = `${invite.tree_name} as ${withArticle(invite.role)}`;
  return invite.invited_by
    ? `${invite.invited_by} invited you to ${what}`
    : `You're invited to ${what}`;
}

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

export function expiresIn(expiresAt: string, now: Date = new Date()) {
  const left = new Date(expiresAt).getTime() - now.getTime();
  if (left <= 0) return 'expired';
  if (left >= DAY) {
    // Rounded, so a week-long link made a moment ago says 7 days, not 6.
    const days = Math.round(left / DAY);
    return `expires in ${days} day${days === 1 ? '' : 's'}`;
  }
  if (left >= HOUR) {
    const hours = Math.floor(left / HOUR);
    return `expires in ${hours} hour${hours === 1 ? '' : 's'}`;
  }
  return 'expires in under an hour';
}
