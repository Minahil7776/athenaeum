import { type CSSProperties, type MouseEvent, memo, useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, Bookmark, BookmarkCheck, BookMarked, BookOpen, BookPlus, ChevronLeft, ChevronRight, Eraser, Hand, Highlighter, Minus, Moon, Plus, Pause, Play, Sun, Trash2, X } from 'lucide-react';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import workerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';
import { api } from '../api';
import { Book, VocabularyEntry } from '../types';
import { formatClock, formatDuration, localDay, newId } from '../lib/stats';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

const FLUSH_EVERY_SECONDS = 10;
const IDLE_LIMIT_SECONDS = 120;

interface LiveSession {
  id: string;
  day: string;
  startedAt: string;
  startPage: number;
}

interface PageBookmark {
  id: string;
  page: number;
  createdAt: string;
  text?: string;
  rects?: { left: number; top: number; width: number; height: number }[];
}

type FitMode = 'page' | 'width' | 'custom';
type HighlightColor = 'yellow' | 'green' | 'blue' | 'pink';

interface SavedHighlight {
  id: string;
  page: number;
  text: string;
  color: HighlightColor;
  rects: { left: number; top: number; width: number; height: number }[];
}

interface OutlineItem {
  title: string;
  dest: string | Array<unknown> | null;
  items: OutlineItem[];
}

const HIGHLIGHT_COLORS: { color: HighlightColor; label: string; value: string }[] = [
  { color: 'yellow', label: 'Yellow', value: '#fde047' },
  { color: 'green', label: 'Green', value: '#86efac' },
  { color: 'blue', label: 'Blue', value: '#93c5fd' },
  { color: 'pink', label: 'Pink', value: '#f9a8d4' },
];

function getSelectionRects(selection: Selection, pageElement: HTMLElement) {
  const bounds = pageElement.getBoundingClientRect();
  if (!bounds.width || !bounds.height) return [];
  return Array.from(selection.getRangeAt(0).getClientRects())
    .filter((rect) => rect.width > 0 && rect.height > 0 &&
      rect.right > bounds.left && rect.left < bounds.right &&
      rect.bottom > bounds.top && rect.top < bounds.bottom)
    .map((rect) => {
      const left = Math.max(rect.left, bounds.left);
      const top = Math.max(rect.top, bounds.top);
      const right = Math.min(rect.right, bounds.right);
      const bottom = Math.min(rect.bottom, bounds.bottom);
      return {
        left: (left - bounds.left) / bounds.width,
        top: (top - bounds.top) / bounds.height,
        width: (right - left) / bounds.width,
        height: (bottom - top) / bounds.height,
      };
    });
}

const PdfPage = memo(function PdfPage({
  doc,
  page,
  viewport,
  fitMode,
  customFit,
  zoom,
  nightMode,
  panMode,
  isPanning,
  highlights,
  scrollRoot,
  onContextMenu,
  onRenderError,
}: {
  doc: pdfjs.PDFDocumentProxy;
  page: number;
  viewport: { width: number; height: number };
  fitMode: FitMode;
  customFit: 'page' | 'width';
  zoom: number;
  nightMode: boolean;
  panMode: boolean;
  isPanning: boolean;
  highlights: SavedHighlight[];
  scrollRoot: React.RefObject<HTMLDivElement | null>;
  onContextMenu: (event: MouseEvent<HTMLDivElement>, page: number) => void;
  onRenderError: (error: Error) => void;
}) {
  const frameRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textLayerRef = useRef<HTMLDivElement>(null);
  const [frame, setFrame] = useState<{ width: number; height: number; scale: number } | null>(null);

  useEffect(() => {
    const frameElement = frameRef.current;
    if (!frameElement) return;
    let cancelled = false;
    let renderTask: pdfjs.RenderTask | null = null;
    let textLayer: pdfjs.TextLayer | null = null;
    let rendering = false;
    let visible = false;
    let pdfPage: pdfjs.PDFPageProxy | null = null;

    const renderPage = async () => {
      if (!visible || rendering || cancelled) return;
      const canvas = canvasRef.current;
      const textContainer = textLayerRef.current;
      if (!canvas || !textContainer) return;
      rendering = true;
      try {
        pdfPage ||= await doc.getPage(page);
        if (cancelled || !visible) return;
        const base = pdfPage.getViewport({ scale: 1 });
        const availableWidth = Math.max(1, viewport.width - 32);
        const availableHeight = Math.max(1, viewport.height - 32);
        const widthScale = availableWidth / base.width;
        const fitScale = Math.min(widthScale, availableHeight / base.height);
        const scale = fitMode === 'width'
          ? widthScale
          : fitMode === 'custom'
            ? (customFit === 'width' ? widthScale : fitScale) * zoom
            : fitScale;
        const pageViewport = pdfPage.getViewport({ scale });
        setFrame({ width: pageViewport.width, height: pageViewport.height, scale });
        const dpr = window.devicePixelRatio || 1;
        canvas.width = Math.floor(pageViewport.width * dpr);
        canvas.height = Math.floor(pageViewport.height * dpr);
        canvas.style.width = `${Math.floor(pageViewport.width)}px`;
        canvas.style.height = `${Math.floor(pageViewport.height)}px`;
        renderTask = pdfPage.render({
          canvas,
          canvasContext: canvas.getContext('2d')!,
          viewport: pageViewport,
          transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined,
        });
        await renderTask.promise;
        if (cancelled) return;
        textContainer.replaceChildren();
        const textContent = await pdfPage.getTextContent();
        if (cancelled) return;
        textLayer = new pdfjs.TextLayer({ textContentSource: textContent, container: textContainer, viewport: pageViewport });
        await textLayer.render();
      } catch (error) {
        if (!cancelled && (error as Error).name !== 'RenderingCancelledException') onRenderError(error as Error);
      } finally {
        rendering = false;
      }
    };

    const observer = new IntersectionObserver((entries) => {
      visible = entries.some((entry) => entry.isIntersecting);
      if (visible) void renderPage();
    }, { root: scrollRoot.current, rootMargin: '700px 0px', threshold: 0 });

    observer.observe(frameElement);

    return () => {
      cancelled = true;
      observer.disconnect();
      renderTask?.cancel();
      textLayer?.cancel();
    };

  }, [doc, page, viewport, fitMode, customFit, zoom, scrollRoot, onRenderError]);

  const frameStyle: CSSProperties & { '--total-scale-factor': number } = {
    width: frame?.width || Math.max(1, viewport.width - 32),
    height: frame?.height || Math.max(1, Math.min(viewport.height - 32, (viewport.width - 32) * 1.3)),
    '--total-scale-factor': frame?.scale || 1,
  };

  return (
    <div
      ref={frameRef}
      data-pdf-page={page}
      className={`pdf-page-frame relative mx-auto shrink-0 overflow-hidden shadow-sm ${panMode ? (isPanning ? 'cursor-grabbing' : 'cursor-grab') : ''} ${nightMode ? 'bg-stone-800 border border-stone-600' : 'bg-white border border-stone-200'}`}
      style={frameStyle}
      onContextMenu={(event) => onContextMenu(event, page)}
    >
      <canvas ref={canvasRef} className={`absolute inset-0 block ${nightMode ? 'pdf-night-page' : ''}`} />
      {highlights.map((highlight) => (
        <div key={highlight.id} className="pointer-events-none absolute inset-0 z-[1]" aria-label={`${highlight.color} highlight: ${highlight.text}`}>
          {highlight.rects.map((rect, index) => (
            <span
              key={index}
              className={`pdf-highlight pdf-highlight-${highlight.color}`}
              style={{
                left: `${rect.left * 100}%`,
                top: `${rect.top * 100}%`,
                width: `${rect.width * 100}%`,
                height: `${rect.height * 100}%`,
              }}
            />
          ))}
        </div>
      ))}
      <div ref={textLayerRef} className={`pdf-text-layer ${panMode ? 'pointer-events-none' : ''}`} />
    </div>
  );
});

export function Reader({
  book,
  onClose,
  onVocabularyAdded,
}: {
  book: Book;
  onClose: () => void;
  onVocabularyAdded: () => Promise<void>;
}) {
  const startPage = book.lastReadAt ? Math.max(1, book.currentPage || 1) : 1;

  const [doc, setDoc] = useState<pdfjs.PDFDocumentProxy | null>(null);
  const [page, setPage] = useState(startPage);
  const [pageInput, setPageInput] = useState(String(startPage));
  const [numPages, setNumPages] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [fitMode, setFitMode] = useState<FitMode>('page');
  const [customFit, setCustomFit] = useState<'page' | 'width'>('page');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const [sessionSeconds, setSessionSeconds] = useState(0);
  const [paused, setPaused] = useState(false);
  const [idle, setIdle] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const [selectionMenu, setSelectionMenu] = useState<{
    word: string;
    page: number;
    highlightIds: string[];
    x: number;
    y: number;
    position: { left: number; top: number };
    error?: string;
  } | null>(null);
  const [highlights, setHighlights] = useState<SavedHighlight[]>([]);
  const [nightMode, setNightMode] = useState(false);
  const [panMode, setPanMode] = useState(false);
  const [isPanning, setIsPanning] = useState(false);
  const [outline, setOutline] = useState<OutlineItem[]>([]);
  const [outlineError, setOutlineError] = useState('');
  const [bookmarks, setBookmarks] = useState<PageBookmark[]>([]);
  const [showOutline, setShowOutline] = useState(false);
  const [showHighlights, setShowHighlights] = useState(false);
  const [showVocabulary, setShowVocabulary] = useState(false);
  const [showBookmarks, setShowBookmarks] = useState(false);
  const [vocabulary, setVocabulary] = useState<VocabularyEntry[]>([]);
  const [vocabularyError, setVocabularyError] = useState('');
  const [vocabularyLoading, setVocabularyLoading] = useState(false);
  const [highlightError, setHighlightError] = useState('');

  const wrapRef = useRef<HTMLDivElement>(null);
  const [viewport, setViewport] = useState({ width: 800, height: 600 });
  const panStartRef = useRef<{ x: number; y: number; left: number; top: number } | null>(null);

  // Refs let timer callbacks always read the latest values
  const pageRef = useRef(page);
  const numPagesRef = useRef(0);
  const pausedRef = useRef(false);
  const idleSecondsRef = useRef(0);
  const unsavedRef = useRef(0);
  const sentPageRef = useRef(0);
  const liveRef = useRef<LiveSession | null>(null);
  const loadedRef = useRef(false);
  pageRef.current = page;
  numPagesRef.current = numPages;
  pausedRef.current = paused;

  useEffect(() => {
    try {
      const saved = localStorage.getItem(`athenaeum:highlights:${book.id}`);
      setHighlights(saved ? JSON.parse(saved) as SavedHighlight[] : []);
      setHighlightError('');
    } catch {
      setHighlights([]);
      setHighlightError('Could not load saved highlights from this browser.');
    }
  }, [book.id]);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(`athenaeum:bookmarks:${book.id}`);
      const parsed: unknown = saved ? JSON.parse(saved) : [];
      setBookmarks(Array.isArray(parsed) ? parsed.filter((entry): entry is PageBookmark =>
        typeof entry === 'object' && entry !== null &&
        'id' in entry && typeof entry.id === 'string' &&
        'page' in entry && typeof entry.page === 'number' && Number.isInteger(entry.page) && entry.page > 0 &&
        'createdAt' in entry && typeof entry.createdAt === 'string'
      ) : []);
    } catch {
      setBookmarks([]);
    }
  }, [book.id]);

  /* Send accumulated seconds (and the current page) to the server */
  const flush = useCallback(async () => {
    if (!loadedRef.current) return; // never overwrite progress before the PDF has opened
    const secs = unsavedRef.current;
    if (secs === 0 && sentPageRef.current === pageRef.current) return;
    unsavedRef.current = 0;
    sentPageRef.current = pageRef.current;
    const live = liveRef.current;
    try {
      await api.progress(book.id, {
        sessionId: secs > 0 ? live?.id : undefined,
        startedAt: live?.startedAt,
        startPage: live?.startPage,
        day: live?.day || localDay(),
        seconds: secs,
        page: pageRef.current,
        totalPages: numPagesRef.current,
      });
      setSaveFailed(false);
    } catch {
      unsavedRef.current += secs; // keep it and retry on the next flush
      sentPageRef.current = 0;
      setSaveFailed(true);
    }
  }, [book.id]);

  /* Load the PDF */
  useEffect(() => {
    let cancelled = false;
    const task = pdfjs.getDocument({ url: api.fileUrl(book.id) });
    task.promise
      .then((d) => {
        if (cancelled) return;
        loadedRef.current = true;
        const p = Math.min(Math.max(1, startPage), d.numPages);
        setDoc(d);
        setNumPages(d.numPages);
        numPagesRef.current = d.numPages;
        sentPageRef.current = p; // opening alone does not rewrite the saved page
        setPage(p);
        setPageInput(String(p));
        setLoading(false);
        d.getOutline().then((items) => {
          if (!cancelled) {
            setOutline(items as OutlineItem[] || []);
            setOutlineError('');
          }
        }).catch(() => {
          if (!cancelled) setOutlineError('Could not load this PDF table of contents.');
        });
      })
      .catch((e) => {
        if (!cancelled) {
          setError('Could not open this PDF. ' + (e?.message || ''));
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
      task.destroy();
    };
  }, [book.id, startPage]);

  const saveHighlights = (next: SavedHighlight[]) => {
    try {
      localStorage.setItem(`athenaeum:highlights:${book.id}`, JSON.stringify(next));
      setHighlights(next);
      setHighlightError('');
    } catch {
      setHighlightError('Could not save highlights in this browser.');
    }
  };

  const saveBookmarks = (next: PageBookmark[]) => {
    try {
      localStorage.setItem(`athenaeum:bookmarks:${book.id}`, JSON.stringify(next));
      setBookmarks(next);
      setOutlineError('');
    } catch {
      setOutlineError('Could not save bookmarks in this browser.');
    }
  };

  const reportRenderError = useCallback((renderError: Error) => {
    setError(`Could not render this PDF page. ${renderError.message || ''}`);
  }, []);

  /* Fit to the available width */
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const update = () => setViewport({ width: el.clientWidth, height: el.clientHeight });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    update();
    return () => ro.disconnect();
  }, []);

  const addSelectionToVocabulary = async () => {
    if (!selectionMenu) return;
    const word = selectionMenu.word;
    try {
      const entry = await api.addVocabulary({ word, bookId: book.id, page: selectionMenu.page });
      setVocabulary((entries) => [entry, ...entries.filter((saved) => saved.id !== entry.id)]);
      window.getSelection()?.removeAllRanges();
      setSelectionMenu(null);
      await onVocabularyAdded();
    } catch (e) {
      setSelectionMenu((menu) => menu ? { ...menu, error: (e as Error).message } : null);
    }
  };

  const addHighlight = (color: HighlightColor) => {
    const selection = window.getSelection();
    const selectedPage = selectionMenu?.page;
    const pageElement = selectedPage
      ? wrapRef.current?.querySelector<HTMLElement>(`[data-pdf-page="${selectedPage}"]`)
      : null;
    if (!selection || selection.isCollapsed || !pageElement) return;
    const rects = getSelectionRects(selection, pageElement);
    if (!rects.length) return;
    saveHighlights([...highlights, {
      id: newId(),
      page: selectedPage!,
      text: selection.toString().replace(/\s+/g, ' ').trim(),
      color,
      rects,
    }]);
    selection.removeAllRanges();
    setSelectionMenu(null);
  };

  const removeHighlight = (id: string) => {
    saveHighlights(highlights.filter((highlight) => highlight.id !== id));
  };

  const removeSelectedHighlights = () => {
    if (!selectionMenu) return;
    const ids = new Set(selectionMenu.highlightIds);
    saveHighlights(highlights.filter((highlight) => !ids.has(highlight.id)));
    setSelectionMenu(null);
    window.getSelection()?.removeAllRanges();
  };

  const addSelectionBookmark = () => {
    if (!selectionMenu) return;
    const selection = window.getSelection();
    const pageElement = wrapRef.current?.querySelector<HTMLElement>(`[data-pdf-page="${selectionMenu.page}"]`);
    if (!pageElement) return;
    const hasSelection = !!selection && !selection.isCollapsed && !!selectionMenu.word;
    const rects = hasSelection ? getSelectionRects(selection!, pageElement) : [{
      ...selectionMenu.position,
      width: 0.001,
      height: 0.001,
    }];
    if (!rects.length) {
      setOutlineError('Could not place a bookmark on this selection.');
      return;
    }
    const text = hasSelection ? selection!.toString().replace(/\s+/g, ' ').trim().slice(0, 2000) : '';
    saveBookmarks([
      ...bookmarks,
      { id: newId(), page: selectionMenu.page, text, rects, createdAt: new Date().toISOString() },
    ]);
    setShowBookmarks(true);
    setShowOutline(false);
    setShowHighlights(false);
    setShowVocabulary(false);
    setSelectionMenu(null);
    if (selection && !selection.isCollapsed) selection.removeAllRanges();
  };

  const showSelectionMenu = (event: MouseEvent<HTMLDivElement>, selectedPage: number) => {
    const selection = window.getSelection();
    const word = selection?.toString().replace(/\s+/g, ' ').trim() || '';
    const pageElement = wrapRef.current?.querySelector<HTMLElement>(`[data-pdf-page="${selectedPage}"]`);
    const textLayer = pageElement?.querySelector('.pdf-text-layer');
    if (!pageElement) {
      setSelectionMenu(null);
      return;
    }
    const hasTextSelection = !!selection && !selection.isCollapsed && !!word &&
      !!textLayer?.contains(selection.anchorNode);
    const selectedWord = hasTextSelection ? word : '';
    const selectedRects = hasTextSelection ? Array.from(selection!.getRangeAt(0).getClientRects()) : [];
    event.preventDefault();
    const pageBounds = pageElement.getBoundingClientRect();
    const highlightIds = selectedRects.length ? highlights
      .filter((highlight) => highlight.page === selectedPage && highlight.rects.some((savedRect) => {
        const saved = {
          left: pageBounds.left + savedRect.left * pageBounds.width,
          right: pageBounds.left + (savedRect.left + savedRect.width) * pageBounds.width,
          top: pageBounds.top + savedRect.top * pageBounds.height,
          bottom: pageBounds.top + (savedRect.top + savedRect.height) * pageBounds.height,
        };
        return selectedRects.some((rect) =>
          rect.left < saved.right && rect.right > saved.left &&
          rect.top < saved.bottom && rect.bottom > saved.top
        );
      }))
      .map((highlight) => highlight.id) : [];
    const pointerX = Number.isFinite(event.clientX) ? event.clientX : 8;
    const pointerY = Number.isFinite(event.clientY) ? event.clientY : 8;
    setSelectionMenu({
      word: selectedWord.slice(0, 2000),
      page: selectedPage,
      highlightIds,
      x: Math.max(8, Math.min(pointerX, window.innerWidth - 256)),
      y: Math.max(8, Math.min(pointerY, window.innerHeight - (selectedWord ? 330 : 120))),
      position: {
        left: Math.min(1, Math.max(0, (pointerX - pageBounds.left) / pageBounds.width)),
        top: Math.min(1, Math.max(0, (pointerY - pageBounds.top) / pageBounds.height)),
      },
    });
  };

  const openVocabulary = async () => {
    setShowVocabulary((visible) => !visible);
    setShowOutline(false);
    setShowHighlights(false);
    setShowBookmarks(false);
    if (showVocabulary) return;
    setVocabularyLoading(true);
    setVocabularyError('');
    try {
      setVocabulary((await api.vocabulary()).filter((entry) => entry.bookId === book.id));
    } catch (e) {
      setVocabularyError((e as Error).message);
    } finally {
      setVocabularyLoading(false);
    }
  };

  const removeVocabularyEntry = async (entry: VocabularyEntry) => {
    setVocabularyError('');
    try {
      await api.deleteVocabulary(entry.id);
      setVocabulary((entries) => entries.filter((saved) => saved.id !== entry.id));
      await onVocabularyAdded();
    } catch (e) {
      setVocabularyError((e as Error).message);
    }
  };

  const goTo = useCallback((n: number) => {
    const max = numPagesRef.current || 1;
    const next = Math.min(Math.max(1, n), max);
    pageRef.current = next;
    setPage(next);
    setPageInput(String(next));
    setSelectionMenu(null);
    requestAnimationFrame(() => {
      wrapRef.current?.querySelector<HTMLElement>(`[data-pdf-page="${next}"]`)?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    });
  }, []);

  const goToBookmarkedPage = (bookmark: PageBookmark) => {
    const targetTop = bookmark.rects?.[0]?.top;
    pageRef.current = bookmark.page;
    setPage(bookmark.page);
    setPageInput(String(bookmark.page));
    setShowBookmarks(false);
    requestAnimationFrame(() => {
      const container = wrapRef.current;
      const pageElement = container?.querySelector<HTMLElement>(`[data-pdf-page="${bookmark.page}"]`);
      if (!container || !pageElement || targetTop == null) {
        goTo(bookmark.page);
        return;
      }
      const containerBounds = container.getBoundingClientRect();
      const pageBounds = pageElement.getBoundingClientRect();
      container.scrollTo({
        top: container.scrollTop + pageBounds.top - containerBounds.top + pageBounds.height * targetTop - 80,
        behavior: 'smooth',
      });
    });
  };

  const updateCurrentPage = () => {
    const container = wrapRef.current;
    if (!container) return;
    const bounds = container.getBoundingClientRect();
    const visiblePage = document.elementFromPoint(
      bounds.left + bounds.width / 2,
      bounds.top + container.clientHeight / 2
    )?.closest<HTMLElement>('[data-pdf-page]');
    const current = visiblePage ? Number(visiblePage.dataset.pdfPage) : pageRef.current;
    if (current !== pageRef.current) {
      pageRef.current = current;
      setPage(current);
      setPageInput(String(current));
    }
  };

  useEffect(() => {
    if (!doc) return;
    requestAnimationFrame(() => {
      wrapRef.current?.querySelector<HTMLElement>(`[data-pdf-page="${page}"]`)?.scrollIntoView({ block: 'start' });
    });
  }, [doc]);

  const goToOutlineItem = async (item: OutlineItem) => {
    if (!doc || !item.dest) return;
    try {
      const destination = typeof item.dest === 'string' ? await doc.getDestination(item.dest) : item.dest;
      if (!destination?.[0]) throw new Error('This contents entry has no page destination.');
      const pageIndex = typeof destination[0] === 'number'
        ? destination[0]
        : await doc.getPageIndex(destination[0] as Parameters<typeof doc.getPageIndex>[0]);
      goTo(pageIndex + 1);
      setShowOutline(false);
      setOutlineError('');
    } catch (e) {
      setOutlineError(`Could not open this contents entry. ${(e as Error).message}`);
    }
  };

  const renderOutline = (items: OutlineItem[], depth = 0) => items.map((item, index) => (
    <div key={`${depth}-${index}-${item.title}`}>
      <button
        type="button"
        onClick={() => void goToOutlineItem(item)}
        className="block w-full truncate rounded px-2 py-1.5 text-left text-sm hover:bg-stone-100"
        style={{ paddingLeft: `${8 + depth * 14}px` }}
      >
        {item.title || 'Untitled section'}
      </button>
      {item.items?.length > 0 && renderOutline(item.items, depth + 1)}
    </div>
  ));

  const handlePanPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!panMode || event.button !== 0 || !wrapRef.current) return;
    setIsPanning(true);
    panStartRef.current = {
      x: event.clientX,
      y: event.clientY,
      left: wrapRef.current.scrollLeft,
      top: wrapRef.current.scrollTop,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePanPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const start = panStartRef.current;
    if (!panMode || !start || !wrapRef.current) return;
    wrapRef.current.scrollLeft = start.left - (event.clientX - start.x);
    wrapRef.current.scrollTop = start.top - (event.clientY - start.y);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
      if (e.key === 'ArrowRight' || e.key === 'PageDown') goTo(pageRef.current + 1);
      if (e.key === 'ArrowLeft' || e.key === 'PageUp') goTo(pageRef.current - 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [goTo]);

  /* Timer: counts only while the page is open, visible, active and not paused */
  useEffect(() => {
    const resetIdle = () => {
      idleSecondsRef.current = 0;
      setIdle(false);
    };
    const events = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart', 'wheel'];
    events.forEach((ev) => window.addEventListener(ev, resetIdle, { passive: true }));

    const tick = setInterval(() => {
      if (!loadedRef.current || pausedRef.current || document.hidden) return;
      idleSecondsRef.current += 1;
      if (idleSecondsRef.current > IDLE_LIMIT_SECONDS) {
        setIdle(true);
        return;
      }
      const today = localDay();
      // A new session starts on the first counted second, and again after midnight
      if (!liveRef.current || liveRef.current.day !== today) {
        if (liveRef.current && unsavedRef.current > 0) flush();
        liveRef.current = {
          id: newId(),
          day: today,
          startedAt: new Date(Date.now() - 1000).toISOString(),
          startPage: pageRef.current,
        };
      }
      unsavedRef.current += 1;
      setSessionSeconds((s) => s + 1);
      if (unsavedRef.current >= FLUSH_EVERY_SECONDS) flush();
    }, 1000);

    const onVisibility = () => {
      if (document.hidden) flush();
    };
    const onLeave = () => {
      flush();
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', onLeave);
    window.addEventListener('beforeunload', onLeave);

    return () => {
      clearInterval(tick);
      events.forEach((ev) => window.removeEventListener(ev, resetIdle));
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', onLeave);
      window.removeEventListener('beforeunload', onLeave);
      flush();
    };
  }, [flush]);

  // Save the position shortly after the page changes
  useEffect(() => {
    if (!loading) {
      const t = setTimeout(flush, 1500);
      return () => clearTimeout(t);
    }
  }, [page, loading, flush]);

  const close = async () => {
    await flush();
    onClose();
  };

  const status = paused ? 'Paused' : idle ? 'Idle, timer paused' : 'Reading';

  return (
    <div className={`h-screen flex flex-col ${nightMode ? 'bg-stone-900 text-stone-100' : 'bg-stone-100 text-stone-900'}`}>
      <header className={`flex items-center gap-3 px-4 h-14 border-b shrink-0 ${nightMode ? 'bg-stone-950 border-stone-700' : 'bg-[#FBF9F5] border-stone-200'}`}>
        <button onClick={close} className="inline-flex items-center gap-1.5 text-sm text-stone-600 hover:text-stone-900">
          <ArrowLeft className="w-4 h-4" />
          <span className="hidden sm:inline">Library</span>
        </button>

        <div className="flex-1 min-w-0 text-center">
          <div className="font-serif font-semibold text-sm truncate">{book.title}</div>
          {book.author && <div className={`text-[11px] truncate ${nightMode ? 'text-stone-400' : 'text-stone-500'}`}>{book.author}</div>}
        </div>

        <div className="flex items-center gap-1 text-sm tabular-nums">
          <button
            onClick={() => {
              setShowOutline((shown) => !shown);
              setShowHighlights(false);
              setShowVocabulary(false);
              setShowBookmarks(false);
            }}
            className={`p-1.5 rounded ${nightMode ? 'hover:bg-stone-800' : 'hover:bg-stone-200/70'}`}
            aria-label="Table of contents"
            title="Table of contents"
          >
            <BookOpen className="w-4 h-4" />
          </button>
          <button
            onClick={() => {
              setShowBookmarks((shown) => !shown);
              setShowOutline(false);
              setShowHighlights(false);
              setShowVocabulary(false);
            }}
            className={`relative p-1.5 rounded ${showBookmarks ? 'bg-amber-200 text-amber-950' : nightMode ? 'hover:bg-stone-800' : 'hover:bg-stone-200/70'}`}
            aria-label="Saved bookmarks"
            aria-pressed={showBookmarks}
            title="Saved bookmarks"
          >
            <BookmarkCheck className="w-4 h-4" />
            {bookmarks.length > 0 && <span className="absolute -right-1 -top-1 min-w-4 rounded-full bg-amber-600 px-1 text-[9px] leading-4 text-white">{bookmarks.length}</span>}
          </button>
          <button
            onClick={() => {
              setShowHighlights((shown) => !shown);
              setShowOutline(false);
              setShowVocabulary(false);
              setShowBookmarks(false);
            }}
            className={`relative p-1.5 rounded ${showHighlights ? 'bg-amber-200 text-amber-950' : nightMode ? 'hover:bg-stone-800' : 'hover:bg-stone-200/70'}`}
            aria-label="Saved highlights"
            aria-pressed={showHighlights}
            title="Saved highlights"
          >
            <Highlighter className="w-4 h-4" />
            {highlights.length > 0 && <span className="absolute -right-1 -top-1 min-w-4 rounded-full bg-amber-500 px-1 text-[9px] leading-4 text-white">{highlights.length}</span>}
          </button>
          <button
            onClick={() => void openVocabulary()}
            className={`relative inline-flex items-center gap-1.5 rounded p-1.5 ${showVocabulary ? 'bg-blue-200 text-blue-950' : nightMode ? 'hover:bg-stone-800' : 'hover:bg-stone-200/70'}`}
            aria-label="Book vocabulary"
            aria-pressed={showVocabulary}
            title="Book vocabulary"
          >
            <BookMarked className="w-4 h-4" />
            <span className="hidden sm:inline text-xs">Vocabulary</span>
            {vocabulary.length > 0 && <span className="absolute -right-1 -top-1 min-w-4 rounded-full bg-blue-600 px-1 text-[9px] leading-4 text-white">{vocabulary.length}</span>}
          </button>
          <button
            onClick={() => setPanMode((enabled) => !enabled)}
            className={`p-1.5 rounded ${panMode ? 'bg-blue-200 text-blue-900' : nightMode ? 'hover:bg-stone-800' : 'hover:bg-stone-200/70'}`}
            aria-label={panMode ? 'Disable pan tool' : 'Enable pan tool'}
            aria-pressed={panMode}
            title="Pan tool"
          >
            <Hand className="w-4 h-4" />
          </button>
          <button
            onClick={() => setNightMode((enabled) => !enabled)}
            className={`p-1.5 rounded ${nightMode ? 'hover:bg-stone-800' : 'hover:bg-stone-200/70'}`}
            aria-label={nightMode ? 'Switch to day mode' : 'Switch to night mode'}
            aria-pressed={nightMode}
            title={nightMode ? 'Day mode' : 'Night mode'}
          >
            {nightMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>
          <span className={`hidden sm:inline text-xs ${saveFailed ? 'text-red-400' : nightMode ? 'text-stone-400' : 'text-stone-500'}`}>
            {saveFailed ? 'Not saved, retrying' : status}
          </span>
          <span className="font-medium" title={`Total on this book: ${formatDuration(book.totalSeconds + sessionSeconds)}`}>
            {formatClock(sessionSeconds)}
          </span>
          <button
            onClick={() => setPaused((p) => !p)}
            className={`p-1.5 rounded ${nightMode ? 'hover:bg-stone-800' : 'hover:bg-stone-200/70'}`}
            aria-label={paused ? 'Resume timer' : 'Pause timer'}
          >
            {paused ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
          </button>
        </div>
      </header>

      <div className="relative flex flex-1 min-h-0">
        {(showOutline || showHighlights || showVocabulary || showBookmarks) && (
          <aside className={`absolute inset-y-0 left-0 z-20 w-72 max-w-[85vw] overflow-y-auto border-r p-3 shadow-xl ${nightMode ? 'bg-stone-950 border-stone-700' : 'bg-white border-stone-200'}`}>
            <div className="mb-2 flex items-center justify-between px-2">
              <h2 className="font-serif font-semibold">
                {showOutline ? 'Table of contents' : showBookmarks ? `Bookmarks (${bookmarks.length})` : showHighlights ? `Highlights (${highlights.length})` : `Vocabulary (${vocabulary.length})`}
              </h2>
              <button
                onClick={() => {
                  setShowOutline(false);
                  setShowHighlights(false);
                  setShowVocabulary(false);
                  setShowBookmarks(false);
                }}
                className="rounded p-1 hover:bg-stone-200/60"
                aria-label="Close reader panel"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            {showOutline && (
              <>
                {outlineError && <p className="px-2 py-2 text-sm text-red-600" role="alert">{outlineError}</p>}
                {outline.length ? renderOutline(outline) : (
                  <>
                    <p className="px-2 py-2 text-xs text-stone-500">This PDF has no embedded contents. Browse its pages here.</p>
                    <div className="max-h-[70vh] overflow-y-auto">
                      {Array.from({ length: numPages }, (_, index) => {
                        const pageNumber = index + 1;
                        return (
                          <button
                            key={pageNumber}
                            type="button"
                            onClick={() => {
                              goTo(pageNumber);
                              setShowOutline(false);
                            }}
                            className={`block w-full rounded px-2 py-1.5 text-left text-sm hover:bg-stone-100 ${page === pageNumber ? 'font-semibold text-blue-700' : ''}`}
                            aria-current={page === pageNumber ? 'page' : undefined}
                          >
                            Page {pageNumber}
                          </button>
                        );
                      })}
                    </div>
                  </>
                )}
              </>
            )}
            {showBookmarks && (
              <>
                {outlineError && <p className="px-2 py-2 text-sm text-red-600" role="alert">{outlineError}</p>}
                {!bookmarks.length ? (
                  <p className="px-2 py-3 text-sm text-stone-500">No bookmarks yet. Right-click a passage or page position to add one.</p>
                ) : (
                  <ul className="divide-y divide-stone-200/70">
                    {bookmarks.map((bookmark) => (
                      <li key={bookmark.id} className="flex items-center gap-2 py-2">
                        <button
                          type="button"
                          onClick={() => goToBookmarkedPage(bookmark)}
                          className={`min-w-0 flex-1 rounded px-2 py-1 text-left hover:bg-stone-100 ${page === bookmark.page ? 'font-semibold text-blue-700' : ''}`}
                          aria-current={page === bookmark.page ? 'page' : undefined}
                        >
                          <span className="mb-0.5 block text-[11px] text-stone-500">Page {bookmark.page}</span>
                          <span className="line-clamp-3 block text-sm">{bookmark.text || 'Page bookmark'}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => saveBookmarks(bookmarks.filter((saved) => saved.id !== bookmark.id))}
                          className="rounded p-1 text-stone-400 hover:bg-red-50 hover:text-red-600"
                          aria-label={`Remove bookmark: ${bookmark.text?.slice(0, 50) || `page ${bookmark.page}`}`}
                          title="Remove bookmark"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
            {showHighlights && (
              <>
                {highlightError && <p className="px-2 py-2 text-sm text-red-600" role="alert">{highlightError}</p>}
                {!highlights.length ? (
                  <p className="px-2 py-3 text-sm text-stone-500">Select text and choose a color to save a highlight.</p>
                ) : (
                  <ul className="divide-y divide-stone-200/70">
                    {highlights.map((highlight) => {
                      const color = HIGHLIGHT_COLORS.find((item) => item.color === highlight.color);
                      return (
                        <li key={highlight.id} className="flex items-start gap-2 py-2">
                          <button
                            type="button"
                            onClick={() => goTo(highlight.page)}
                            className="min-w-0 flex-1 rounded px-2 py-1 text-left hover:bg-stone-100"
                            title={`Go to page ${highlight.page}`}
                          >
                            <span className="mb-1 flex items-center gap-1.5 text-[11px] text-stone-500">
                              <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: color?.value }} />
                              Page {highlight.page}
                            </span>
                            <span className="line-clamp-3 block text-sm">{highlight.text}</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => removeHighlight(highlight.id)}
                            className="mt-1 rounded p-1 text-stone-400 hover:bg-red-50 hover:text-red-600"
                            aria-label={`Remove highlight: ${highlight.text.slice(0, 50)}`}
                            title="Remove highlight"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </>
            )}
            {showVocabulary && (
              <>
                {vocabularyError && <p className="px-2 py-2 text-sm text-red-600" role="alert">{vocabularyError}</p>}
                {vocabularyLoading ? (
                  <p className="px-2 py-3 text-sm text-stone-500">Loading vocabulary...</p>
                ) : vocabulary.length === 0 ? (
                  <p className="px-2 py-3 text-sm text-stone-500">No saved vocabulary for this book yet. Select text in the PDF and choose “Add to vocabulary”.</p>
                ) : (
                  <ul className="divide-y divide-stone-200/70">
                    {vocabulary.map((entry) => (
                      <li key={entry.id} className="flex items-center gap-2 py-2">
                        <button
                          type="button"
                          onClick={() => goTo(entry.page)}
                          className="min-w-0 flex-1 rounded px-2 py-1 text-left hover:bg-stone-100"
                          title={`Go to page ${entry.page}`}
                        >
                          <span className="block truncate text-sm font-medium">{entry.word}</span>
                          <span className="text-xs text-stone-500">Page {entry.page}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => void removeVocabularyEntry(entry)}
                          className="rounded p-1 text-stone-400 hover:bg-red-50 hover:text-red-600"
                          aria-label={`Remove vocabulary word: ${entry.word}`}
                          title="Remove word"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </aside>
        )}
        <div
          ref={wrapRef}
          className={`flex flex-1 min-w-0 flex-col overflow-auto overscroll-contain ${panMode ? 'cursor-grab active:cursor-grabbing select-none' : 'touch-pan-y'}`}
          onScroll={updateCurrentPage}
          onPointerDown={handlePanPointerDown}
          onPointerMove={handlePanPointerMove}
          onPointerUp={() => { panStartRef.current = null; setIsPanning(false); }}
          onPointerCancel={() => { panStartRef.current = null; setIsPanning(false); }}
        >
        <div className="mx-auto flex w-max min-w-full shrink-0 flex-col items-center gap-4 p-4">
          {loading && <p className="text-sm text-stone-400 mt-20">Opening...</p>}
          {error && <p className="text-sm text-red-600 mt-20">{error}</p>}
          {!loading && !error && doc && Array.from({ length: numPages }, (_, index) => {
            const pageNumber = index + 1;
            return (
              <PdfPage
                key={pageNumber}
                doc={doc}
                page={pageNumber}
                viewport={viewport}
                fitMode={fitMode}
                customFit={customFit}
                zoom={zoom}
                nightMode={nightMode}
                panMode={panMode}
                isPanning={isPanning}
                highlights={highlights.filter((highlight) => highlight.page === pageNumber)}
                scrollRoot={wrapRef}
                onContextMenu={showSelectionMenu}
                onRenderError={reportRenderError}
              />
            );
          })}
        </div>
        </div>
      </div>
      {selectionMenu && (
        <div
          className="fixed z-50 w-64 rounded-lg border border-stone-200 bg-white p-2 text-stone-900 shadow-xl"
          style={{ left: selectionMenu.x, top: selectionMenu.y }}
          role="menu"
        >
          {selectionMenu.word && (
            <>
              <p className="truncate px-2 py-1 text-xs text-stone-500" title={selectionMenu.word}>{selectionMenu.word}</p>
              <div className="px-2 py-1">
                <p className="mb-1 text-xs text-stone-500">Highlight selection</p>
                <div className="flex items-center gap-2">
                  {HIGHLIGHT_COLORS.map(({ color, label, value }) => (
                    <button
                      key={color}
                      onClick={() => addHighlight(color)}
                      className="h-7 w-7 rounded-full border border-stone-300 hover:ring-2 hover:ring-stone-400"
                      style={{ backgroundColor: value }}
                      aria-label={`Highlight ${label}`}
                      title={label}
                    />
                  ))}
                </div>
              </div>
              <button
                onClick={addSelectionToVocabulary}
                disabled={selectionMenu.word.length > 120}
                className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-stone-100 disabled:opacity-50"
                role="menuitem"
              >
                <BookPlus className="h-4 w-4" />
                Add to vocabulary
              </button>
              {selectionMenu.word.length > 120 && (
                <p className="px-2 py-1 text-xs text-stone-500">Select a shorter word or phrase (up to 120 characters).</p>
              )}
            </>
          )}
          {highlightError && <p className="px-2 py-1 text-xs text-red-600" role="alert">{highlightError}</p>}
          {selectionMenu.highlightIds.length > 0 && (
            <button
              onClick={removeSelectedHighlights}
              className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm text-red-700 hover:bg-red-50"
              role="menuitem"
            >
              <Eraser className="h-4 w-4" />
              Erase highlight
            </button>
          )}
          <button
            onClick={addSelectionBookmark}
            className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-stone-100"
            role="menuitem"
          >
            <Bookmark className="h-4 w-4" />
            {selectionMenu.word ? 'Bookmark selected text' : 'Add bookmark here'}
          </button>
          {selectionMenu.error && <p className="px-2 py-1 text-xs text-red-600" role="alert">{selectionMenu.error}</p>}
          <button
            onClick={() => setSelectionMenu(null)}
            className="flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-xs text-stone-500 hover:bg-stone-100"
          >
            <X className="h-3 w-3" />
            Cancel
          </button>
        </div>
      )}

      <footer className={`flex items-center justify-between gap-1 px-2 min-h-12 py-1 border-t shrink-0 text-sm ${nightMode ? 'bg-stone-950 border-stone-700' : 'bg-[#FBF9F5] border-stone-200'}`}>
        <div className="flex items-center gap-1">
          <select
            value={fitMode}
            onChange={(e) => {
              const mode = e.target.value as FitMode;
              setFitMode(mode);
              if (mode !== 'custom') setZoom(1);
            }}
            className={`max-w-20 rounded border py-1 px-1 text-xs ${nightMode ? 'bg-stone-900 border-stone-600' : 'bg-transparent border-stone-300'}`}
            aria-label="Page fit mode"
          >
            <option value="page">Fit page</option>
            <option value="width">Fit width</option>
            <option value="custom">Custom</option>
          </select>
          <button
            onClick={() => {
              setCustomFit(fitMode === 'width' ? 'width' : fitMode === 'custom' ? customFit : 'page');
              setFitMode('custom');
              setZoom((z) => Math.max(0.5, +(z - 0.1).toFixed(1)));
            }}
            className={`p-1.5 rounded ${nightMode ? 'hover:bg-stone-800' : 'hover:bg-stone-200/70'}`}
            aria-label="Zoom out"
          >
            <Minus className="w-4 h-4" />
          </button>
          <span className={`w-10 text-center text-xs tabular-nums ${nightMode ? 'text-stone-400' : 'text-stone-500'}`}>
            {fitMode === 'custom' ? `${Math.round(zoom * 100)}%` : '100%'}
          </span>
          <button
            onClick={() => {
              setCustomFit(fitMode === 'width' ? 'width' : fitMode === 'custom' ? customFit : 'page');
              setFitMode('custom');
              setZoom((z) => Math.min(2.5, +(z + 0.1).toFixed(1)));
            }}
            className={`p-1.5 rounded ${nightMode ? 'hover:bg-stone-800' : 'hover:bg-stone-200/70'}`}
            aria-label="Zoom in"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={() => goTo(page - 1)}
            disabled={page <= 1}
            className={`p-1.5 rounded disabled:opacity-30 ${nightMode ? 'hover:bg-stone-800' : 'hover:bg-stone-200/70'}`}
            aria-label="Previous page"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <input
            value={pageInput}
            onChange={(e) => setPageInput(e.target.value.replace(/\D/g, ''))}
            onKeyDown={(e) => e.key === 'Enter' && goTo(parseInt(pageInput || '1', 10))}
            onBlur={() => setPageInput(String(page))}
            className={`w-12 text-center rounded border py-1 tabular-nums ${nightMode ? 'bg-stone-900 border-stone-600' : 'bg-white border-stone-300'}`}
            aria-label="Page number"
          />
          <span className="text-stone-500 tabular-nums">/ {numPages || '-'}</span>
          <button
            onClick={() => goTo(page + 1)}
            disabled={numPages > 0 && page >= numPages}
            className={`p-1.5 rounded disabled:opacity-30 ${nightMode ? 'hover:bg-stone-800' : 'hover:bg-stone-200/70'}`}
            aria-label="Next page"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        <div className={`w-20 text-right text-xs tabular-nums hidden sm:block ${nightMode ? 'text-stone-400' : 'text-stone-500'}`}>
          {numPages ? `${Math.round((page / numPages) * 100)}%` : ''}
        </div>
        <div className="sm:hidden" />
      </footer>
    </div>
  );
}
