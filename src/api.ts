import { Book, BookResource, BookResourceType, Session, Genre, Shelf, VocabularyEntry } from './types';

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let msg = `Request failed (${res.status})`;
    try {
      msg = (await res.json()).error || msg;
    } catch {}
    throw new Error(msg);
  }
  return res.json();
}

const send = (method: string, url: string, body?: unknown) =>
  fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

export interface BookInput {
  title: string;
  author: string;
  genre: Genre;
  rating: number | null;
  year: number | null;
}

export const api = {
  books: () => fetch('/api/books').then((r) => json<Book[]>(r)),
  sessions: () => fetch('/api/sessions').then((r) => json<Session[]>(r)),
  vocabulary: () => fetch('/api/vocabulary').then((r) => json<VocabularyEntry[]>(r)),
  addVocabulary: (entry: { word: string; bookId: string; page: number }) =>
    send('POST', '/api/vocabulary', entry).then((r) => json<VocabularyEntry>(r)),
  deleteVocabulary: (id: string) =>
    send('DELETE', `/api/vocabulary/${encodeURIComponent(id)}`).then((r) => json<{ ok: boolean }>(r)),
  resources: () => fetch('/api/resources').then((r) => json<BookResource[]>(r)),
  addResource: (bookId: string, resource: { type: BookResourceType; title: string; url: string }) =>
    send('POST', `/api/books/${encodeURIComponent(bookId)}/resources`, resource).then((r) => json<BookResource>(r)),
  deleteResource: (id: string) =>
    send('DELETE', `/api/resources/${encodeURIComponent(id)}`).then((r) => json<{ ok: boolean }>(r)),

  addBook: (b: BookInput) => send('POST', '/api/books', b).then((r) => json<Book>(r)),
  updateBook: (id: string, patch: Partial<BookInput> & { shelf?: Shelf }) =>
    send('PATCH', `/api/books/${encodeURIComponent(id)}`, patch).then((r) => json<{ ok: boolean }>(r)),
  deleteBook: (id: string) => send('DELETE', `/api/books/${encodeURIComponent(id)}`).then((r) => json<{ ok: boolean }>(r)),

  // Upload a PDF. With bookId it is attached to that book, otherwise a new book is created.
  upload: (file: File, pages: number, bookId?: string) =>
    fetch(`/api/upload?name=${encodeURIComponent(file.name)}&pages=${pages}${bookId ? `&bookId=${encodeURIComponent(bookId)}` : ''}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/pdf' },
      body: file,
    }).then((r) => json<Book>(r)),
  fileUrl: (id: string) => `/api/books/${encodeURIComponent(id)}/file`,

  logSession: (s: { bookId: string; day: string; startedAt: string; minutes: number; pagesRead: number }) =>
    send('POST', '/api/sessions', s).then((r) => json<Session>(r)),
  deleteSession: (id: string) => send('DELETE', `/api/sessions/${encodeURIComponent(id)}`).then((r) => json<{ ok: boolean }>(r)),

  // keepalive lets this finish while the tab is closing
  progress: async (
    id: string,
    p: {
      sessionId?: string;
      startedAt?: string;
      startPage?: number;
      day: string;
      seconds: number;
      page: number;
      totalPages: number;
    }
  ) => {
    const res = await fetch(`/api/books/${encodeURIComponent(id)}/progress`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(p),
      keepalive: true,
    });
    if (!res.ok) throw new Error('save failed');
  },
};
