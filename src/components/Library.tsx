import { useMemo, useState } from 'react';
import { Search, Plus, BookOpen, Upload, Clock, Pencil, Trash2, FileUp, Link2 } from 'lucide-react';
import { Book, BookResource, BookResourceType, Genre, GENRES, Shelf, SHELF_LABEL } from '../types';
import { formatDuration } from '../lib/stats';

type Filter = Shelf | 'all';

const RESOURCE_CARD_LABELS: Record<BookResourceType, string> = {
  'video-essay': 'Video essays',
  lecture: 'Lectures',
  audiobook: 'Audiobooks',
  'research-paper': 'Research papers',
};
const RESOURCE_CARD_TYPES = Object.keys(RESOURCE_CARD_LABELS) as BookResourceType[];

interface Props {
  books: Book[];
  resources: BookResource[];
  onRead: (b: Book) => void;
  onOpenDetails: (b: Book) => void;
  onUpload: (bookId?: string) => void;
  onLog: (b: Book) => void;
  onEdit: (b: Book) => void;
  onAdd: () => void;
  onShelf: (b: Book, shelf: Shelf) => void;
  onDelete: (b: Book) => void;
}

export function Library({ books, resources, onRead, onOpenDetails, onUpload, onLog, onEdit, onAdd, onShelf, onDelete }: Props) {
  const counts = useMemo(() => {
    const c = { all: books.length, reading: 0, 'to-read': 0, read: 0 } as Record<Filter, number>;
    books.forEach((b) => c[b.shelf]++);
    return c;
  }, [books]);

  const [filter, setFilter] = useState<Filter>(counts.reading > 0 ? 'reading' : 'all');
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
    const list = books.filter(
      (b) =>
        (filter === 'all' || b.shelf === filter) &&
        (genre === 'all' || b.genre === genre) &&
        (!q || b.title.toLowerCase().includes(q) || b.author.toLowerCase().includes(q))
    );
    // Most recently read / added first (stable for ties)
    return list
      .map((b, i) => ({ b, i }))
      .sort((x, y) => {
        const kx = x.b.lastReadAt || x.b.createdAt;
        const ky = y.b.lastReadAt || y.b.createdAt;
        return ky.localeCompare(kx) || x.i - y.i;
      })
      .map((x) => x.b);
  }, [books, filter, genre, query]);

  const pills: Filter[] = ['reading', 'to-read', 'read', 'all'];

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-5">
        <div className="flex items-center gap-1 flex-wrap">
          {pills.map((p) => (
            <button
              key={p}
              onClick={() => setFilter(p)}
              className={`px-3 py-1.5 rounded-full text-sm transition-colors ${
                filter === p ? 'bg-stone-900 text-white' : 'text-stone-600 hover:bg-stone-100'
              }`}
            >
              {p === 'all' ? 'All' : SHELF_LABEL[p]} <span className="opacity-60 tabular-nums">{counts[p]}</span>
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 sm:ml-auto">
          <div className="relative flex-1 sm:flex-none">
            <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-stone-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search"
              className="w-full sm:w-44 pl-8 pr-2 py-1.5 text-sm bg-white border border-stone-200 rounded-lg focus:outline-none focus:border-stone-400"
            />
          </div>
          <select
            value={genre}
            onChange={(e) => setGenre(e.target.value as Genre | 'all')}
            className="py-1.5 px-2 text-sm bg-white border border-stone-200 rounded-lg focus:outline-none"
            aria-label="Genre"
          >
            <option value="all">All genres</option>
            {(Object.keys(GENRES) as Genre[]).map((g) => (
              <option key={g} value={g}>
                {GENRES[g].name}
              </option>
            ))}
          </select>
          <button
            onClick={onAdd}
            className="inline-flex items-center gap-1 text-sm px-2.5 py-1.5 rounded-lg border border-stone-300 hover:bg-stone-100 whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            Add book
          </button>
        </div>
      </div>

      {visible.length === 0 ? (
        <div className="text-center text-stone-500 py-20 text-sm">
          {books.length === 0 ? (
            <>
              <p>Your library is empty.</p>
              <p>Upload a PDF to start reading.</p>
            </>
          ) : (
            <p>No books match.</p>
          )}
        </div>
      ) : (
        <ul className="divide-y divide-stone-200/70 bg-white border border-stone-200 rounded-xl">
          {visible.map((b) => {
            const pages = b.hasPdf ? b.pages : 0;
            const currentPage = b.hasPdf && pages > 0 ? Math.min(Math.max(0, b.currentPage), pages) : 0;
            const pct = pages > 0 ? Math.min(100, Math.round((currentPage / pages) * 100)) : 0;
            const g = GENRES[b.genre] || GENRES.other;
            const bookResources = resourcesByBook.get(b.id) || [];
            return (
              <li key={b.id} className="group px-4 py-3.5 flex items-center gap-3 sm:gap-4">
                <span className="w-1.5 self-stretch rounded-full shrink-0" style={{ backgroundColor: g.color }} />

                <button
                  type="button"
                  onClick={() => onOpenDetails(b)}
                  className="flex-1 min-w-0 text-left rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-500"
                  aria-label={`Open details for ${b.title}`}
                >
                  <div className="font-serif font-semibold leading-snug truncate group-hover:text-stone-600">{b.title}</div>
                  <div className="text-xs text-stone-500 mt-0.5 truncate">
                    {b.author || 'Unknown author'}
                    <span className="mx-1.5">·</span>
                    {g.name}
                    {b.rating != null ? (
                      <>
                        <span className="mx-1.5">·</span>
                        {b.rating.toFixed(2)}
                      </>
                    ) : null}
                    {b.year ? (
                      <>
                        <span className="mx-1.5">·</span>
                        {b.year}
                      </>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-3 mt-2">
                    <div className="h-1 w-24 sm:w-40 bg-stone-100 rounded-full overflow-hidden shrink-0">
                      <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: g.color }} />
                    </div>
                    <span className="text-[11px] text-stone-500 tabular-nums truncate">
                      {`p. ${currentPage} / ${pages}`}
                      {'  ·  '}
                      {formatDuration(b.totalSeconds)}
                    </span>
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-stone-400">
                    {RESOURCE_CARD_TYPES.map((resourceType) => {
                      const count = bookResources.filter((resource) => resource.type === resourceType).length;
                      return (
                        <span key={resourceType} className="inline-flex items-center gap-1">
                          {resourceType === 'video-essay' && <Link2 className="h-3 w-3" />}
                          {RESOURCE_CARD_LABELS[resourceType]} {count}
                        </span>
                      );
                    })}
                  </div>
                </button>

                <select
                  value={b.shelf}
                  onChange={(e) => onShelf(b, e.target.value as Shelf)}
                  className="hidden md:block text-xs bg-transparent border border-stone-200 rounded-md py-1 px-1.5 text-stone-600"
                  aria-label="Shelf"
                >
                  {(Object.keys(SHELF_LABEL) as Shelf[]).map((s) => (
                    <option key={s} value={s}>
                      {SHELF_LABEL[s]}
                    </option>
                  ))}
                </select>

                <div className="flex items-center">
                  <div className="hidden sm:flex items-center opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                    <IconBtn label="Log time" onClick={() => onLog(b)}>
                      <Clock className="w-4 h-4" />
                    </IconBtn>
                    {b.hasPdf && (
                      <IconBtn label="Replace PDF" onClick={() => onUpload(b.id)}>
                        <FileUp className="w-4 h-4" />
                      </IconBtn>
                    )}
                    <IconBtn label="Edit" onClick={() => onEdit(b)}>
                      <Pencil className="w-4 h-4" />
                    </IconBtn>
                    <IconBtn label="Delete" onClick={() => onDelete(b)} danger>
                      <Trash2 className="w-4 h-4" />
                    </IconBtn>
                  </div>

                  {b.hasPdf ? (
                    <button
                      onClick={() => onRead(b)}
                      className="ml-1 inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg bg-stone-900 text-white hover:bg-stone-700 transition-colors"
                    >
                      <BookOpen className="w-4 h-4" />
                      {b.totalSeconds > 0 || currentPage > 1 ? 'Continue' : 'Read'}
                    </button>
                  ) : (
                    <button
                      onClick={() => onUpload(b.id)}
                      className="ml-1 inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg border border-stone-300 hover:bg-stone-100 transition-colors"
                    >
                      <Upload className="w-4 h-4" />
                      <span className="hidden sm:inline">Upload PDF</span>
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
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
      onClick={onClick}
      title={label}
      aria-label={label}
      className={`p-2 rounded-md text-stone-400 hover:bg-stone-100 ${danger ? 'hover:text-red-600' : 'hover:text-stone-900'}`}
    >
      {children}
    </button>
  );
}
