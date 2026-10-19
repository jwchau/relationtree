import { describe, expect, it } from 'vitest';
import type { Tree } from '@/api/client';
import { permissionsFor, pickCurrentTree } from './trees';

function tree(id: string, role: Tree['role']): Tree {
  return { id, name: id, role, member_count: 1 };
}

describe('pickCurrentTree', () => {
  const trees = [tree('family', 'viewer'), tree('mine', 'owner'), tree('work', 'editor')];

  it('keeps the remembered tree', () => {
    expect(pickCurrentTree(trees, 'work')?.id).toBe('work');
  });

  it("falls back to a tree I own when the remembered one is gone or there isn't one", () => {
    expect(pickCurrentTree(trees, 'left-this-one')?.id).toBe('mine');
    expect(pickCurrentTree(trees, null)?.id).toBe('mine');
  });

  it('falls back to any tree when I own none, and to nothing with no trees', () => {
    expect(pickCurrentTree([tree('family', 'viewer')], null)?.id).toBe('family');
    expect(pickCurrentTree([], 'mine')).toBeNull();
  });
});

describe('permissionsFor', () => {
  it('lets owners edit and manage, editors edit, and viewers only read', () => {
    expect(permissionsFor('owner')).toEqual({ canEdit: true, canManage: true });
    expect(permissionsFor('editor')).toEqual({ canEdit: true, canManage: false });
    expect(permissionsFor('viewer')).toEqual({ canEdit: false, canManage: false });
    expect(permissionsFor(undefined)).toEqual({ canEdit: false, canManage: false });
  });
});
