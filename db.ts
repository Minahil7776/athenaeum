import { MongoClient, GridFSBucket } from 'mongodb';
import { Readable } from 'stream';
import fs from 'fs';
import path from 'path';

export type Shelf = 'reading' | 'to-read' | 'read';

export interface BookDoc {
  id: string;
  title: string;
  author: string;
  genre: string;
  pages: number;
  rating: number | null;
  year: number | null;
  shelf: Shelf;
  currentPage: number;
  totalSeconds: number;
  notes: string | null;
  hasPdf: boolean;
  fileName: string | null;
  size: number;
  blobUrl?: string | null;
  createdAt: string;
  lastReadAt: string | null;
  dateRead: string | null;
}

export interface SessionDoc {
  id: string;
  bookId: string;
  bookTitle: string;
  day: string; // local date YYYY-MM-DD
  startedAt: string; // ISO timestamp
  endedAt: string; // ISO timestamp
  seconds: number;
  startPage: number;
  endPage: number;
  source: 'reader' | 'manual';
}

export interface VocabularyDoc {
  id: string;
  word: string;
  bookId: string;
  bookTitle: string;
  page: number;
  createdAt: string;
}

export type BookResourceType = 'video-essay' | 'lecture' | 'audiobook' | 'research-paper';

export interface BookResourceDoc {
  id: string;
  bookId: string;
  type: BookResourceType;
  title: string;
  url: string | null;
  createdAt: string;
}

export interface UpdateOp<T> {
  set?: Partial<T>;
  inc?: Partial<Record<keyof T, number>>;
}

export interface Col<T extends { id: string }> {
  all(): Promise<T[]>;
  get(id: string): Promise<T | null>;
  insert(doc: T): Promise<void>;
  update(id: string, op: UpdateOp<T>): Promise<void>;
  remove(id: string): Promise<void>;
  removeWhere(field: keyof T, value: unknown): Promise<void>;
  count(): Promise<number>;
}

export interface Db {
  mode: 'mongodb' | 'local';
  books: Col<BookDoc>;
  sessions: Col<SessionDoc>;
  vocabulary: Col<VocabularyDoc>;
  resources: Col<BookResourceDoc>;
  putFile(id: string, data: Buffer): Promise<void>;
  openFile(id: string): Promise<Readable | null>;
  removeFile(id: string): Promise<void>;
}

/* ------------------------------ MongoDB ------------------------------ */

function mongoCol<T extends { id: string }>(col: any): Col<T> {
  const fromDoc = (d: any): T => {
    const { _id, ...rest } = d;
    return { id: _id, ...rest } as T;
  };
  return {
    async all() {
      return (await col.find().toArray()).map(fromDoc);
    },
    async get(id) {
      const d = await col.findOne({ _id: id });
      return d ? fromDoc(d) : null;
    },
    async insert(doc) {
      const { id, ...rest } = doc as any;
      await col.insertOne({ _id: id, ...rest });
    },
    async update(id, op) {
      const q: any = {};
      if (op.set && Object.keys(op.set).length) q.$set = op.set;
      if (op.inc && Object.keys(op.inc).length) q.$inc = op.inc;
      if (Object.keys(q).length) await col.updateOne({ _id: id }, q);
    },
    async remove(id) {
      await col.deleteOne({ _id: id });
    },
    async removeWhere(field, value) {
      await col.deleteMany({ [field as string]: value });
    },
    async count() {
      return col.countDocuments();
    },
  };
}

async function createMongoDb(uri: string, dbName: string): Promise<Db> {
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 8000 });
  await client.connect();
  const mdb = client.db(dbName);
  const bucket = new GridFSBucket(mdb, { bucketName: 'pdfs' });
  const sessions = mdb.collection('sessions');
  await sessions.createIndex({ startedAt: -1 });
  await sessions.createIndex({ bookId: 1 });
  const vocabulary = mdb.collection('vocabulary');
  await vocabulary.createIndex({ createdAt: -1 });
  const resources = mdb.collection('resources');
  await resources.createIndex({ bookId: 1, createdAt: -1 });

  const removeFile = async (id: string) => {
    const files = await bucket.find({ filename: id }).toArray();
    for (const f of files) await bucket.delete(f._id).catch(() => {});
  };

  return {
    mode: 'mongodb',
    books: mongoCol<BookDoc>(mdb.collection('books')),
    sessions: mongoCol<SessionDoc>(sessions),
    vocabulary: mongoCol<VocabularyDoc>(vocabulary),
    resources: mongoCol<BookResourceDoc>(resources),
    async putFile(id, data) {
      await removeFile(id);
      await new Promise<void>((resolve, reject) => {
        const up = bucket.openUploadStream(id);
        up.on('error', reject);
        up.on('finish', () => resolve());
        up.end(data);
      });
    },
    async openFile(id) {
      const files = await bucket.find({ filename: id }).limit(1).toArray();
      return files.length ? bucket.openDownloadStreamByName(id) : null;
    },
    removeFile,
  };
}

/* --------------------- Local fallback (no MongoDB) --------------------- */

function createLocalDb(): Db {
  const dir = path.resolve(process.cwd(), 'data');
  const filesDir = path.join(dir, 'files');
  const dbFile = path.join(dir, 'db.json');
  fs.mkdirSync(filesDir, { recursive: true });

  let data: { books: BookDoc[]; sessions: SessionDoc[]; vocabulary: VocabularyDoc[]; resources: BookResourceDoc[] } = {
    books: [],
    sessions: [],
    vocabulary: [],
    resources: [],
  };
  if (fs.existsSync(dbFile)) {
    try {
      data = JSON.parse(fs.readFileSync(dbFile, 'utf8'));
      data.vocabulary ||= [];
      data.resources ||= [];
    } catch {
      console.error('Could not read data/db.json, starting empty.');
    }
  }
  const save = () => {
    const tmp = dbFile + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(data));
    fs.renameSync(tmp, dbFile);
  };

  const col = <T extends { id: string }>(key: 'books' | 'sessions' | 'vocabulary' | 'resources'): Col<T> => {
    const arr = () => data[key] as unknown as T[];
    return {
      async all() {
        return arr();
      },
      async get(id) {
        return arr().find((d) => d.id === id) || null;
      },
      async insert(doc) {
        arr().push(doc);
        save();
      },
      async update(id, op) {
        const d: any = arr().find((x) => x.id === id);
        if (!d) return;
        if (op.set) Object.assign(d, op.set);
        if (op.inc) for (const [k, v] of Object.entries(op.inc)) d[k] = (d[k] || 0) + (v as number);
        save();
      },
      async remove(id) {
        (data as any)[key] = arr().filter((d) => d.id !== id);
        save();
      },
      async removeWhere(field, value) {
        (data as any)[key] = arr().filter((d: any) => d[field as string] !== value);
        save();
      },
      async count() {
        return arr().length;
      },
    };
  };

  const filePath = (id: string) => path.join(filesDir, encodeURIComponent(id) + '.pdf');
  return {
    mode: 'local',
    books: col<BookDoc>('books'),
    sessions: col<SessionDoc>('sessions'),
    vocabulary: col<VocabularyDoc>('vocabulary'),
    resources: col<BookResourceDoc>('resources'),
    async putFile(id, buf) {
      fs.writeFileSync(filePath(id), buf);
    },
    async openFile(id) {
      const f = filePath(id);
      return fs.existsSync(f) ? fs.createReadStream(f) : null;
    },
    async removeFile(id) {
      fs.rmSync(filePath(id), { force: true });
    },
  };
}

async function normalizeBookData(db: Db) {
  const [books, sessions] = await Promise.all([db.books.all(), db.sessions.all()]);
  const booksWithSessions = new Set(sessions.map((session) => session.bookId));
  const secondsByBook = new Map<string, number>();
  for (const session of sessions) {
    secondsByBook.set(session.bookId, (secondsByBook.get(session.bookId) || 0) + Math.max(0, session.seconds));
  }

  for (const book of books) {
    const hasActivity = Boolean(book.lastReadAt || book.dateRead) || booksWithSessions.has(book.id);
    const set: Partial<BookDoc> = {};
    const totalSeconds = secondsByBook.get(book.id) || 0;
    if (book.totalSeconds !== totalSeconds) set.totalSeconds = totalSeconds;

    if (!book.hasPdf && (book.pages !== 0 || book.currentPage !== 0)) {
      set.pages = 0;
      set.currentPage = 0;
    }
    if (!hasActivity) {
      if (book.currentPage !== 0) set.currentPage = 0;
      if (book.shelf !== 'to-read') set.shelf = 'to-read';
      if (book.dateRead !== null) set.dateRead = null;
    }
    if (book.hasPdf && book.pages > 0 && book.currentPage < book.pages && book.shelf === 'read') {
      set.shelf = 'reading';
      set.dateRead = null;
    }

    if (Object.keys(set).length) await db.books.update(book.id, { set });
  }
}

export async function createDb(options: { requireMongo?: boolean } = {}): Promise<Db> {
  const uri = process.env.MONGODB_URI?.trim();
  let db: Db | null = null;
  if (options.requireMongo && !uri) {
    throw new Error('MONGODB_URI is required in production to use persistent storage.');
  }
  if (uri) {
    try {
      db = await createMongoDb(uri, process.env.MONGODB_DB || 'athenaeum');
      console.log('Connected to MongoDB');
    } catch (e) {
      console.error('MongoDB connection failed:', (e as Error).message);
      if (options.requireMongo) throw e;
    }
  } else {
    console.log('MONGODB_URI not set, using local storage in ./data');
  }
  if (!db) db = createLocalDb();
  await normalizeBookData(db);
  return db;
}
