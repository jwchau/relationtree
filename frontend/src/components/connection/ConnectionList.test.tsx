// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ConnectionWithPerson } from '@/hooks/useConnections';
import { ConnectionList } from './ConnectionList';

const edit = vi.hoisted(() => ({ mutateAsync: vi.fn(), isPending: false }));
vi.mock('@/hooks/useConnections', () => ({
  useDeleteConnection: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useEditConnection: () => edit,
}));

function conn(
  name: string,
  type: ConnectionWithPerson['relationshipType'],
  displayLabel: string,
  extra: Partial<ConnectionWithPerson> = {},
): ConnectionWithPerson {
  return {
    connectionId: `c-${name}`,
    relationshipType: type,
    displayLabel,
    parentKind: type === 'PARENT' ? 'BIOLOGICAL' : null,
    ended: false,
    otherPerson: { id: name, name, photo_url: null } as ConnectionWithPerson['otherPerson'],
    ...extra,
  };
}

const connections = [
  conn('Alan', 'PARENT', 'Parent', { parentKind: 'STEP' }),
  conn('Kit', 'PARENT', 'Child', { parentKind: 'ADOPTIVE' }),
  conn('Sam', 'SPOUSE', 'Spouse', { ended: true }),
  conn('Fay', 'FRIEND', 'Friend'),
];

function renderList(canEdit = true) {
  render(
    <MemoryRouter>
      <ConnectionList connections={connections} loading={false} error={null} canEdit={canEdit} />
    </MemoryRouter>,
  );
}

const row = (name: string) => screen.getByRole('link', { name: new RegExp(`^${name}`) }).closest('li')!;

beforeEach(() => {
  edit.mutateAsync.mockReset();
});

describe('ConnectionList', () => {
  it('names step, adoptive and former links', () => {
    renderList();
    expect(within(row('Alan')).getByText('Step-parent')).toBeInTheDocument();
    expect(within(row('Kit')).getByText('Adopted child')).toBeInTheDocument();
    expect(within(row('Sam')).getByText('Former spouse')).toBeInTheDocument();
    expect(within(row('Fay')).getByText('Friend')).toBeInTheDocument();
  });

  it('lets editors edit parent and spouse links only', () => {
    renderList();
    expect(within(row('Alan')).getByRole('button', { name: 'Edit connection to Alan' })).toBeInTheDocument();
    expect(within(row('Sam')).getByRole('button', { name: 'Edit connection to Sam' })).toBeInTheDocument();
    expect(within(row('Fay')).queryByRole('button', { name: /^Edit/ })).not.toBeInTheDocument();
  });

  it('lets viewers edit nothing', () => {
    renderList(false);
    expect(screen.queryByRole('button', { name: /^Edit/ })).not.toBeInTheDocument();
  });

  it('saves an edited link', async () => {
    renderList();
    fireEvent.click(within(row('Sam')).getByRole('button', { name: 'Edit connection to Sam' }));
    const dialog = await screen.findByRole('dialog');
    const former = within(dialog).getByRole('checkbox', { name: 'Former partner' });
    expect(former).toBeChecked();
    fireEvent.click(former);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(edit.mutateAsync).toHaveBeenCalledWith({ connectionId: 'c-Sam', parentKind: undefined, ended: false }),
    );
  });
});
