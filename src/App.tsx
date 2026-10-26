import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Flame, Upload, Clock, Compass, BookOpen, Activity as ActivityIcon, Languages } from 'lucide-react';
import { api } from './api';
import { Book, BookResource, BookResourceType, Session, Shelf, VocabularyEntry } from './types';
import { localDay, secondsByDay, streaks } from './lib/stats';
import { Library } from './components/Library';
import { Activity } from './components/Activity';
import { LogModal } from './components/LogModal';
import { BookModal } from './components/BookModal';
import { BookDetails } from './components/BookDetails';
import { Vocabulary } from './components/Vocabulary';
import { SearchBooks } from './components/SearchBooks';

// The PDF engine is only downloaded when a book is opened
const Reader = lazy(() => import('./components/Reader').then((m) => ({ default: m.Reader })));

type Tab = 'library' | 'discover' | 'activity' | 'vocabulary';

const TABS: Tab[] = ['library', 'discover', 'activity', 'vocabulary'];
const ACTIVE_TAB_KEY = 'athenaeum:active-tab';

function getInitialTab(): Tab {
  try {
    const savedTab = localStorage.getItem(ACTIVE_TAB_KEY);
    return TABS.find((candidate) => candidate === savedTab) ?? 'library';
  } catch {
    return 'library';
  }
}

export default function App() {
  const [books, setBooks] = useState<Book[] | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [vocabulary, setVocabulary] = useState<VocabularyEntry[]>([]);
  const [resources, setResources] = useState<BookResource[]>([]);
  const [tab, setTab] = useState<Tab>(getInitialTab);
  const [today, setToday] = useState(localDay);
  const [reading, setReading] = useState<Book | null>(null);
  const [logFor, setLogFor] = useState<{ bookId?: string } | null>(null);
  const [bookModal, setBookModal] = useState<{ book: Book | null } | null>(null);
  const [detailsBook, setDetailsBook] = useState<Book | null>(null);
  const [discoverSearch, setDiscoverSearch] = useState({ query: '', key: 0 });
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

  useEffect(() => {
    const updateToday = () => {
      const currentDay = localDay();
      setToday((previousDay) => previousDay === currentDay ? previousDay : currentDay);
    };
    const updateTodayWhenVisible = () => {
      if (document.visibilityState === 'visible') updateToday();
    };
    const interval = window.setInterval(updateToday, 60_000);
    window.addEventListener('focus', updateToday);
    document.addEventListener('visibilitychange', updateTodayWhenVisible);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', updateToday);
      document.removeEventListener('visibilitychange', updateTodayWhenVisible);
    };
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(ACTIVE_TAB_KEY, tab);
    } catch {
      // Keep the app usable when browser storage is unavailable.
    }
  }, [tab]);

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

  const saveCover = useCallback(async (bookId: string, coverId: number) => {
    await api.updateBook(bookId, { coverId });
    setBooks((current) => current?.map((book) => book.id === bookId ? { ...book, coverId } : book) ?? null);
  }, []);

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

  const stats = useMemo(() => streaks(secondsByDay(sessions), today), [sessions, today]);

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
    <div className="app-shell min-h-screen flex flex-col">
      <header className="sticky top-0 z-30 border-b border-stone-200/80 bg-[#fbfaf7]/90 backdrop-blur-xl">
        <div className="mx-auto flex h-[72px] max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <div className="flex items-center gap-5 min-w-0">
            <span className="brand-mark"><BookOpen className="h-4 w-4" /></span>
            <span className="font-serif text-xl font-semibold tracking-tight">Athenaeum</span>
            <nav className="hidden items-center gap-1 text-sm sm:flex">
              {(['library', 'discover', 'activity', 'vocabulary'] as Tab[]).map((t) => {
                const NavIcon = t === 'library' ? BookOpen : t === 'discover' ? Compass : t === 'activity' ? ActivityIcon : Languages;
                const label = t === 'library' ? 'My books' : t === 'discover' ? 'Discover' : t === 'activity' ? 'Activity' : 'Words';
                return (
                  <button
                    key={t}
                    onClick={() => {
                      setTab(t);
                      setNotice(null);
                    }}
                    className={`app-nav-link ${tab === t ? 'app-nav-link-active' : ''}`}
                  >
                    <NavIcon className="h-4 w-4" />
                    {label}
                  </button>
                );
              })}
            </nav>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <div
              className="hidden items-center gap-1.5 rounded-full bg-amber-50 px-3 py-2 text-xs font-medium text-amber-900 sm:flex"
              title="Consecutive days with reading time"
            >
              <Flame className="h-4 w-4 text-amber-600" />
              <span>{stats.current} day streak</span>
            </div>
            <button
              onClick={() => setLogFor({})}
              className="inline-flex items-center gap-1.5 rounded-xl border border-stone-200 bg-white/80 px-3 py-2 text-sm text-stone-700 shadow-sm transition hover:border-stone-300 hover:bg-white"
            >
              <Clock className="h-4 w-4" />
              <span className="hidden sm:inline">Log time</span>
            </button>
            <button
              onClick={() => pickPdf()}
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-900 px-3.5 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-emerald-800 disabled:opacity-50"
            >
              <Upload className="h-4 w-4" />
              {busy ? 'Uploading...' : 'Upload PDF'}
            </button>
          </div>
        </div>
        <nav className="flex items-center gap-1 overflow-x-auto px-4 pb-2 sm:hidden">
          {(['library', 'discover', 'activity', 'vocabulary'] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => {
                setTab(t);
                setNotice(null);
              }}
              className={`rounded-full px-3 py-1.5 text-xs font-medium ${tab === t ? 'bg-emerald-900 text-white' : 'text-stone-600 hover:bg-stone-100'}`}
            >
              {t === 'library' ? 'My books' : t === 'discover' ? 'Discover' : t === 'activity' ? 'Activity' : 'Words'}
            </button>
          ))}
        </nav>
      </header>

      <input
        ref={fileRef}
        type="file"
        accept="application/pdf,.pdf"
        multiple
        className="hidden"
        onChange={(e) => onFiles(e.target.files)}
      />

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-7 sm:px-6 sm:py-9">
        {error && (
          <div className="mb-4 flex justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">
            <span>{error}</span>
            <button onClick={() => setError('')} className="text-red-500 hover:text-red-800">
              Dismiss
            </button>
          </div>
        )}
        {notice && (
          <div className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-stone-200 bg-white px-4 py-2.5 text-sm text-stone-800">
            <span>{notice.text}</span>
            <span className="flex shrink-0 gap-3">
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
          <p className="py-16 text-center text-sm text-stone-400">Loading your reading room...</p>
        ) : tab === 'library' ? (
          <Library
            books={books}
            resources={resources}
            onRead={setReading}
            onOpenDetails={setDetailsBook}
            onUpload={pickPdf}
            onCoverFound={saveCover}
            onDiscover={(book) => {
              setDiscoverSearch((search) => ({ query: book.title, key: search.key + 1 }));
              setTab('discover');
            }}
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
            today={today}
            onDelete={(s) => {
              if (window.confirm('Delete this reading session?')) run(() => api.deleteSession(s.id));
            }}
            onLog={() => setLogFor({})}
          />
        ) : tab === 'vocabulary' ? (
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
        ) : (
          <SearchBooks key={discoverSearch.key} books={books} onAdd={refresh} initialQuery={discoverSearch.query} />
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
