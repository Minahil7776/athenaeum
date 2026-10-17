import { useMemo, useState } from 'react';
import { Book } from '../types';
import { localDay } from '../lib/stats';
import { Field, Modal, inputCls } from './Modal';

const pad = (n: number) => String(n).padStart(2, '0');

interface Props {
  books: Book[];
  initialBookId?: string;
  onClose: () => void;
  onSave: (s: { bookId: string; day: string; startedAt: string; minutes: number; pagesRead: number }) => Promise<void>;
}

export function LogModal({ books, initialBookId, onClose, onSave }: Props) {
  const sorted = useMemo(() => {
    const order = { reading: 0, 'to-read': 1, read: 2 } as const;
    return [...books].sort((a, b) => order[a.shelf] - order[b.shelf] || a.title.localeCompare(b.title));
  }, [books]);

  const now = new Date();
  const [bookId, setBookId] = useState(initialBookId || sorted[0]?.id || '');
  const [day, setDay] = useState(localDay(now));
  const [time, setTime] = useState(`${pad(now.getHours())}:${pad(now.getMinutes())}`);
  const [minutes, setMinutes] = useState('30');
  const [pages, setPages] = useState('');
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    const mins = parseInt(minutes, 10);
    if (!bookId) return setErr('Choose a book.');
    if (!mins || mins < 1) return setErr('Enter the minutes you read.');
    if (!day || !time) return setErr('Choose a date and time.');
    const startedAt = new Date(`${day}T${time}:00`);
    if (isNaN(startedAt.getTime())) return setErr('Invalid date or time.');
    setSaving(true);
    setErr('');
    try {
      await onSave({
        bookId,
        day,
        startedAt: startedAt.toISOString(),
        minutes: mins,
        pagesRead: parseInt(pages, 10) || 0,
      });
      onClose();
    } catch (e) {
      setErr((e as Error).message);
      setSaving(false);
    }
  };

  return (
    <Modal title="Log reading time" onClose={onClose}>
      <div className="space-y-4">
        <Field label="Book">
          <select value={bookId} onChange={(e) => setBookId(e.target.value)} className={inputCls}>
            {sorted.map((b) => (
              <option key={b.id} value={b.id}>
                {b.title}
              </option>
            ))}
          </select>
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Date">
            <input type="date" value={day} max={localDay()} onChange={(e) => setDay(e.target.value)} className={inputCls} />
          </Field>
          <Field label="Started at">
            <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className={inputCls} />
          </Field>
          <Field label="Minutes read">
            <input
              type="number"
              min={1}
              value={minutes}
              onChange={(e) => setMinutes(e.target.value)}
              className={inputCls}
            />
          </Field>
          <Field label="Pages read (optional)">
            <input type="number" min={0} value={pages} onChange={(e) => setPages(e.target.value)} className={inputCls} />
          </Field>
        </div>

        {err && <p className="text-sm text-red-600">{err}</p>}

        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onClose} className="px-3.5 py-2 text-sm rounded-lg hover:bg-stone-100">
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={saving}
            className="px-3.5 py-2 text-sm rounded-lg bg-stone-900 text-white hover:bg-stone-700 disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
