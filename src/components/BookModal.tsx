import { useState } from 'react';
import { Book, Genre, GENRES } from '../types';
import { BookInput } from '../api';
import { Field, Modal, inputCls } from './Modal';

export function BookModal({
  book,
  onClose,
  onSave,
}: {
  book: Book | null;
  onClose: () => void;
  onSave: (b: BookInput) => Promise<void>;
}) {
  const [title, setTitle] = useState(book?.title || '');
  const [author, setAuthor] = useState(book?.author || '');
  const [genre, setGenre] = useState<Genre>(book?.genre || 'other');
  const [rating, setRating] = useState(book?.rating == null ? '' : String(book.rating));
  const [year, setYear] = useState(book?.year == null ? '' : String(book.year));
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!title.trim()) return setErr('Title is required.');
    setSaving(true);
    setErr('');
    try {
      const parsedRating = rating.trim() ? Number(rating) : null;
      const parsedYear = year.trim() ? Number(year) : null;
      if (parsedRating !== null && (!Number.isFinite(parsedRating) || parsedRating < 0 || parsedRating > 5)) {
        setErr('Rating must be between 0 and 5.');
        setSaving(false);
        return;
      }
      if (parsedYear !== null && (!Number.isInteger(parsedYear) || parsedYear < 1)) {
        setErr('Enter a valid publication year.');
        setSaving(false);
        return;
      }
      await onSave({ title: title.trim(), author: author.trim(), genre, rating: parsedRating, year: parsedYear });
      onClose();
    } catch (e) {
      setErr((e as Error).message);
      setSaving(false);
    }
  };

  return (
    <Modal title={book ? 'Edit book' : 'Add book'} onClose={onClose}>
      <div className="space-y-4">
        <Field label="Title">
          <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} className={inputCls} />
        </Field>
        <Field label="Author">
          <input value={author} onChange={(e) => setAuthor(e.target.value)} className={inputCls} />
        </Field>
        <Field label="Genre">
          <select value={genre} onChange={(e) => setGenre(e.target.value as Genre)} className={inputCls}>
            {(Object.keys(GENRES) as Genre[]).map((g) => (
              <option key={g} value={g}>
                {GENRES[g].name}
              </option>
            ))}
          </select>
          <p className="text-xs text-stone-500 mt-1">Page count is set automatically when you upload a PDF.</p>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Rating (0–5)">
            <input
              type="number"
              min={0}
              max={5}
              step={0.01}
              value={rating}
              onChange={(e) => setRating(e.target.value)}
              className={inputCls}
            />
          </Field>
          <Field label="Publication year">
            <input
              type="number"
              min={1}
              value={year}
              onChange={(e) => setYear(e.target.value)}
              className={inputCls}
            />
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
