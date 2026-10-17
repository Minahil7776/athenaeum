import { type FormEvent, useMemo, useState } from 'react';
import { BookOpen, Plus, Search, Trash2 } from 'lucide-react';
import { Book, VocabularyEntry } from '../types';
import { Field, inputCls } from './Modal';

export function Vocabulary({
  books,
  entries,
  onAdd,
  onDelete,
}: {
  books: Book[];
  entries: VocabularyEntry[];
  onAdd: (entry: { word: string; bookId: string; page: number }) => Promise<void>;
  onDelete: (entry: VocabularyEntry) => Promise<void>;
}) {
  const [word, setWord] = useState('');
  const [bookId, setBookId] = useState(books[0]?.id || '');
  const [page, setPage] = useState('1');
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const selectedBook = books.find((book) => book.id === bookId);
  const visible = useMemo(() => {
    const search = query.trim().toLocaleLowerCase();
    return entries.filter((entry) =>
      !search ||
      entry.word.toLocaleLowerCase().includes(search) ||
      entry.bookTitle.toLocaleLowerCase().includes(search)
    );
  }, [entries, query]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const normalizedWord = word.trim();
    const pageNumber = Number(page);
    if (!normalizedWord) {
      setError('Enter a word or phrase.');
      return;
    }
    if (!bookId) {
      setError('Add a book to your library first.');
      return;
    }
    if (!Number.isInteger(pageNumber) || pageNumber < 1 ||
        (selectedBook && selectedBook.pages > 0 && pageNumber > selectedBook.pages)) {
      setError(`Enter a valid page${selectedBook?.pages ? ` from 1 to ${selectedBook.pages}` : ''}.`);
      return;
    }
    setSaving(true);
    setError('');
    try {
      await onAdd({ word: normalizedWord, bookId, page: pageNumber });
      setWord('');
      setPage('1');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const removeEntry = async (entry: VocabularyEntry) => {
    setError('');
    try {
      await onDelete(entry);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif text-2xl font-semibold">Vocabulary</h1>
        <p className="mt-1 text-sm text-stone-500">Save useful words with the book and page where you found them.</p>
      </div>

      <form onSubmit={submit} className="bg-white border border-stone-200 rounded-xl p-4 space-y-4">
        <h2 className="font-serif font-semibold">Add a word</h2>
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_8rem_auto] sm:items-end">
          <Field label="Word or phrase">
            <input
              value={word}
              maxLength={120}
              onChange={(event) => setWord(event.target.value)}
              className={inputCls}
              placeholder="e.g. serendipity"
            />
          </Field>
          <Field label="Book">
            <select
              value={bookId}
              onChange={(event) => {
                setBookId(event.target.value);
                setPage('1');
              }}
              className={inputCls}
            >
              {books.length === 0 && <option value="">No books available</option>}
              {books.map((book) => <option key={book.id} value={book.id}>{book.title}</option>)}
            </select>
          </Field>
          <Field label="Page">
            <input
              type="number"
              min={1}
              max={selectedBook?.pages || undefined}
              value={page}
              onChange={(event) => setPage(event.target.value)}
              className={inputCls}
            />
          </Field>
          <button
            type="submit"
            disabled={saving || books.length === 0}
            className="inline-flex items-center justify-center gap-1.5 px-3 py-2 text-sm rounded-lg bg-stone-900 text-white hover:bg-stone-700 disabled:opacity-50"
          >
            <Plus className="w-4 h-4" />
            Add
          </button>
        </div>
        {error && <p className="text-sm text-red-600" role="alert">{error}</p>}
      </form>

      <section>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-3">
          <h2 className="font-serif font-semibold">Saved words <span className="text-sm text-stone-400">{entries.length}</span></h2>
          <label className="relative block sm:w-72">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className={`${inputCls} pl-8`}
              placeholder="Search words or books"
              aria-label="Search vocabulary"
            />
          </label>
        </div>

        {visible.length === 0 ? (
          <div className="bg-white border border-stone-200 rounded-xl px-4 py-12 text-center">
            <BookOpen className="mx-auto w-6 h-6 text-stone-400" />
            <p className="mt-2 text-sm text-stone-500">
              {entries.length ? 'No saved words match your search.' : 'Your vocabulary is empty. Add a word here or select text while reading a PDF.'}
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-stone-200/70 bg-white border border-stone-200 rounded-xl">
            {visible.map((entry) => (
              <li key={entry.id} className="flex items-center gap-3 px-4 py-3">
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{entry.word}</div>
                  <div className="mt-0.5 text-xs text-stone-500 truncate">
                    {entry.bookTitle} <span className="mx-1">·</span> p. {entry.page}
                  </div>
                </div>
                <button
                  onClick={() => removeEntry(entry)}
                  className="p-1.5 text-stone-400 hover:text-red-600"
                  aria-label={`Remove ${entry.word}`}
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
