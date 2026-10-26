export type Shelf = 'reading' | 'to-read' | 'read';
export type Genre = 'fiction' | 'history' | 'psychology' | 'science' | 'philosophy' | 'must_read' | 'other';

export interface Book {
  id: string;
  title: string;
  author: string;
  genre: Genre;
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
  coverId?: number | null;
  blobUrl?: string | null;
  createdAt: string;
  lastReadAt: string | null;
  dateRead: string | null;
}

export interface Session {
  id: string;
  bookId: string;
  bookTitle: string;
  day: string;
  startedAt: string;
  endedAt: string;
  seconds: number;
  startPage: number;
  endPage: number;
  source: 'reader' | 'manual';
}

export interface VocabularyEntry {
  id: string;
  word: string;
  bookId: string;
  bookTitle: string;
  page: number;
  createdAt: string;
}

export type BookResourceType = 'video-essay' | 'lecture' | 'audiobook' | 'research-paper';

export interface BookResource {
  id: string;
  bookId: string;
  type: BookResourceType;
  title: string;
  url: string | null;
  createdAt: string;
}

export const GENRES: Record<Genre, { name: string; color: string }> = {
  fiction: { name: 'Fiction', color: '#9A3412' },
  history: { name: 'History', color: '#854D0E' },
  psychology: { name: 'Psychology', color: '#0369A1' },
  science: { name: 'Science', color: '#047857' },
  philosophy: { name: 'Philosophy', color: '#4338CA' },
  must_read: { name: 'Classics', color: '#B45309' },
  other: { name: 'Other', color: '#78716C' },
};

export const SHELF_LABEL: Record<Shelf, string> = {
  reading: 'Reading',
  'to-read': 'To read',
  read: 'Finished',
};
