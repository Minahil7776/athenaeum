# Athenaeum

Your reading library with PDF upload, an in-app reader, and reading time tracked by day and time.

## Run

```
npm install
copy .env.example .env      (Mac/Linux: cp .env.example .env)
npm run dev
```

Open http://localhost:3000. The server uses port 3000 locally by default and binds
to `0.0.0.0`; when deployed, it uses the `PORT` supplied by the hosting platform.

## Deploy to Vercel

The frontend is built with Vite and served from `dist` as static files. The
`api/index.ts` Vercel function forwards `/api/*` requests to the Express app in
`server.ts`, preserving the original API path. Use the **Vite** framework preset
and the repository root as the project root. The included `vercel.json` builds
with `npm run build` and rewrites client-side frontend routes to the Vite entry
point without capturing API paths or static assets.

Set these Vercel environment variables for each environment you deploy:

- `MONGODB_URI`: your MongoDB connection string. Required; keep it server-side and
  do not prefix it with `VITE_`.
- `MONGODB_DB`: optional database name; defaults to `athenaeum`.
- `PORT`: do not set this to your website URL. Vercel manages function routing and
  does not need the app to listen on a port. Locally, the server defaults to port
  `3000` and honors `PORT` if you set a local port number.

Production startup fails if MongoDB is missing or unreachable rather than using
ephemeral local disk. Ensure your MongoDB provider allows connections from your
Vercel deployment.

Vercel Functions limit request and response bodies to 4.5 MB. On Vercel, PDFs
are therefore uploaded directly from the browser to Vercel Blob and the reader
is redirected to Blob for the file, so PDF bytes do not pass through a
Function. In the Vercel project, create a **public** Blob store and connect it
to the project for Production and Preview. Vercel adds `BLOB_READ_WRITE_TOKEN`;
make sure it is available to the deployment. Local development continues to
store PDFs using the configured database or local disk. Uploads are limited to
100 MB.

Blob URLs are public, just like the app's existing unauthenticated PDF route.
PDFs already stored in MongoDB GridFS are not migrated automatically; if a
legacy PDF is too large to read through the Function, upload it again after
connecting Blob to replace it.

## MongoDB

Open `.env` and paste your connection string into `MONGODB_URI`.
Books and reading sessions are stored in your database, so your library is the
same on every device. Local PDFs use MongoDB GridFS when MongoDB is configured,
or local disk otherwise; Vercel PDFs use Blob.

For local development, if `MONGODB_URI` is empty or unreachable the app stores everything
in a local `data` folder instead. Production requires a working `MONGODB_URI`.
Your 148 books are added automatically the first time the app starts on an empty database.

## Using it

- **Upload PDF** (top right) adds a new book from a PDF. Each book row also has its own
  **Upload PDF** button; once a PDF is attached the button becomes **Read** / **Continue**.
- **My books** shows your shelves as a cover gallery. For books without a PDF, choose
  **Find a copy** to search Open Library and explore available public-domain or borrowing
  options. Availability and download permissions depend on each book's rights.
- **Discover** searches Open Library; add a result to your library to keep its cover and
  publication details with your book. Existing books with a PDF look up matching covers
  as you browse; successfully matched covers are saved with the book.
- **Reader**: arrow keys or the page box to move, zoom buttons, pause button for the timer.
  It resumes on the page where you stopped. Pages render as they approach the viewport,
  and local/MongoDB PDFs use byte-range requests so opening a large book does not require
  downloading and rendering every page first.
- **Log time** records time for hardcopy books or reading done elsewhere (date, start time, minutes).
- **Activity** shows today / 7 days / 30 days / all time, a 30-day chart, your streak,
  and every session grouped by day with its start and end time. Sessions can be deleted.

## How time tracking works

- The timer counts only while the reader is open, the tab is visible, and you are active.
- It pauses by itself after 2 minutes with no mouse, key, scroll or touch input.
- Time and page are saved every 10 seconds, when you change tab, and when you close the reader.
- Each reading session is stored with its day, start time, end time, seconds and pages.
- Any positive reading time counts as an active streak day.
- Opening a to-read book moves it to Reading. Reaching the last page moves it to Finished.
