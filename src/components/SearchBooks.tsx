import { FormEvent, useState } from 'react';
import { BookDown, BookPlus, Check, ExternalLink, LoaderCircle, Search } from 'lucide-react';
import { api } from '../api';
import { Book } from '../types';

interface SearchBook {
	key: string;
	title: string;
	author_name?: string[];
	first_publish_year?: number;
	cover_i?: number;
	edition_count?: number;
	ebook_access?: string;
	ia?: string[];
}

interface SearchResponse {
	numFound: number;
	docs: SearchBook[];
}

interface ArchiveMetadata {
	files?: { name?: string; format?: string; private?: string }[];
}

const SUGGESTED_SEARCHES = ['Jane Austen', 'The Art of War', 'poetry', 'psychology'];
const PAGE_SIZE = 24;

export function SearchBooks({ books, onAdd }: { books: Book[]; onAdd: () => Promise<void> }) {
	const [query, setQuery] = useState('');
	const [submittedQuery, setSubmittedQuery] = useState('');
	const [results, setResults] = useState<SearchBook[]>([]);
	const [total, setTotal] = useState(0);
	const [page, setPage] = useState(0);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState('');
	const [addingKey, setAddingKey] = useState('');
	const [downloadingKey, setDownloadingKey] = useState('');

	const search = async (term: string, nextPage = 0) => {
		const cleanTerm = term.trim();
		if (!cleanTerm) return;
		setQuery(cleanTerm);
		setSubmittedQuery(cleanTerm);
		setPage(nextPage);
		setLoading(true);
		setError('');
		try {
			const params = new URLSearchParams({
				q: cleanTerm,
				limit: String(PAGE_SIZE),
				offset: String(nextPage * PAGE_SIZE),
				fields: 'key,title,author_name,first_publish_year,cover_i,edition_count,ebook_access,ia',
			});
			const response = await fetch(`https://openlibrary.org/search.json?${params}`);
			if (!response.ok) throw new Error(`Search failed (${response.status}). Please try again.`);
			const data = (await response.json()) as SearchResponse;
			setResults(data.docs || []);
			setTotal(data.numFound || 0);
		} catch (cause) {
			setResults([]);
			setTotal(0);
			setError(cause instanceof Error ? cause.message : 'Could not search Open Library.');
		} finally {
			setLoading(false);
		}
	};

	const addToLibrary = async (book: SearchBook) => {
		setAddingKey(book.key);
		setError('');
		try {
			await api.addBook({
				title: book.title,
				author: book.author_name?.[0] || 'Unknown author',
				genre: 'other',
				rating: null,
				year: book.first_publish_year || null,
			});
			await onAdd();
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : 'Could not add this book.');
		} finally {
			setAddingKey('');
		}
	};

	const downloadBook = async (book: SearchBook) => {
		const archiveId = book.ia?.[0];
		if (!archiveId) return;
		setDownloadingKey(book.key);
		setError('');
		try {
			const response = await fetch(`https://archive.org/metadata/${encodeURIComponent(archiveId)}`);
			if (!response.ok) throw new Error('Could not check available download formats.');
			const metadata = (await response.json()) as ArchiveMetadata;
			const file = metadata.files?.find((item) => {
				const name = item.name?.toLowerCase() || '';
				return item.private !== 'true' && (name.endsWith('.pdf') || name.endsWith('.epub'));
			});
			if (!file?.name) throw new Error('No public PDF or EPUB download is available for this edition.');
			const link = document.createElement('a');
			link.href = `https://archive.org/download/${encodeURIComponent(archiveId)}/${file.name.split('/').map(encodeURIComponent).join('/')}?download=1`;
			link.download = '';
			link.rel = 'noopener noreferrer';
			document.body.appendChild(link);
			link.click();
			link.remove();
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : 'Could not start this download.');
		} finally {
			setDownloadingKey('');
		}
	};

	const existingBook = (book: SearchBook) => books.some((item) =>
		item.title.trim().toLowerCase() === book.title.trim().toLowerCase() &&
		item.author.trim().toLowerCase() === (book.author_name?.[0] || 'Unknown author').trim().toLowerCase()
	);

	const submit = (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		void search(query);
	};

	return (
		<section>
			<div className="border-b border-stone-200 pb-6 mb-5">
				<p className="text-xs font-medium uppercase tracking-[0.12em] text-emerald-800">Open Library catalog</p>
				<h1 className="font-serif text-3xl font-semibold mt-2">Find a book</h1>
				<form onSubmit={submit} className="mt-5 flex gap-2 max-w-2xl">
					<label className="relative flex-1 min-w-0">
						<Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" aria-hidden="true" />
						<input
							value={query}
							onChange={(event) => setQuery(event.target.value)}
							placeholder="Title, author, or subject"
							aria-label="Search books"
							className="w-full pl-9 pr-3 py-2.5 text-sm bg-white border border-stone-300 rounded-lg focus:outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/15"
						/>
					</label>
					<button
						type="submit"
						disabled={loading || !query.trim()}
						className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-stone-900 rounded-lg hover:bg-stone-700 disabled:opacity-50"
					>
						{loading ? <LoaderCircle className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
						Search
					</button>
				</form>
				{!submittedQuery && (
					<div className="flex flex-wrap gap-2 mt-4" aria-label="Suggested searches">
						{SUGGESTED_SEARCHES.map((term) => (
							<button
								key={term}
								onClick={() => void search(term)}
								className="px-3 py-1.5 text-xs text-stone-700 bg-white border border-stone-200 rounded-full hover:border-emerald-700 hover:text-emerald-800"
							>
								{term}
							</button>
						))}
					</div>
				)}
			</div>

			{error && <p role="alert" className="mb-4 px-3 py-2 text-sm text-red-800 bg-red-50 border border-red-200 rounded-lg">{error}</p>}

			{submittedQuery && !loading && !error && (
				<div className="flex items-baseline justify-between gap-3 mb-3 text-sm">
					<p className="text-stone-600">Results for <span className="font-medium text-stone-900">{submittedQuery}</span></p>
					<span className="text-xs text-stone-500 tabular-nums">{total.toLocaleString()} found</span>
				</div>
			)}

			{loading ? (
				<div className="py-16 flex items-center justify-center gap-2 text-sm text-stone-500" role="status">
					<LoaderCircle className="w-4 h-4 animate-spin" /> Searching the catalog
				</div>
			) : results.length > 0 ? (
				<>
					<ul className="divide-y divide-stone-200 border-y border-stone-200">
						{results.map((book) => {
							const inLibrary = existingBook(book);
							const hasPublicAccess = book.ebook_access === 'public' && Boolean(book.ia?.length);
							const archiveId = book.ia?.[0];
							return (
								<li key={book.key} className="flex gap-4 py-4 sm:py-5">
									<div className="w-[68px] h-[96px] sm:w-[76px] sm:h-[108px] shrink-0 bg-stone-100 border border-stone-200 rounded overflow-hidden flex items-center justify-center">
										{book.cover_i ? (
											<img
												src={`https://covers.openlibrary.org/b/id/${book.cover_i}-M.jpg`}
												alt={`Cover of ${book.title}`}
												loading="lazy"
												className="w-full h-full object-cover"
											/>
										) : <BookDown className="w-6 h-6 text-stone-300" aria-hidden="true" />}
									</div>
									<div className="flex-1 min-w-0 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
										<div className="min-w-0">
											<h2 className="font-serif text-base font-semibold leading-snug">{book.title}</h2>
											<p className="mt-1 text-sm text-stone-600 truncate">{book.author_name?.slice(0, 2).join(', ') || 'Unknown author'}</p>
											<p className="mt-1 text-xs text-stone-500">
												{book.first_publish_year || 'Publication year unknown'}
												{book.edition_count ? ` · ${book.edition_count} ${book.edition_count === 1 ? 'edition' : 'editions'}` : ''}
												{hasPublicAccess ? ' · Free to download' : book.ebook_access === 'borrowable' ? ' · Borrow online' : ''}
											</p>
										</div>
										<div className="flex items-center gap-2 shrink-0">
											<button
												onClick={() => void addToLibrary(book)}
												disabled={inLibrary || addingKey === book.key}
												className="inline-flex items-center justify-center gap-1.5 min-h-9 px-3 text-xs font-medium border border-stone-300 rounded-lg hover:bg-white disabled:text-stone-500 disabled:bg-stone-100"
											>
												{inLibrary ? <Check className="w-3.5 h-3.5" /> : addingKey === book.key ? <LoaderCircle className="w-3.5 h-3.5 animate-spin" /> : <BookPlus className="w-3.5 h-3.5" />}
												{inLibrary ? 'In library' : addingKey === book.key ? 'Adding' : 'Add to library'}
											</button>
											{hasPublicAccess && archiveId ? (
												<button
													onClick={() => void downloadBook(book)}
													disabled={downloadingKey === book.key}
													title="Download a public PDF or EPUB"
													aria-label={`Download ${book.title}`}
													className="inline-flex items-center justify-center w-9 h-9 text-white bg-emerald-800 rounded-lg hover:bg-emerald-700 disabled:opacity-50"
												>
													{downloadingKey === book.key ? <LoaderCircle className="w-4 h-4 animate-spin" /> : <BookDown className="w-4 h-4" />}
												</button>
											) : archiveId ? (
												<a
													href={`https://openlibrary.org${book.key}`}
													target="_blank"
													rel="noreferrer"
													title="View borrowing options"
													aria-label={`View online access for ${book.title}`}
													className="inline-flex items-center justify-center w-9 h-9 text-stone-700 border border-stone-300 rounded-lg hover:bg-white"
												>
													<ExternalLink className="w-4 h-4" />
												</a>
											) : null}
										</div>
									</div>
								</li>
							);
						})}
					</ul>
					<div className="flex items-center justify-between py-4 text-sm">
						<span className="text-xs text-stone-500">Book data by Open Library</span>
						<div className="flex gap-2">
							<button
								onClick={() => void search(submittedQuery, page - 1)}
								disabled={page === 0}
								className="px-3 py-1.5 border border-stone-300 rounded-lg hover:bg-white disabled:opacity-40"
							>
								Previous
							</button>
							<button
								onClick={() => void search(submittedQuery, page + 1)}
								disabled={(page + 1) * PAGE_SIZE >= total}
								className="px-3 py-1.5 border border-stone-300 rounded-lg hover:bg-white disabled:opacity-40"
							>
								Next
							</button>
						</div>
					</div>
				</>
			) : submittedQuery && !error ? (
				<p className="py-16 text-center text-sm text-stone-500">No books found. Try another title or author.</p>
			) : !submittedQuery ? (
				<p className="py-12 text-center text-sm text-stone-500">Search millions of books and editions.</p>
			) : null}
		</section>
	);
}
