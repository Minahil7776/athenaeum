import { type FormEvent, useMemo, useState } from 'react';
import { ExternalLink, Plus, Trash2 } from 'lucide-react';
import { Book, BookResource, BookResourceType } from '../types';
import { Field, inputCls, Modal } from './Modal';

const RESOURCE_LABELS: Record<BookResourceType, string> = {
  'video-essay': 'Video essays',
  lecture: 'University lectures',
  audiobook: 'Audiobooks',
  'research-paper': 'Research papers',
};

const RESOURCE_TYPES = Object.keys(RESOURCE_LABELS) as BookResourceType[];

export function BookDetails({
  book,
  resources,
  onClose,
  onAdd,
  onDelete,
}: {
  book: Book;
  resources: BookResource[];
  onClose: () => void;
  onAdd: (resource: { type: BookResourceType; title: string; url: string }) => Promise<void>;
  onDelete: (resource: BookResource) => Promise<void>;
}) {
  const [type, setType] = useState<BookResourceType>('video-essay');
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const grouped = useMemo(
    () => RESOURCE_TYPES.map((resourceType) => ({
      type: resourceType,
      entries: resources.filter((resource) => resource.type === resourceType),
    })),
    [resources]
  );

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!title.trim()) {
      setError('Enter a name for this resource.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await onAdd({ type, title: title.trim(), url: url.trim() });
      setTitle('');
      setUrl('');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async (resource: BookResource) => {
    setError('');
    try {
      await onDelete(resource);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <Modal title={book.title} onClose={onClose} size="max-w-2xl">
      <div className="space-y-6">
        <section className="rounded-xl border border-stone-200 bg-white p-4">
          <h3 className="font-serif font-semibold">Book details</h3>
          <p className="mt-1 text-sm text-stone-600">{book.author || 'Unknown author'} · {book.genre.replace('_', ' ')}</p>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-stone-500">
            <span>Status: {book.shelf === 'read' ? 'Finished' : book.shelf === 'reading' ? 'Reading' : 'To read'}</span>
            <span>Pages: {book.pages}</span>
            {book.year && <span>Year: {book.year}</span>}
            {book.rating != null && <span>Rating: {book.rating.toFixed(2)}</span>}
          </div>
        </section>

        <form onSubmit={submit} className="space-y-3 rounded-xl border border-stone-200 bg-white p-4">
          <h3 className="font-serif font-semibold">Add a resource</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Resource type">
              <select value={type} onChange={(event) => setType(event.target.value as BookResourceType)} className={inputCls}>
                {RESOURCE_TYPES.map((resourceType) => (
                  <option key={resourceType} value={resourceType}>{RESOURCE_LABELS[resourceType]}</option>
                ))}
              </select>
            </Field>
            <Field label="Name">
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                maxLength={200}
                className={inputCls}
                placeholder="Title or name"
              />
            </Field>
          </div>
          <Field label="Link (optional)">
            <input
              type="url"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              maxLength={2000}
              className={inputCls}
              placeholder="https://..."
            />
          </Field>
          <div className="flex items-center justify-between gap-3">
            {error ? <p className="text-sm text-red-600" role="alert">{error}</p> : <span className="text-xs text-stone-500">A name is required; add a link if you have one.</span>}
            <button
              type="submit"
              disabled={saving}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-stone-900 px-3 py-2 text-sm text-white hover:bg-stone-700 disabled:opacity-50"
            >
              <Plus className="h-4 w-4" />
              Add
            </button>
          </div>
        </form>

        <section className="space-y-4">
          <h3 className="font-serif font-semibold">Resources</h3>
          {resources.length === 0 ? (
            <p className="rounded-xl border border-stone-200 bg-white px-4 py-8 text-center text-sm text-stone-500">
              No resources saved for this book yet.
            </p>
          ) : grouped.map(({ type: resourceType, entries }) => entries.length > 0 && (
            <div key={resourceType}>
              <h4 className="mb-2 text-xs font-medium uppercase tracking-wide text-stone-500">{RESOURCE_LABELS[resourceType]}</h4>
              <ul className="divide-y divide-stone-100 rounded-xl border border-stone-200 bg-white">
                {entries.map((resource) => (
                  <li key={resource.id} className="flex items-center gap-3 px-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      {resource.url ? (
                        <a
                          href={resource.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex max-w-full items-center gap-1.5 truncate text-sm text-stone-800 underline decoration-stone-300 underline-offset-2 hover:decoration-stone-800"
                        >
                          <span className="truncate">{resource.title}</span>
                          <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                        </a>
                      ) : (
                        <span className="text-sm text-stone-800">{resource.title}</span>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => remove(resource)}
                      className="shrink-0 p-1 text-stone-400 hover:text-red-600"
                      aria-label={`Remove ${resource.title}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      </div>
    </Modal>
  );
}
