import { describe, expect, it } from 'vitest';
import { expiresIn, inviteHeadline, inviteUrl } from './invites';

describe('inviteUrl', () => {
  it('builds a link to the invite page on this site', () => {
    expect(inviteUrl('https://relationtree.example.org', 'abc-_123')).toBe(
      'https://relationtree.example.org/invite/abc-_123',
    );
  });
});

describe('inviteHeadline', () => {
  it('names who invited you, the tree and the role', () => {
    expect(inviteHeadline({ invited_by: 'alice', tree_name: 'Family', role: 'editor' })).toBe(
      'alice invited you to Family as an editor',
    );
    expect(inviteHeadline({ invited_by: 'alice', tree_name: 'Family', role: 'owner' })).toBe(
      'alice invited you to Family as an owner',
    );
    expect(inviteHeadline({ invited_by: 'bob', tree_name: 'Work', role: 'viewer' })).toBe(
      'bob invited you to Work as a viewer',
    );
  });

  it('still reads well when the inviter has since been deleted', () => {
    expect(inviteHeadline({ invited_by: null, tree_name: 'Family', role: 'viewer' })).toBe(
      "You're invited to Family as a viewer",
    );
  });
});

describe('expiresIn', () => {
  const now = new Date('2026-10-19T12:00:00Z');

  it('rounds to days, then hours', () => {
    expect(expiresIn('2026-10-26T12:00:00Z', now)).toBe('expires in 7 days');
    // A link made a moment ago still says a week.
    expect(expiresIn('2026-10-26T11:59:00Z', now)).toBe('expires in 7 days');
    expect(expiresIn('2026-10-20T13:00:00Z', now)).toBe('expires in 1 day');
    expect(expiresIn('2026-10-19T15:30:00Z', now)).toBe('expires in 3 hours');
    expect(expiresIn('2026-10-19T12:20:00Z', now)).toBe('expires in under an hour');
  });

  it('says when it has already expired', () => {
    expect(expiresIn('2026-10-19T11:59:00Z', now)).toBe('expired');
  });
});
