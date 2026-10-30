import { describe, expect, it } from 'vitest';
import { birthdayCell, initials, lastTalked } from '@/lib/people';

describe('initials', () => {
  it('takes the first and last word', () => {
    expect(initials('Jane Doe')).toBe('JD');
    expect(initials('Mary Ann van der Berg')).toBe('MB');
  });

  it('uses one letter for a single name', () => {
    expect(initials('Lily')).toBe('L');
  });

  it('upper-cases and trims', () => {
    expect(initials('  priya shah ')).toBe('PS');
  });

  it('keeps letters outside the basic plane whole', () => {
    expect(initials('Émile Zola')).toBe('ÉZ');
    expect(initials('𝒜da Lovelace')).toBe('𝒜L');
  });

  it('falls back to a question mark for a blank name', () => {
    expect(initials('   ')).toBe('?');
  });
});

describe('lastTalked', () => {
  const today = new Date(2026, 9, 20); // 20 Oct 2026, local time

  it('says never when there is no date', () => {
    expect(lastTalked(null, today)).toEqual({ label: 'Never', stale: true });
  });

  it('says today and yesterday', () => {
    expect(lastTalked('2026-10-20', today)).toEqual({ label: 'Today', stale: false });
    expect(lastTalked('2026-10-19', today)).toEqual({ label: 'Yesterday', stale: false });
  });

  it('counts days, then weeks, months and years', () => {
    expect(lastTalked('2026-10-15', today).label).toBe('5 days ago');
    expect(lastTalked('2026-10-13', today).label).toBe('1 week ago');
    expect(lastTalked('2026-09-25', today).label).toBe('3 weeks ago');
    expect(lastTalked('2026-09-20', today).label).toBe('1 month ago');
    expect(lastTalked('2026-04-20', today).label).toBe('6 months ago');
    expect(lastTalked('2025-10-20', today).label).toBe('1 year ago');
    expect(lastTalked('2023-01-01', today).label).toBe('3 years ago');
  });

  it('marks three months or more as stale', () => {
    expect(lastTalked('2026-07-23', today).stale).toBe(false); // 89 days
    expect(lastTalked('2026-07-22', today).stale).toBe(true); // 90 days
  });

  it('treats a date in the future as today', () => {
    expect(lastTalked('2026-11-01', today)).toEqual({ label: 'Today', stale: false });
  });
});

describe('birthdayCell', () => {
  const today = new Date(2026, 9, 29); // 29 Oct 2026, local time

  it('shows the month and day, with the full date for the tooltip and screen readers', () => {
    expect(birthdayCell('1982-03-04', today)).toEqual({
      label: 'Mar 4',
      full: 'March 4, 1982',
      soon: false,
    });
  });

  it('marks birthdays from today through the next 14 days as soon', () => {
    expect(birthdayCell('1990-10-29', today).soon).toBe(true); // today
    expect(birthdayCell('1990-11-12', today).soon).toBe(true); // 14 days
    expect(birthdayCell('1990-11-13', today).soon).toBe(false); // 15 days
    expect(birthdayCell('1990-10-28', today).soon).toBe(false); // yesterday: next one is a year off
  });

  it('counts across New Year', () => {
    const lateDecember = new Date(2026, 11, 25);
    expect(birthdayCell('2001-01-05', lateDecember).soon).toBe(true); // 11 days
    expect(birthdayCell('2001-01-09', lateDecember).soon).toBe(false); // 15 days
  });
});
