// @vitest-environment jsdom
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Tree } from '@/api/client';
import { CurrentTreeContext } from '@/hooks/useCurrentTree';
import TreeSettingsPage from './TreeSettingsPage';

const updateHues = vi.hoisted(() => vi.fn());
const mutation = { mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false };
vi.mock('@/hooks/useTrees', () => ({
  useMembers: () => ({ data: [], isPending: false, error: null }),
  useAddMember: () => mutation,
  useChangeRole: () => mutation,
  useRemoveMember: () => mutation,
  useRenameTree: () => mutation,
  useUpdateCategoryHues: () => ({ mutate: updateHues, isPending: false }),
}));
vi.mock('@/hooks/useInvites', () => ({
  useInvites: () => ({ data: [], isPending: false, error: null }),
  useCreateInvite: () => mutation,
  useRevokeInvite: () => mutation,
}));

function treeAs(role: Tree['role']): Tree {
  return {
    id: 'ash',
    name: 'Ash family',
    role,
    member_count: 2,
    category_hues: { FAMILY: 'rose', FRIEND: 'violet', COWORKER: 'blue', ACQUAINTANCE: 'green', OTHER: 'slate' },
  };
}

function renderAs(role: Tree['role']) {
  const tree = treeAs(role);
  render(
    <CurrentTreeContext.Provider value={{ tree, trees: [tree], loading: false, error: null, select: vi.fn() }}>
      <MemoryRouter initialEntries={['/trees/ash']}>
        <Routes>
          <Route path="/trees/:treeId" element={<TreeSettingsPage />} />
        </Routes>
      </MemoryRouter>
    </CurrentTreeContext.Provider>,
  );
}

beforeEach(() => updateHues.mockReset());

describe('TreeSettingsPage category colours', () => {
  it("shows each category's current colour to an owner", () => {
    renderAs('owner');
    const section = screen.getByRole('region', { name: 'Category colours' });
    expect(within(within(section).getByRole('group', { name: 'Friend' })).getByRole('radio', { name: 'Violet' })).toBeChecked();
    expect(within(within(section).getByRole('group', { name: 'Other' })).getByRole('radio', { name: 'Slate' })).toBeChecked();
  });

  it('saves only the category that changed', () => {
    renderAs('owner');
    const friend = screen.getByRole('group', { name: 'Friend' });
    fireEvent.click(within(friend).getByRole('radio', { name: 'Green' }));
    expect(updateHues).toHaveBeenCalledWith({ FRIEND: 'green' }, expect.anything());
  });

  it.each(['editor', 'viewer'] as const)('is not offered to an %s', (role) => {
    renderAs(role);
    expect(screen.queryByRole('region', { name: 'Category colours' })).not.toBeInTheDocument();
  });
});
