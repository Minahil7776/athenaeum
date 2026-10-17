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

The project root contains a Vercel Express entry point (`server.ts`). In Vercel, use
the **Express** framework preset, the repository root as the project root, and
`npm run build:vercel` as the build command. The included `vercel.json` selects the
Express preset and rewrites frontend routes to the Vite-built `public/index.html`;
API paths are excluded from that rewrite. Vercel serves built files in `public` as
static assets, while the Express app handles `/api`.

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

The current PDF upload and download routes send the file body through a Vercel
Function. Vercel limits function request and response bodies to 4.5 MB, so PDFs
larger than that cannot be uploaded or read through these routes even though local
GridFS storage supports larger files. Supporting larger PDFs on Vercel requires
direct uploads/downloads through durable object storage (for example, Vercel Blob)
instead of proxying the file through the function.

## MongoDB

Open `.env` and paste your connection string into `MONGODB_URI`.
Books, reading sessions and the PDF files themselves (GridFS) are stored in your database,
so your library is the same on every device.

For local development, if `MONGODB_URI` is empty or unreachable the app stores everything
in a local `data` folder instead. Production requires a working `MONGODB_URI`.
Your 148 books are added automatically the first time the app starts on an empty database.

## Using it

- **Upload PDF** (top right) adds a new book from a PDF. Each book row also has its own
  **Upload PDF** button; once a PDF is attached the button becomes **Read** / **Continue**.
- **Reader**: arrow keys or the page box to move, zoom buttons, pause button for the timer.
  It resumes on the page where you stopped.
- **Log time** records time for hardcopy books or reading done elsewhere (date, start time, minutes).
- **Activity** shows today / 7 days / 30 days / all time, a 30-day chart, your streak,
  and every session grouped by day with its start and end time. Sessions can be deleted.

## How time tracking works

- The timer counts only while the reader is open, the tab is visible, and you are active.
- It pauses by itself after 2 minutes with no mouse, key, scroll or touch input.
- Time and page are saved every 10 seconds, when you change tab, and when you close the reader.
- Each reading session is stored with its day, start time, end time, seconds and pages.
- A day counts toward your streak once you have read at least 1 minute.
- Opening a to-read book moves it to Reading. Reaching the last page moves it to Finished.
