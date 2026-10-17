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

## Deploy

Use a Node.js host that supports running a persistent web server. Configure:

- **Build command:** `npm ci && npm run build`
- **Start command:** `npm start`
- **Environment:** Set `MONGODB_URI` to a reachable MongoDB connection string. Optionally
  set `MONGODB_DB` (defaults to `athenaeum`). The host supplies `PORT`.

The app serves both the built frontend and `/api` from the same server, so no separate
frontend/API URLs or localhost URLs need to be configured. Production startup exits
with an error if MongoDB is missing or unreachable rather than saving data to
ephemeral local disk. Use a managed MongoDB service for persistent books, sessions,
and uploaded PDFs.

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
