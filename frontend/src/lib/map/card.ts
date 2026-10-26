/** The card's birth line, e.g. "Born 1982 · 44". `birthday` is an ISO date (YYYY-MM-DD). */
export function bornLine(birthday: string | null, today: Date): string | null {
  if (!birthday) return null;
  const [year, month, day] = birthday.split('-').map(Number);
  const hadBirthday =
    today.getMonth() + 1 > month || (today.getMonth() + 1 === month && today.getDate() >= day);
  const age = today.getFullYear() - year - (hadBirthday ? 0 : 1);
  return `Born ${year} · ${age}`;
}
