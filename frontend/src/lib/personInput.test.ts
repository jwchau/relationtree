import { describe, expect, it } from 'vitest';
import type { Person } from '@/api/client';
import { toFormValues, toPersonInput } from './personInput';

describe('toPersonInput', () => {
  it('sends empty dates as null, since the API rejects empty strings for dates', () => {
    const input = toPersonInput({
      name: 'Sam',
      relationshipCategory: 'FRIEND',
      birthday: '',
      lastContactedDate: '',
    });
    expect(input.birthday).toBeNull();
    expect(input.last_contacted_date).toBeNull();
  });

  it('sends missing text fields as empty strings, since the API rejects null for them', () => {
    const input = toPersonInput({ name: 'Sam', relationshipCategory: 'FRIEND' });
    expect(input).toMatchObject({ context: '', phone: '', email: '', address: '', notes: '' });
  });
});

describe('toFormValues', () => {
  it('round-trips through toPersonInput', () => {
    const person: Person = {
      id: '0b1c',
      name: 'Sam',
      relationship_category: 'COWORKER',
      context: 'Work',
      phone: '555',
      email: 'sam@example.com',
      address: '1 Main St',
      birthday: '1990-04-02',
      photo_key: '',
      notes: 'Likes climbing',
      last_contacted_date: null,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    };
    expect(toPersonInput(toFormValues(person))).toEqual({
      name: 'Sam',
      relationship_category: 'COWORKER',
      context: 'Work',
      phone: '555',
      email: 'sam@example.com',
      address: '1 Main St',
      birthday: '1990-04-02',
      notes: 'Likes climbing',
      last_contacted_date: null,
    });
  });
});
