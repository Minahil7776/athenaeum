import { useMemo } from 'react';
import { Trash2, Plus } from 'lucide-react';
import { Session } from '../types';
import {
  dayLabel,
  formatDuration,
  groupSessionsByDay,
  lastNDays,
  secondsByDay,
  streaks,
  summarize,
  timeOfDay,
} from '../lib/stats';

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white border border-stone-200 rounded-xl px-4 py-3">
      <div className="text-xl font-semibold tabular-nums">{value}</div>
      <div className="text-xs text-stone-500 mt-0.5">{label}</div>
    </div>
  );
}

export function Activity({
  sessions,
  today,
  onDelete,
  onLog,
}: {
  sessions: Session[];
  today: string;
  onDelete: (s: Session) => void;
  onLog: () => void;
}) {
  const byDay = useMemo(() => secondsByDay(sessions), [sessions]);
  const sum = useMemo(() => summarize(byDay, today), [byDay, today]);
  const st = useMemo(() => streaks(byDay, today), [byDay, today]);
  const bars = useMemo(() => lastNDays(byDay, 30, today), [byDay, today]);
  const groups = useMemo(() => groupSessionsByDay(sessions), [sessions]);
  const max = Math.max(60, ...bars.map((b) => b.seconds));

  return (
    <div className="space-y-8">
      <section className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat label="Today" value={formatDuration(sum.today)} />
        <Stat label="Last 7 days" value={formatDuration(sum.week)} />
        <Stat label="Last 30 days" value={formatDuration(sum.month)} />
        <Stat label="All time" value={formatDuration(sum.total)} />
      </section>

      <section className="bg-white border border-stone-200 rounded-xl p-4">
        <div className="flex items-baseline justify-between mb-4">
          <h2 className="font-serif font-semibold">Last 30 days</h2>
          <span className="text-xs text-stone-500 tabular-nums">
            Streak {st.current}d · Best {st.longest}d · {st.activeDays} active days
          </span>
        </div>
        <div className="flex items-end gap-[3px] h-28">
          {bars.map((b) => (
            <div
              key={b.day}
              className="flex-1 h-full flex items-end"
              title={`${dayLabel(b.day, today)}: ${formatDuration(b.seconds)}`}
            >
              <div
                className={`w-full rounded-sm ${b.seconds > 0 ? 'bg-stone-800' : 'bg-stone-100'}`}
                style={{ height: b.seconds > 0 ? `${Math.max(4, (b.seconds / max) * 100)}%` : '3px' }}
              />
            </div>
          ))}
        </div>
        <div className="flex justify-between text-[10px] text-stone-400 mt-1.5">
          <span>{dayLabel(bars[0].day, today)}</span>
          <span>Today</span>
        </div>
      </section>

      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-serif font-semibold">History</h2>
          <button onClick={onLog} className="inline-flex items-center gap-1 text-sm text-stone-600 hover:text-stone-900">
            <Plus className="w-4 h-4" />
            Log time
          </button>
        </div>

        {groups.length === 0 ? (
          <p className="text-sm text-stone-500 bg-white border border-stone-200 rounded-xl px-4 py-10 text-center">
            No reading recorded yet. Open a PDF and your time will be tracked automatically.
          </p>
        ) : (
          <div className="space-y-5">
            {groups.map((g) => (
              <div key={g.day} className="bg-white border border-stone-200 rounded-xl overflow-hidden">
                <div className="flex justify-between px-4 py-2.5 bg-stone-50 border-b border-stone-200 text-sm">
                  <span className="font-medium">{dayLabel(g.day)}</span>
                  <span className="text-stone-500 tabular-nums">{formatDuration(g.total)}</span>
                </div>
                <ul className="divide-y divide-stone-100">
                  {g.sessions.map((s) => {
                    const pages = s.endPage - s.startPage;
                    return (
                      <li key={s.id} className="group flex items-center gap-3 px-4 py-2.5 text-sm">
                        <span className="w-28 shrink-0 text-xs text-stone-500 tabular-nums">
                          {timeOfDay(s.startedAt)} - {timeOfDay(s.endedAt)}
                        </span>
                        <span className="flex-1 min-w-0 truncate">{s.bookTitle}</span>
                        <span className="hidden sm:inline text-xs text-stone-400">
                          {s.source === 'manual' ? 'Logged' : 'Reader'}
                          {pages > 0 ? ` · +${pages} pp` : ''}
                        </span>
                        <span className="w-14 text-right tabular-nums text-stone-700">{formatDuration(s.seconds)}</span>
                        <button
                          onClick={() => onDelete(s)}
                          className="p-1.5 text-stone-300 hover:text-red-600 sm:opacity-0 group-hover:opacity-100 transition"
                          aria-label="Delete session"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
