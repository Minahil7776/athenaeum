import { Session } from '../types';

const pad = (n: number) => String(n).padStart(2, '0');

export const localDay = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export function addDays(day: string, delta: number): string {
  const d = new Date(day + 'T12:00:00');
  d.setDate(d.getDate() + delta);
  return localDay(d);
}

export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return s > 0 ? `${s}s` : '0m';
}

export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const mm = pad(m);
  const ss = pad(s % 60);
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

export const timeOfDay = (iso: string) =>
  new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

export function dayLabel(day: string): string {
  const t = localDay();
  if (day === t) return 'Today';
  if (day === addDays(t, -1)) return 'Yesterday';
  return new Date(day + 'T12:00:00').toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
}

export function secondsByDay(sessions: Session[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const s of sessions) m.set(s.day, (m.get(s.day) || 0) + s.seconds);
  return m;
}

export function summarize(byDay: Map<string, number>) {
  const t = localDay();
  let today = 0,
    week = 0,
    month = 0,
    total = 0;
  const weekStart = addDays(t, -6);
  const monthStart = addDays(t, -29);
  for (const [day, secs] of byDay) {
    total += secs;
    if (day === t) today += secs;
    if (day >= weekStart && day <= t) week += secs;
    if (day >= monthStart && day <= t) month += secs;
  }
  return { today, week, month, total };
}

/* A day counts toward the streak once at least one minute was read */
export function streaks(byDay: Map<string, number>) {
  const active = new Set([...byDay].filter(([, s]) => s >= 60).map(([d]) => d));
  const t = localDay();
  let current = 0;
  let cursor = active.has(t) ? t : addDays(t, -1);
  while (active.has(cursor)) {
    current++;
    cursor = addDays(cursor, -1);
  }
  const sorted = [...active].sort();
  let longest = 0,
    run = 0,
    prev = '';
  for (const d of sorted) {
    run = prev && addDays(prev, 1) === d ? run + 1 : 1;
    longest = Math.max(longest, run);
    prev = d;
  }
  return { current, longest: Math.max(longest, current), activeDays: active.size };
}

export function lastNDays(byDay: Map<string, number>, n: number) {
  const t = localDay();
  const out: { day: string; seconds: number }[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const day = addDays(t, -i);
    out.push({ day, seconds: byDay.get(day) || 0 });
  }
  return out;
}

export function groupSessionsByDay(sessions: Session[]) {
  const groups = new Map<string, Session[]>();
  for (const s of sessions) {
    const arr = groups.get(s.day) || [];
    arr.push(s);
    groups.set(s.day, arr);
  }
  return [...groups.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([day, list]) => ({
      day,
      total: list.reduce((a, s) => a + s.seconds, 0),
      sessions: list.sort((a, b) => b.startedAt.localeCompare(a.startedAt)),
    }));
}

export const newId = () =>
  (globalThis.crypto && 'randomUUID' in globalThis.crypto
    ? globalThis.crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36));
