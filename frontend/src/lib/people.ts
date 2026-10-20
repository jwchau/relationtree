/** Monogram for someone without a photo: first letters of the first and last word. */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  // Array.from keeps a letter outside the basic plane in one piece.
  const first = (word: string) => Array.from(word)[0].toUpperCase();
  return words.length === 1 ? first(words[0]) : first(words[0]) + first(words[words.length - 1]);
}

const DAY = 24 * 60 * 60 * 1000;
const STALE_DAYS = 90;

/** "Last talked" in words, and whether it's been long enough to nudge (three months or never). */
export function lastTalked(
  date: string | null | undefined,
  today: Date = new Date(),
): { label: string; stale: boolean } {
  if (!date) return { label: 'Never', stale: true };
  const [y, m, d] = date.split('-').map(Number);
  const then = Date.UTC(y, m - 1, d);
  const now = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  const days = Math.max(0, Math.round((now - then) / DAY));
  return { label: describeDays(days), stale: days >= STALE_DAYS };
}

function describeDays(days: number): string {
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  if (days < 30) return ago(Math.floor(days / 7), 'week');
  if (days < 365) return ago(Math.max(1, Math.floor(days / 30)), 'month');
  return ago(Math.floor(days / 365), 'year');
}

function ago(n: number, unit: string): string {
  return `${n} ${unit}${n === 1 ? '' : 's'} ago`;
}
