import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BookOpen, Clock, Compass, FileUp, Link2, Pencil, Plus, Search, Star, Trash2, Upload } from 'lucide-react';
import { Book, BookResource, BookResourceType, Genre, GENRES, Shelf, SHELF_LABEL } from '../types';
import { formatDuration } from '../lib/stats';

type Filter = Shelf | 'all';

const RESOURCE_CARD_LABELS: Record<BookResourceType, string> = {
  'video-essay': 'Videos',
  lecture: 'Lectures',
  audiobook: 'Audio',
  'research-paper': 'Papers',
};
const RESOURCE_CARD_TYPES = Object.keys(RESOURCE_CARD_LABELS) as BookResourceType[];

interface Props {
  books: Book[];
  resources: BookResource[];
  onRead: (book: Book) => void;
  onOpenDetails: (book: Book) => void;
  onUpload: (bookId?: string) => void;
  onDiscover: (book: Book) => void;
  onCoverFound: (bookId: string, coverId: number) => Promise<void>;
  onLog: (book: Book) => void;
  onEdit: (book: Book) => void;
  onAdd: () => void;
  onShelf: (book: Book, shelf: Shelf) => void;
  onDelete: (book: Book) => void;
}

export function Library({
  books,
  resources,
  onRead,
  onOpenDetails,
  onUpload,
  onDiscover,
  onCoverFound,
  onLog,
  onEdit,
  onAdd,
  onShelf,
  onDelete,
}: Props) {
  const counts = useMemo(() => {
    const result = { all: books.length, reading: 0, 'to-read': 0, read: 0 } as Record<Filter, number>;
    books.forEach((book) => result[book.shelf]++);
    return result;
  }, [books]);

  const [filter, setFilter] = useState<Filter>('all');
  const [genre, setGenre] = useState<Genre | 'all'>('all');
  const [query, setQuery] = useState('');
  const resourcesByBook = useMemo(() => {
    const byBook = new Map<string, BookResource[]>();
    resources.forEach((resource) => {
      const items = byBook.get(resource.bookId) || [];
      items.push(resource);
      byBook.set(resource.bookId, items);
    });
    return byBook;
  }, [resources]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return books
      .filter((book) =>
        (filter === 'all' || book.shelf === filter) &&
        (genre === 'all' || book.genre === genre) &&
        (!q || book.title.toLowerCase().includes(q) || book.author.toLowerCase().includes(q))
      )
      .map((book, index) => ({ book, index }))
      .sort((a, b) => {
        const aDate = a.book.lastReadAt || a.book.createdAt;
        const bDate = b.book.lastReadAt || b.book.createdAt;
        return bDate.localeCompare(aDate) || a.index - b.index;
      })
      .map(({ book }) => book);
  }, [books, filter, genre, query]);

  const pills: Filter[] = ['reading', 'to-read', 'read', 'all'];
  const readingCount = counts.reading;
  const availableCount = books.filter((book) => !book.hasPdf).length;

  return (
    <section className="library-page">
      <div className="library-hero">
        <div className="relative z-10 max-w-2xl">
          <p className="library-eyebrow">YOUR PERSONAL READING ROOM</p>
          <h1 className="library-title">A life between the pages.</h1>
          <p className="mt-3 max-w-xl text-sm leading-6 text-stone-600 sm:text-base">
            Keep the stories you love close, pick up where you left off, and find your next read.
          </p>
          <div className="mt-6 flex flex-wrap gap-2">
            <button onClick={onAdd} className="library-primary-button">
              <Plus className="h-4 w-4" /> Add a book
            </button>
            <button onClick={() => onUpload()} className="library-secondary-button">
              <Upload className="h-4 w-4" /> Upload a PDF
            </button>
          </div>
        </div>
        <div className="library-hero-art" aria-hidden="true">
          <span className="hero-book hero-book-one" />
          <span className="hero-book hero-book-two" />
          <span className="hero-book hero-book-three" />
          <span className="hero-spark hero-spark-one">✳</span>
          <span className="hero-spark hero-spark-two">✳</span>
        </div>
      </div>

      <div className="library-overview">
        <div>
          <span className="library-overview-number">{books.length}</span>
          <span className="library-overview-label">in your library</span>
        </div>
        <div>
          <span className="library-overview-number">{readingCount}</span>
          <span className="library-overview-label">currently reading</span>
        </div>
        <div>
          <span className="library-overview-number">{availableCount}</span>
          <span className="library-overview-label">to find a copy</span>
        </div>
      </div>

      <div className="mt-8 flex flex-col gap-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2 overflow-x-auto pb-1">
            {pills.map((pill) => (
              <button
                key={pill}
                onClick={() => setFilter(pill)}
                aria-pressed={filter === pill}
                className={`shelf-tab ${filter === pill ? 'shelf-tab-active' : ''}`}
              >
                {pill === 'all' ? 'All books' : SHELF_LABEL[pill]}
                <span className="shelf-count">{counts[pill]}</span>
              </button>
            ))}
          </div>
          <button onClick={() => onUpload()} className="hidden shrink-0 items-center gap-1.5 text-xs font-medium text-stone-600 hover:text-stone-950 sm:inline-flex">
            <Upload className="h-3.5 w-3.5" /> Upload PDF
          </button>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <label className="library-search">
            <Search className="h-4 w-4 shrink-0 text-stone-400" aria-hidden="true" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search your shelves"
              aria-label="Search your library"
            />
          </label>
          <select
            value={genre}
            onChange={(event) => setGenre(event.target.value as Genre | 'all')}
            className="library-filter"
            aria-label="Filter by genre"
          >
            <option value="all">Every genre</option>
            {(Object.keys(GENRES) as Genre[]).map((item) => (
              <option key={item} value={item}>{GENRES[item].name}</option>
            ))}
          </select>
          <button onClick={onAdd} className="library-filter shrink-0">
            <Plus className="h-4 w-4" /> Add book
          </button>
        </div>
      </div>

      {visible.length === 0 ? (
        <div className="library-empty">
          <BookOpen className="mx-auto h-8 w-8 text-emerald-800/50" />
          <p className="mt-3 font-serif text-lg font-semibold text-stone-800">
            {books.length === 0 ? 'Your reading story starts here.' : 'No books found on this shelf.'}
          </p>
          <p className="mt-1 text-sm text-stone-500">
            {books.length === 0 ? 'Discover a title or add a book you already own.' : 'Try another search or shelf.'}
          </p>
          {books.length === 0 && (
            <button onClick={onAdd} className="library-primary-button mt-5">
              <Plus className="h-4 w-4" /> Add your first book
            </button>
          )}
        </div>
      ) : (
        <ul className="book-grid">
          {visible.map((book) => {
            const pages = book.hasPdf ? book.pages : 0;
            const currentPage = pages > 0 ? Math.min(Math.max(0, book.currentPage), pages) : 0;
            const progress = pages > 0 ? Math.min(100, Math.round((currentPage / pages) * 100)) : 0;
            const genreInfo = GENRES[book.genre] || GENRES.other;
            const bookResources = resourcesByBook.get(book.id) || [];
            return (
              <li key={book.id} className="book-tile">
                <button
                  type="button"
                  onClick={() => onOpenDetails(book)}
                  className="book-cover-button"
                  aria-label={`Open details for ${book.title}`}
                >
                  <BookCover book={book} color={genreInfo.color} onCoverFound={onCoverFound} />
                  <span className={`book-status ${book.hasPdf ? 'book-status-ready' : 'book-status-missing'}`}>
                    {book.hasPdf ? <><BookOpen className="h-3 w-3" /> Ready to read</> : 'Find a copy'}
                  </span>
                </button>

                <div className="book-tile-body">
                  <p className="book-genre" style={{ color: genreInfo.color }}>{genreInfo.name}</p>
                  <button type="button" onClick={() => onOpenDetails(book)} className="book-title-link" title={book.title}>
                    {book.title}
                  </button>
                  <p className="book-author">{book.author || 'Unknown author'}</p>
                  <div className="mt-2 flex min-h-4 items-center gap-1 text-xs text-amber-600">
                    {book.rating != null ? (
                      <><Star className="h-3 w-3 fill-current" /><span className="font-semibold tabular-nums">{book.rating.toFixed(1)}</span></>
                    ) : <span className="text-stone-400">{book.year || ' '}</span>}
                    {book.rating != null && book.year ? <span className="ml-1 text-stone-400">{book.year}</span> : null}
                  </div>

                  {book.hasPdf ? (
                    <div className="mt-3">
                      <div className="mb-1 flex justify-between text-[10px] text-stone-500">
                        <span>{currentPage > 0 ? `Page ${currentPage} of ${pages}` : `${pages} pages`}</span>
                        <span>{progress}%</span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-stone-100">
                        <div className="h-full rounded-full bg-emerald-700 transition-all" style={{ width: `${progress}%` }} />
                      </div>
                    </div>
                  ) : (
                    <p className="mt-3 text-[11px] text-stone-500">Not in your collection yet</p>
                  )}

                  <div className="mt-3 flex min-h-4 items-center gap-2 text-[10px] text-stone-400">
                    {RESOURCE_CARD_TYPES.filter((type) => bookResources.some((resource) => resource.type === type)).map((type) => (
                      <span key={type} className="inline-flex items-center gap-1">
                        {type === 'video-essay' && <Link2 className="h-3 w-3" />}
                        {RESOURCE_CARD_LABELS[type]}
                      </span>
                    ))}
                    {book.hasPdf && book.totalSeconds > 0 && (
                      <span className="ml-auto inline-flex items-center gap-1"><Clock className="h-3 w-3" />{formatDuration(book.totalSeconds)}</span>
                    )}
                  </div>

                  <div className="mt-4 flex items-center gap-1.5">
                    {book.hasPdf ? (
                      <button onClick={() => onRead(book)} className="book-action-primary">
                        <BookOpen className="h-3.5 w-3.5" />
                        {book.totalSeconds > 0 || currentPage > 1 ? 'Continue' : 'Read'}
                      </button>
                    ) : (
                      <button onClick={() => onDiscover(book)} className="book-action-primary">
                        <Compass className="h-3.5 w-3.5" /> Find a copy
                      </button>
                    )}
                    {!book.hasPdf && (
                      <button onClick={() => onUpload(book.id)} className="book-action-icon" aria-label={`Upload PDF for ${book.title}`} title="Upload your PDF">
                        <FileUp className="h-4 w-4" />
                      </button>
                    )}
                    {book.hasPdf && (
                      <button onClick={() => onUpload(book.id)} className="book-action-icon" aria-label={`Replace PDF for ${book.title}`} title="Replace PDF">
                        <FileUp className="h-4 w-4" />
                      </button>
                    )}
                    <select
                      value={book.shelf}
                      onChange={(event) => onShelf(book, event.target.value as Shelf)}
                      className="book-shelf-select"
                      aria-label={`Move ${book.title} to a shelf`}
                    >
                      {(Object.keys(SHELF_LABEL) as Shelf[]).map((shelf) => (
                        <option key={shelf} value={shelf}>{SHELF_LABEL[shelf]}</option>
                      ))}
                    </select>
                    <div className="book-more-actions">
                      <IconBtn label="Log time" onClick={() => onLog(book)}><Clock className="h-4 w-4" /></IconBtn>
                      <IconBtn label="Edit book" onClick={() => onEdit(book)}><Pencil className="h-4 w-4" /></IconBtn>
                      <IconBtn label="Delete book" onClick={() => onDelete(book)} danger><Trash2 className="h-4 w-4" /></IconBtn>
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function BookCover({
  book,
  color,
  onCoverFound,
}: {
  book: Book;
  color: string;
  onCoverFound: Props['onCoverFound'];
}) {
  const coverRef = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  const [coverId, setCoverId] = useState(book.coverId ?? null);
  const [lookingUp, setLookingUp] = useState(false);
  const [lookupError, setLookupError] = useState('');
  const lookupStarted = useRef(false);

  const lookupCover = useCallback(async () => {
    if (!book.hasPdf || coverId || lookupStarted.current) return;
    lookupStarted.current = true;
    setLookingUp(true);
    setLookupError('');
    try {
      const params = new URLSearchParams({
        title: book.title,
        limit: '8',
        fields: 'title,author_name,cover_i',
      });
      if (book.author) params.set('author', book.author);
      const response = await fetch(`https://openlibrary.org/search.json?${params}`);
      if (!response.ok) throw new Error(`Cover search failed (${response.status}).`);
      const data = await response.json() as {
        docs?: { title?: string; author_name?: string[]; cover_i?: number }[];
      };
      const normalize = (value: string) => value.toLocaleLowerCase().replace(/[^a-z0-9]/g, '');
      const title = normalize(book.title);
      const author = normalize(book.author);
      const match = data.docs?.find((result) => {
        if (!result.cover_i || normalize(result.title || '') !== title) return false;
        if (!author || !result.author_name?.length) return true;
        return result.author_name.some((name) => {
          const candidate = normalize(name);
          return candidate === author || candidate.includes(author) || author.includes(candidate);
        });
      });
      if (match?.cover_i) {
        await onCoverFound(book.id, match.cover_i);
        setCoverId(match.cover_i);
      }
    } catch (error) {
      setLookupError(error instanceof Error ? error.message : 'Could not find this book cover.');
    } finally {
      setLookingUp(false);
    }
  }, [book.author, book.hasPdf, book.id, book.title, coverId, onCoverFound]);

  useEffect(() => {
    const element = coverRef.current;
    if (!element || !book.hasPdf || coverId) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        observer.disconnect();
        void lookupCover();
      }
    }, { rootMargin: '250px' });
    observer.observe(element);
    return () => observer.disconnect();
  }, [book.hasPdf, coverId, lookupCover]);

  const coverUrl = coverId && !failed
    ? `https://covers.openlibrary.org/b/id/${coverId}-M.jpg`
    : null;

  return (
    <div ref={coverRef} className="book-cover" style={{ '--cover-accent': color } as React.CSSProperties}>
      {coverUrl ? (
        <img
          src={coverUrl}
          alt={`Cover of ${book.title}`}
          loading="lazy"
          onError={() => setFailed(true)}
          className="h-full w-full object-cover"
        />
      ) : (
        <div className="book-cover-fallback">
          <span className="book-cover-mark"><BookOpen className="h-5 w-5" /></span>
          <span className="book-cover-title">{book.title}</span>
          <span className="book-cover-author">{book.author || 'Unknown author'}</span>
          <span className="book-cover-rule" />
        </div>
      )}
      {lookingUp && <span className="book-cover-loading">Finding cover…</span>}
      {lookupError && <span className="book-cover-error" title={lookupError}>Cover unavailable</span>}
    </div>
  );
}

function IconBtn({
  children,
  label,
  onClick,
  danger,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className={`rounded-md p-1.5 text-stone-400 transition hover:bg-stone-100 ${danger ? 'hover:text-red-600' : 'hover:text-stone-900'}`}
    >
      {children}
    </button>
  );
}
