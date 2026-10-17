import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Flame, Upload, Clock } from 'lucide-react';
import { api } from './api';
import { Book, BookResource, BookResourceType, Session, Shelf, VocabularyEntry } from './types';
import { secondsByDay, streaks } from './lib/stats';
import { Library } from './components/Library';
import { Activity } from './components/Activity';
import { LogModal } from './components/LogModal';
import { BookModal } from './components/BookModal';
import { BookDetails } from './components/BookDetails';
import { Vocabulary } from './components/Vocabulary';

// The PDF engine is only downloaded when a book is opened
const Reader = lazy(() => import('./components/Reader').then((m) => ({ default: m.Reader })));

type Tab = 'library' | 'activity' | 'vocabulary';

export default function App() {
  const [books, setBooks] = useState<Book[] | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [vocabulary, setVocabulary] = useState<VocabularyEntry[]>([]);
  const [resources, setResources] = useState<BookResource[]>([]);
  const [tab, setTab] = useState<Tab>('library');
  const [reading, setReading] = useState<Book | null>(null);
  const [logFor, setLogFor] = useState<{ bookId?: string } | null>(null);
  const [bookModal, setBookModal] = useState<{ book: Book | null } | null>(null);
  const [detailsBook, setDetailsBook] = useState<Book | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState<{ text: string; book: Book } | null>(null);

  const fileRef = useRef<HTMLInputElement>(null);
  const uploadTarget = useRef<string | undefined>(undefined);

  const refresh = useCallback(async () => {
    try {
      const [b, s, v, r] = await Promise.all([api.books(), api.sessions(), api.vocabulary(), api.resources()]);
      setBooks(b);
      setSessions(s);
      setVocabulary(v);
      setResources(r);
      setError('');
    } catch (e) {
      setError('Could not reach the server. ' + (e as Error).message);
      setBooks((prev) => prev ?? []);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const run = async (fn: () => Promise<unknown>) => {
    try {
      setError('');
      await fn();
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const pickPdf = (bookId?: string) => {
    uploadTarget.current = bookId;
    fileRef.current?.click();
  };

  const onFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const target = uploadTarget.current;
    const list = target ? [files[0]] : Array.from(files);
    setBusy(true);
    setError('');
    try {
      let last: Book | null = null;
      for (const f of list) {
        if (!/\.pdf$/i.test(f.name) && f.type !== 'application/pdf') throw new Error(`"${f.name}" is not a PDF.`);
        const { getPdfPageCount } = await import('./lib/pdfMetadata');
        const pages = await getPdfPageCount(f);
        last = await api.upload(f, pages, target);
      }
      await refresh();
      if (last) setNotice({ text: target ? `PDF added to "${last.title}".` : `Added "${last.title}".`, book: last });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const stats = useMemo(() => streaks(secondsByDay(sessions)), [sessions]);

  if (reading) {
    return (
      <Suspense fallback={<p className="p-8 text-sm text-stone-400">Opening...</p>}>
        <Reader
          book={reading}
          onVocabularyAdded={refresh}
          onClose={() => {
            setReading(null);
            refresh();
          }}
        />
      </Suspense>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      <header className="sticky top-0 z-30 bg-[#FBF9F5]/95 backdrop-blur border-b border-stone-200">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-5 min-w-0">
            <span className="font-serif text-xl font-semibold tracking-tight">Athenaeum</span>
            <nav className="flex items-center gap-4 text-sm">
              {(['library', 'activity', 'vocabulary'] as Tab[]).map((t) => (
                <button
                  key={t}
                  onClick={() => {
                    setTab(t);
                    setNotice(null);
                  }}
                  className={`pb-0.5 border-b-2 capitalize transition-colors ${
                    tab === t
                      ? 'border-stone-900 text-stone-900 font-medium'
                      : 'border-transparent text-stone-500 hover:text-stone-900'
                  }`}
                >
                  {t}
                </button>
              ))}
            </nav>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <div
              className="hidden sm:flex items-center gap-1.5 text-xs text-stone-600 mr-2 tabular-nums"
              title="Consecutive days with at least 1 minute of reading"
            >
              <Flame className="w-4 h-4 text-amber-600" />
              <span>{stats.current} day streak</span>
            </div>
            <button
              onClick={() => setLogFor({})}
              className="inline-flex items-center gap-1.5 text-sm px-3 py-2 rounded-lg border border-stone-300 hover:bg-stone-100 transition-colors"
            >
              <Clock className="w-4 h-4" />
              <span className="hidden sm:inline">Log time</span>
            </button>
            <button
              onClick={() => pickPdf()}
              disabled={busy}
              className="inline-flex items-center gap-1.5 text-sm px-3 py-2 rounded-lg bg-stone-900 text-white hover:bg-stone-700 disabled:opacity-50 transition-colors"
            >
              <Upload className="w-4 h-4" />
              {busy ? 'Uploading...' : 'Upload PDF'}
            </button>
          </div>
        </div>
      </header>

      <input
        ref={fileRef}
        type="file"
        accept="application/pdf,.pdf"
        multiple
        className="hidden"
        onChange={(e) => onFiles(e.target.files)}
      />

      <main className="flex-1 max-w-5xl w-full mx-auto px-4 sm:px-6 py-8">
        {error && (
          <div className="mb-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-4 py-2.5 flex justify-between gap-3">
            <span>{error}</span>
            <button onClick={() => setError('')} className="text-red-500 hover:text-red-800">
              Dismiss
            </button>
          </div>
        )}
        {notice && (
          <div className="mb-4 text-sm text-stone-800 bg-white border border-stone-200 rounded-lg px-4 py-2.5 flex items-center justify-between gap-3">
            <span>{notice.text}</span>
            <span className="flex gap-3 shrink-0">
              <button onClick={() => setReading(notice.book)} className="font-medium underline underline-offset-2">
                Read now
              </button>
              <button onClick={() => setNotice(null)} className="text-stone-400 hover:text-stone-700">
                Close
              </button>
            </span>
          </div>
        )}

        {books === null ? (
          <p className="text-sm text-stone-400">Loading...</p>
        ) : tab === 'library' ? (
          <Library
            books={books}
            resources={resources}
            onRead={setReading}
            onOpenDetails={setDetailsBook}
            onUpload={pickPdf}
            onLog={(b) => setLogFor({ bookId: b.id })}
            onEdit={(b) => setBookModal({ book: b })}
            onAdd={() => setBookModal({ book: null })}
            onShelf={(b, shelf: Shelf) => run(() => api.updateBook(b.id, { shelf }))}
            onDelete={(b) => {
              if (window.confirm(`Delete "${b.title}", its PDF and its reading history?`)) run(() => api.deleteBook(b.id));
            }}
          />
        ) : tab === 'activity' ? (
          <Activity
            sessions={sessions}
            onDelete={(s) => {
              if (window.confirm('Delete this reading session?')) run(() => api.deleteSession(s.id));
            }}
            onLog={() => setLogFor({})}
          />
        ) : (
          <Vocabulary
            books={books}
            entries={vocabulary}
            onAdd={async (entry) => {
              await api.addVocabulary(entry);
              await refresh();
            }}
            onDelete={async (entry) => {
              await api.deleteVocabulary(entry.id);
              await refresh();
            }}
          />
        )}
      </main>

      {logFor && books && (
        <LogModal
          books={books}
          initialBookId={logFor.bookId}
          onClose={() => setLogFor(null)}
          onSave={async (s) => {
            await api.logSession(s);
            await refresh();
          }}
        />
      )}

      {bookModal && (
        <BookModal
          book={bookModal.book}
          onClose={() => setBookModal(null)}
          onSave={async (input) => {
            if (bookModal.book) await api.updateBook(bookModal.book.id, input);
            else await api.addBook(input);
            await refresh();
          }}
        />
      )}
      {detailsBook && books && (
        <BookDetails
          book={books.find((book) => book.id === detailsBook.id) || detailsBook}
          resources={resources.filter((resource) => resource.bookId === detailsBook.id)}
          onClose={() => setDetailsBook(null)}
          onAdd={async (resource: { type: BookResourceType; title: string; url: string }) => {
            await api.addResource(detailsBook.id, resource);
            await refresh();
          }}
          onDelete={async (resource) => {
            await api.deleteResource(resource.id);
            await refresh();
          }}
        />
      )}
    </div>
  );
}
