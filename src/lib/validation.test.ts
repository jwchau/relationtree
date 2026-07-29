import { describe, expect, it } from 'vitest';
import { personFormSchema } from './validation';

describe('personFormSchema', () => {
  it('accepts a minimal valid person', () => {
    const result = personFormSchema.safeParse({
      name: 'Jane Doe',
      relationshipCategory: 'FRIEND',
    });
    expect(result.success).toBe(true);
  });

  it('rejects an empty name', () => {
    const result = personFormSchema.safeParse({
      name: '   ',
      relationshipCategory: 'FRIEND',
    });
    expect(result.success).toBe(false);
  });

  it('rejects an invalid relationship category', () => {
    const result = personFormSchema.safeParse({
      name: 'Jane Doe',
      relationshipCategory: 'BEST_FRIEND',
    });
    expect(result.success).toBe(false);
  });

  it('rejects a malformed email but allows an empty one', () => {
    const invalid = personFormSchema.safeParse({
      name: 'Jane Doe',
      relationshipCategory: 'FRIEND',
      email: 'not-an-email',
    });
    expect(invalid.success).toBe(false);

    const empty = personFormSchema.safeParse({
      name: 'Jane Doe',
      relationshipCategory: 'FRIEND',
      email: '',
    });
    expect(empty.success).toBe(true);
  });
});
