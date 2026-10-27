// @vitest-environment jsdom
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TreeGraph } from '@/api/client';
import { tree } from '@/lib/map/testTree';
import { FixedSizeObserver, observedSize } from '@/test/resizeObserver';
import { NotConnectedTray } from './NotConnectedTray';

// Robin's family, and two people with no path to Robin: Zoe and her husband Yan.
const graph = tree(['Robin', 'Alan', 'Zoe', 'Yan'], [['Alan', 'PARENT', 'Robin'], ['Zoe', 'SPOUSE', 'Yan']]);

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', FixedSizeObserver);
  vi.stubGlobal('matchMedia', () => ({ matches: true }));
});
afterEach(() => {
  observedSize();
  vi.unstubAllGlobals();
});

function renderTray(g: TreeGraph = graph, { canEdit = true } = {}) {
  const people = new Map(g.people.map((p) => [p.id, p]));
  return render(
    <MemoryRouter>
      <NotConnectedTray graph={g} rootId="Robin" people={people} canEdit={canEdit} />
    </MemoryRouter>,
  );
}

const tray = () => screen.getByRole('region', { name: /Not connected/ });

describe('NotConnectedTray', () => {
  it('counts and lists the people with no path to the root', () => {
    renderTray();
    expect(tray()).toHaveAccessibleName('Not connected · 2');
    expect(within(tray()).getAllByRole('button')).toEqual([
      within(tray()).getByRole('button', { name: 'Yan' }),
      within(tray()).getByRole('button', { name: 'Zoe' }),
    ]);
  });

  it('previews the person clicked, centred on them, with a link to make them the centre', () => {
    renderTray();
    expect(within(tray()).queryByLabelText('Family map')).not.toBeInTheDocument();
    fireEvent.click(within(tray()).getByRole('button', { name: 'Zoe' }));
    expect(within(tray()).getByRole('button', { name: 'Zoe' })).toHaveAttribute('aria-pressed', 'true');
    const preview = within(tray()).getByLabelText('Family map');
    expect(within(preview).getByRole('group', { name: 'Family of Zoe' })).toBeInTheDocument();
    expect(within(tray()).getByRole('link', { name: 'Make Zoe the centre' })).toHaveAttribute(
      'href',
      '/map?root=Zoe',
    );
  });

  it("offers an editor Link to…, which opens the person's Add connection dialog", () => {
    renderTray();
    fireEvent.click(within(tray()).getByRole('button', { name: 'Zoe' }));
    expect(within(tray()).getByRole('link', { name: 'Link Zoe to…' })).toHaveAttribute(
      'href',
      '/people/Zoe?connect=1',
    );
  });

  it('offers a viewer no Link to…', () => {
    renderTray(graph, { canEdit: false });
    fireEvent.click(within(tray()).getByRole('button', { name: 'Zoe' }));
    expect(within(tray()).getByRole('link', { name: 'Make Zoe the centre' })).toBeInTheDocument();
    expect(within(tray()).queryByRole('link', { name: /^Link/ })).not.toBeInTheDocument();
  });

  it('shows the first dozen, then everyone on "Show all"', () => {
    const loners = Array.from({ length: 15 }, (_, i) => `Loner ${String(i + 1).padStart(2, '0')}`);
    renderTray(tree(['Robin', ...loners], []));
    const people = () => within(tray()).getAllByRole('button', { name: /^Loner/ });
    expect(people()).toHaveLength(12);
    fireEvent.click(within(tray()).getByRole('button', { name: 'Show all 15' }));
    expect(people()).toHaveLength(15);
    expect(within(tray()).queryByRole('button', { name: /^Show all/ })).not.toBeInTheDocument();
  });

  it('shows nothing when everyone is connected', () => {
    const { container } = renderTray(tree(['Robin', 'Alan'], [['Alan', 'PARENT', 'Robin']]));
    expect(container).toBeEmptyDOMElement();
  });
});
