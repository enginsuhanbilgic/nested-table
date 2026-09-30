import type { UserPageHistoryFilterRequest } from '../types/audit';

export function serializeHistoryParams(params: Record<string, unknown>): string {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    (Array.isArray(value) ? value : [value]).forEach(item => query.append(key, String(item)));
  });
  return query.toString();
}

export function defaultHistoryFilters(now = new Date()): UserPageHistoryFilterRequest {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Istanbul', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now);
  const part = (type: string) => parts.find(p => p.type === type)!.value;
  const to = `${part('year')}-${part('month')}-${part('day')}`;
  const start = new Date(`${to}T00:00:00Z`);
  start.setUTCDate(start.getUTCDate() - 6);
  return { from: start.toISOString().slice(0, 10), to };
}

export function historyRangeError(filter: UserPageHistoryFilterRequest): string | null {
  const valid = (date: string) => /^\d{4}-\d{2}-\d{2}$/.test(date)
    && Number.isFinite(Date.parse(date)) && new Date(date).toISOString().slice(0, 10) === date;
  if (!valid(filter.from) || !valid(filter.to)) return 'Select valid from and to dates.';
  const days = (Date.parse(filter.to) - Date.parse(filter.from)) / 86_400_000;
  return days < 0 || days >= 366 ? 'Select an ordered date range of at most 366 days.' : null;
}

export const formatHistoryTimestamp = (value: string) => new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/Istanbul', dateStyle: 'medium', timeStyle: 'medium',
}).format(new Date(value));
