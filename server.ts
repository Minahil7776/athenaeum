import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import crypto from 'crypto';
import { del, head } from '@vercel/blob';
import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import { createDb, BookDoc, BookResourceDoc, BookResourceType, SessionDoc, Shelf, VocabularyDoc } from './db.js';

dotenv.config();

const PORT = Number(process.env.PORT) || 3000;
const isVercel = process.env.VERCEL === '1';
const isVercelDeployment = isVercel && ['production', 'preview'].includes(process.env.VERCEL_ENV ?? '');
const isProduction = isVercel || process.env.NODE_ENV === 'production' || process.argv.includes('--production');
const GENRES = ['fiction', 'history', 'psychology', 'science', 'philosophy', 'must_read', 'other'];
const SHELVES: Shelf[] = ['reading', 'to-read', 'read'];
const RESOURCE_TYPES: BookResourceType[] = ['video-essay', 'lecture', 'audiobook', 'research-paper'];
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_PDF_SIZE = 100 * 1024 * 1024;

interface PdfUploadMetadata {
  bookId: string;
  existingBook: boolean;
  fileName: string;
  pages: number;
  previousBlobUrl?: string | null;
}

const db = await createDb({ requireMongo: isProduction });
const app = express();
app.use(express.json());

const today = () => new Date().toISOString().slice(0, 10);
const int = (v: unknown, min: number, max: number, dflt = 0) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : dflt;
};
const str = (v: unknown, max = 300) => String(v ?? '').trim().slice(0, max);

/* Work out shelf/finished state after the page position changed */
function shelfAfterProgress(book: BookDoc, page: number, pages: number, day: string, allowComplete = false) {
  const set: Partial<BookDoc> = {};
  if (allowComplete && pages > 0 && page >= pages) {
    if (book.shelf !== 'read') {
      set.shelf = 'read';
      set.dateRead = day;
    }
  } else if (pages > 0 && page < pages && (book.shelf === 'to-read' || book.shelf === 'read')) {
    set.shelf = 'reading';
    set.dateRead = null;
  }
  return set;
}

app.get('/api/health', (_req, res) =>
  res.json({
    ok: true,
    storage: db.mode,
    vercel: isVercelDeployment,
    directPdfUploads: isVercelDeployment && Boolean(process.env.BLOB_READ_WRITE_TOKEN),
  })
);

/* ------------------------------- Books ------------------------------- */

app.get('/api/books', async (_req, res) => {
  res.json(await db.books.all());
});

app.post('/api/books', async (req, res) => {
  const title = str(req.body?.title);
  if (!title) return res.status(400).json({ error: 'Title is required.' });
  const rating = req.body?.rating == null || req.body.rating === '' ? null : Number(req.body.rating);
  if (rating !== null && (!Number.isFinite(rating) || rating < 0 || rating > 5)) {
    return res.status(400).json({ error: 'Rating must be between 0 and 5.' });
  }
  const year = req.body?.year == null || req.body.year === '' ? null : Number(req.body.year);
  if (year !== null && (!Number.isInteger(year) || year < 1 || year > 9999)) {
    return res.status(400).json({ error: 'Enter a valid publication year.' });
  }
  const book: BookDoc = {
    id: crypto.randomUUID(),
    title,
    author: str(req.body?.author),
    genre: GENRES.includes(req.body?.genre) ? req.body.genre : 'other',
    pages: 0,
    rating,
    year,
    shelf: 'to-read',
    currentPage: 0,
    totalSeconds: 0,
    notes: null,
    hasPdf: false,
    fileName: null,
    size: 0,
    coverId: Number.isSafeInteger(req.body?.coverId) && req.body.coverId > 0 ? req.body.coverId : null,
    blobUrl: null,
    createdAt: new Date().toISOString(),
    lastReadAt: null,
    dateRead: null,
  };
  await db.books.insert(book);
  res.json(book);
});

app.patch('/api/books/:id', async (req, res) => {
  const book = await db.books.get(req.params.id);
  if (!book) return res.status(404).json({ error: 'Not found.' });
  const set: Partial<BookDoc> = {};
  const b = req.body || {};
  if (b.title !== undefined) {
    const t = str(b.title);
    if (!t) return res.status(400).json({ error: 'Title is required.' });
    set.title = t;
  }
  if (b.author !== undefined) set.author = str(b.author);
  if (b.genre !== undefined && GENRES.includes(b.genre)) set.genre = b.genre;
  if (b.rating !== undefined) {
    const rating = b.rating === null || b.rating === '' ? null : Number(b.rating);
    if (rating !== null && (!Number.isFinite(rating) || rating < 0 || rating > 5)) {
      return res.status(400).json({ error: 'Rating must be between 0 and 5.' });
    }
    set.rating = rating;
  }
  if (b.year !== undefined) {
    const year = b.year === null || b.year === '' ? null : Number(b.year);
    if (year !== null && (!Number.isInteger(year) || year < 1 || year > 9999)) {
      return res.status(400).json({ error: 'Enter a valid publication year.' });
    }
    set.year = year;
  }
  if (b.coverId !== undefined) {
    if (b.coverId !== null && (!Number.isSafeInteger(b.coverId) || b.coverId < 1)) {
      return res.status(400).json({ error: 'Enter a valid book cover.' });
    }
    set.coverId = b.coverId;
  }
  if (b.shelf !== undefined && SHELVES.includes(b.shelf)) {
    set.shelf = b.shelf;
    if (b.shelf === 'read') {
      set.currentPage = (set.pages ?? book.pages) || book.currentPage;
      set.dateRead = book.dateRead || today();
    }
    if (b.shelf !== 'read') set.dateRead = null;
  }
  await db.books.update(book.id, { set });
  res.json({ ok: true });
});

app.delete('/api/books/:id', async (req, res) => {
  const book = await db.books.get(req.params.id);
  if (book?.blobUrl) await del(book.blobUrl);
  await db.books.remove(req.params.id);
  await db.sessions.removeWhere('bookId', req.params.id);
  await db.resources.removeWhere('bookId', req.params.id);
  await db.vocabulary.removeWhere('bookId', req.params.id);
  await db.removeFile(req.params.id);
  res.json({ ok: true });
});

/* ---------------------------- Book resources -------------------------- */

app.get('/api/resources', async (_req, res) => {
  const resources = await db.resources.all();
  resources.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  res.json(resources);
});

app.post('/api/books/:id/resources', async (req, res) => {
  const book = await db.books.get(req.params.id);
  if (!book) return res.status(404).json({ error: 'Book not found.' });
  const title = str(req.body?.title, 200);
  if (!title) return res.status(400).json({ error: 'Enter a name for this resource.' });
  if (!RESOURCE_TYPES.includes(req.body?.type)) {
    return res.status(400).json({ error: 'Choose a valid resource type.' });
  }

  const rawUrl = str(req.body?.url, 2000);
  let url: string | null = null;
  if (rawUrl) {
    try {
      const parsed = new URL(rawUrl);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') throw new Error();
      url = parsed.toString();
    } catch {
      return res.status(400).json({ error: 'Enter a valid link starting with http:// or https://.' });
    }
  }

  const resource: BookResourceDoc = {
    id: crypto.randomUUID(),
    bookId: book.id,
    type: req.body.type,
    title,
    url,
    createdAt: new Date().toISOString(),
  };
  await db.resources.insert(resource);
  res.json(resource);
});

app.delete('/api/resources/:id', async (req, res) => {
  await db.resources.remove(req.params.id);
  res.json({ ok: true });
});

/* ------------------------------ Vocabulary ---------------------------- */

app.get('/api/vocabulary', async (_req, res) => {
  const entries = await db.vocabulary.all();
  entries.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  res.json(entries);
});

app.post('/api/vocabulary', async (req, res) => {
  const word = str(req.body?.word, 120);
  if (!word) return res.status(400).json({ error: 'Enter a word or phrase.' });
  const bookId = str(req.body?.bookId, 100);
  const book = await db.books.get(bookId);
  if (!book) return res.status(400).json({ error: 'Choose a book for this vocabulary entry.' });
  const page = Number(req.body?.page);
  if (!Number.isInteger(page) || page < 1 || page > 100000 || (book.pages > 0 && page > book.pages)) {
    return res.status(400).json({ error: `Enter a page between 1 and ${book.pages || '100000'}.` });
  }
  const entry: VocabularyDoc = {
    id: crypto.randomUUID(),
    word,
    bookId: book.id,
    bookTitle: book.title,
    page,
    createdAt: new Date().toISOString(),
  };
  await db.vocabulary.insert(entry);
  res.json(entry);
});

app.delete('/api/vocabulary/:id', async (req, res) => {
  await db.vocabulary.remove(req.params.id);
  res.json({ ok: true });
});

/* ------------------------------ PDF files ----------------------------- */

function parsePdfUploadMetadata(payload: string | null): PdfUploadMetadata {
  if (!payload) throw new Error('Missing PDF upload metadata.');
  let value: unknown;
  try {
    value = JSON.parse(payload);
  } catch {
    throw new Error('Invalid PDF upload metadata.');
  }
  if (!value || typeof value !== 'object') throw new Error('Invalid PDF upload metadata.');
  const metadata = value as Record<string, unknown>;
  const bookId = str(metadata.bookId, 100);
  const fileName = str(metadata.fileName, 200).split(/[\\/]/).pop() || '';
  const pages = Number(metadata.pages);
  if (
    !bookId ||
    !fileName ||
    !/\.pdf$/i.test(fileName) ||
    !Number.isInteger(pages) ||
    pages < 1 ||
    pages > 100000 ||
    typeof metadata.existingBook !== 'boolean'
  ) {
    throw new Error('Invalid PDF upload details.');
  }
  return {
    bookId,
    existingBook: metadata.existingBook,
    fileName,
    pages,
    previousBlobUrl: typeof metadata.previousBlobUrl === 'string' ? metadata.previousBlobUrl : null,
  };
}

app.post('/api/upload', async (req, res, next) => {
  if (!req.is('application/json')) return next();
  if (!isVercelDeployment || !process.env.BLOB_READ_WRITE_TOKEN) {
    return res.status(503).json({ error: 'Direct PDF uploads are not configured.' });
  }
  try {
    const body: HandleUploadBody = req.body;
    const result = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        if (!/^pdfs\/[0-9a-f-]{36}\.pdf$/i.test(pathname)) {
          throw new Error('Invalid PDF upload path.');
        }
        const metadata = parsePdfUploadMetadata(clientPayload);
        const book = await db.books.get(metadata.bookId);
        if (metadata.existingBook && !book) throw new Error('Book not found.');
        if (!metadata.existingBook && book) throw new Error('Book already exists.');
        return {
          allowedContentTypes: ['application/pdf'],
          maximumSizeInBytes: MAX_PDF_SIZE,
          tokenPayload: JSON.stringify({ ...metadata, previousBlobUrl: book?.blobUrl ?? null }),
        };
      },
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        if (blob.contentType !== 'application/pdf' || !/^pdfs\/[0-9a-f-]{36}\.pdf$/i.test(blob.pathname)) {
          throw new Error('Uploaded file is not a PDF.');
        }
        const metadata = parsePdfUploadMetadata(tokenPayload ?? null);
        const blobMetadata = await head(blob.url);
        if (blobMetadata.size > MAX_PDF_SIZE) throw new Error('PDFs must be 100 MB or smaller.');
        let book = await db.books.get(metadata.bookId);
        if (metadata.existingBook) {
          if (!book) throw new Error('Book not found.');
          await db.books.update(book.id, {
            set: {
              hasPdf: true,
              pages: metadata.pages,
              fileName: metadata.fileName,
              size: blobMetadata.size,
              blobUrl: blob.url,
            },
          });
          await db.removeFile(book.id);
        } else if (!book) {
          const title = metadata.fileName.replace(/\.pdf$/i, '').replace(/[_]+/g, ' ').trim() || 'Untitled';
          book = {
            id: metadata.bookId,
            title,
            author: '',
            genre: 'other',
            pages: metadata.pages,
            rating: null,
            year: null,
            shelf: 'to-read',
            currentPage: 0,
            totalSeconds: 0,
            notes: null,
            hasPdf: true,
            fileName: metadata.fileName,
            size: blobMetadata.size,
            blobUrl: blob.url,
            createdAt: new Date().toISOString(),
            lastReadAt: null,
            dateRead: null,
          };
          await db.books.insert(book);
        } else if (book.blobUrl !== blob.url) {
          throw new Error('Book already exists.');
        }
        if (metadata.previousBlobUrl && metadata.previousBlobUrl !== blob.url) {
          await del(metadata.previousBlobUrl);
        }
      },
    });
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : 'Could not process the PDF upload.' });
  }
});

// Raw PDF body for local development. On Vercel, browser uploads use Blob directly.
app.post('/api/upload', express.raw({ type: 'application/pdf', limit: '300mb' }), async (req, res) => {
  if (isVercelDeployment) {
    return res.status(413).json({ error: 'Configure Vercel Blob to upload PDFs on Vercel.' });
  }
  const data = req.body as Buffer;
  if (!Buffer.isBuffer(data) || data.length < 5 || data.subarray(0, 5).toString() !== '%PDF-') {
    return res.status(400).json({ error: 'That file is not a valid PDF.' });
  }
  const fileName = str(req.query.name, 200) || 'document.pdf';
  const bookId = str(req.query.bookId, 100);
  let book: BookDoc | null = null;

  if (bookId) {
    book = await db.books.get(bookId);
    if (!book) return res.status(404).json({ error: 'Book not found.' });
    const pages = int(req.query.pages, 1, 100000, 0);
    if (!pages) return res.status(400).json({ error: 'Could not read the page count from this PDF.' });
    await db.putFile(book.id, data);
    await db.books.update(book.id, { set: { hasPdf: true, pages, fileName, size: data.length, blobUrl: null } });
    return res.json({ ...book, hasPdf: true, pages, fileName, size: data.length });
  }

  const pages = int(req.query.pages, 1, 100000, 0);
  if (!pages) return res.status(400).json({ error: 'Could not read the page count from this PDF.' });
  const title = fileName.replace(/\.pdf$/i, '').replace(/[_]+/g, ' ').trim() || 'Untitled';
  book = {
    id: crypto.randomUUID(),
    title,
    author: '',
    genre: 'other',
    pages,
    rating: null,
    year: null,
    shelf: 'to-read',
    currentPage: 0,
    totalSeconds: 0,
    notes: null,
    hasPdf: true,
    fileName,
    size: data.length,
    blobUrl: null,
    createdAt: new Date().toISOString(),
    lastReadAt: null,
    dateRead: null,
  };
  await db.putFile(book.id, data);
  await db.books.insert(book);
  res.json(book);
});

app.get('/api/books/:id/file', async (req, res) => {
  const book = await db.books.get(req.params.id);
  if (book?.hasPdf && book.blobUrl) return res.redirect(book.blobUrl);
  if (!book?.hasPdf) return res.status(404).end();

  const size = book.size;
  let range: { start: number; end: number } | undefined;
  if (size > 0) {
    const requested = req.range(size);
    if (requested === -1 || requested === -2 || (Array.isArray(requested) && requested.length !== 1)) {
      res.setHeader('Content-Range', `bytes */${size}`);
      return res.status(416).end();
    }
    if (Array.isArray(requested)) {
      range = { start: requested[0].start, end: requested[0].end };
    }
    res.setHeader('Accept-Ranges', 'bytes');
  }

  const stream = await db.openFile(req.params.id, range);
  if (!book || !stream) return res.status(404).end();
  res.setHeader('Content-Type', 'application/pdf');
  if (range) {
    res.status(206);
    res.setHeader('Content-Range', `bytes ${range.start}-${range.end}/${size}`);
    res.setHeader('Content-Length', String(range.end - range.start + 1));
  } else if (size > 0) {
    res.setHeader('Content-Length', String(size));
  }
  stream.on('error', () => res.end());
  stream.pipe(res);
});

/* ----------------------- Reading time (reader) ------------------------ */

// Sent every few seconds by the reader. `seconds` is the time since the last call.
app.post('/api/books/:id/progress', express.text({ type: 'text/*' }), async (req, res) => {
  let b: any = req.body;
  if (typeof b === 'string') {
    try {
      b = JSON.parse(b);
    } catch {
      b = {};
    }
  }
  b = b || {};
  const book = await db.books.get(req.params.id);
  if (!book) return res.status(404).json({ error: 'Not found.' });

  const seconds = int(b.seconds, 0, 3600);
  const totalPages = int(b.totalPages, 0, 100000);
  const pages = totalPages > 0 ? totalPages : book.pages;
  const page = int(b.page, 1, Math.max(1, pages || 100000), 1);
  const day = DAY_RE.test(b.day) ? b.day : today();
  const nowIso = new Date().toISOString();

  if (seconds > 0 && str(b.sessionId, 100)) {
    const sid = str(b.sessionId, 100);
    const existing = await db.sessions.get(sid);
    if (existing) {
      await db.sessions.update(sid, { inc: { seconds }, set: { endedAt: nowIso, endPage: page } });
    } else {
      const startedAt = !isNaN(Date.parse(b.startedAt)) ? new Date(b.startedAt).toISOString() : nowIso;
      const s: SessionDoc = {
        id: sid,
        bookId: book.id,
        bookTitle: book.title,
        day,
        startedAt,
        endedAt: nowIso,
        seconds,
        startPage: int(b.startPage, 1, 100000, page),
        endPage: page,
        source: 'reader',
      };
      await db.sessions.insert(s);
    }
  }

  await db.books.update(book.id, {
    inc: { totalSeconds: seconds },
    set: {
      currentPage: page,
      lastReadAt: nowIso,
      ...(totalPages > 0 ? { pages: totalPages } : {}),
      ...shelfAfterProgress(book, page, pages, day, seconds > 0),
    },
  });
  res.json({ ok: true });
});

/* ------------------------------ Sessions ------------------------------ */

app.get('/api/sessions', async (_req, res) => {
  const all = await db.sessions.all();
  all.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  res.json(all.slice(0, 5000));
});

// Manual entry (for hardcopy books or time read elsewhere)
app.post('/api/sessions', async (req, res) => {
  const b = req.body || {};
  const book = await db.books.get(str(b.bookId, 100));
  if (!book) return res.status(404).json({ error: 'Choose a book.' });
  const minutes = int(b.minutes, 1, 1440, 0);
  if (!minutes) return res.status(400).json({ error: 'Enter the minutes you read.' });
  if (isNaN(Date.parse(b.startedAt)) || !DAY_RE.test(b.day)) {
    return res.status(400).json({ error: 'Choose a valid date and time.' });
  }
  const start = new Date(b.startedAt);
  const pagesRead = int(b.pagesRead, 0, 100000, 0);
  const newPage = pagesRead > 0 ? Math.min(book.pages || 100000, book.currentPage + pagesRead) : book.currentPage;

  const s: SessionDoc = {
    id: crypto.randomUUID(),
    bookId: book.id,
    bookTitle: book.title,
    day: b.day,
    startedAt: start.toISOString(),
    endedAt: new Date(start.getTime() + minutes * 60000).toISOString(),
    seconds: minutes * 60,
    startPage: book.currentPage,
    endPage: newPage,
    source: 'manual',
  };
  await db.sessions.insert(s);
  await db.books.update(book.id, {
    inc: { totalSeconds: s.seconds },
    set: {
      currentPage: newPage,
      lastReadAt: s.endedAt,
      ...shelfAfterProgress(book, newPage, book.pages, b.day, true),
    },
  });
  res.json(s);
});

app.delete('/api/sessions/:id', async (req, res) => {
  const s = await db.sessions.get(req.params.id);
  if (s) {
    const book = await db.books.get(s.bookId);
    if (book) {
      await db.books.update(book.id, { set: { totalSeconds: Math.max(0, book.totalSeconds - s.seconds) } });
    }
    await db.sessions.remove(s.id);
  }
  res.json({ ok: true });
});

app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found.' }));

/* ------------------------------ Frontend ------------------------------ */

if (isProduction && !isVercel) {
  const dist = path.resolve(process.cwd(), 'dist');
  app.use(express.static(dist));
  app.get('*', (_req, res) => res.sendFile(path.join(dist, 'index.html')));
} else if (!isVercel) {
  const { createServer } = await import('vite');
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'spa' });
  app.use(vite.middlewares);
}

export default app;

if (!isVercel) {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Athenaeum running on http://localhost:${PORT} (storage: ${db.mode})`);
  });
}
