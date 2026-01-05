# Snap-to-Search Service

Prototype backend for the Snaphomz "Snap-to-Search (Photo -> Exact Home Match)" feature. It accepts a facade photo and geo metadata, filters listings within the immediate vicinity, and returns the most likely property matches for user confirmation.

## Getting started

```bash
# Backend API
npm install
npm run dev
```

The service listens on `http://localhost:4000` by default. Environment variables can be set via `.env` (e.g., `PORT`).

### Environment variables

1. Copy `.env.example` to `.env`.
2. Fill in your credentials, e.g.:

```
RE_API_KEY=your-re-api-key
RE_API_BASE_URL=https://api.reapi.com/v1
ALLOWED_ORIGINS=http://localhost:5173
```

`dotenv` is loaded in `src/server.ts`, so `process.env.RE_API_KEY` will be available to any service that needs to call the listing imagery API.

### Building the baseline dataset

Use the bundled script to pull ~100 listings (with facade images + coordinates) from the RE API:

```bash
npm run build:dataset -- --target=120 --download
```

Flags:

- `--target=<n>` overrides the default (100 listings).
- `--pageSize=<n>` changes the paging size (default 50).
- `--download` saves each image to `dataset/images/` for offline experiments.
- `--endpoint=/custom/path` overrides the listings endpoint (default `/listings`; set `RE_API_LISTINGS_PATH` env to persist).

The script writes `dataset/listings.json` and requires `RE_API_KEY`/`RE_API_BASE_URL` to be set.

### Frontend capture UI

A React/Vite client lives in `frontend/` to provide the "Capture Image" and "Upload Image" experience.

```bash
cd frontend
npm install
cp .env.example .env   # adjust VITE_API_BASE_URL if needed
npm run dev            # starts at http://localhost:5173
```

The UI talks to the backend configured via `VITE_API_BASE_URL` (defaults to `http://localhost:4000`), extracts EXIF GPS metadata from uploaded photos for immediate feedback, auto-detects approximate location via IP (with manual refresh), and surfaces matches returned by the API.

## Key commands

| Command | Description |
| --- | --- |
| `npm run dev` | Run the TypeScript server with auto-reload. |
| `npm run build` | Emit the compiled JavaScript into `dist/`. |
| `npm start` | Run the compiled server. |
| `cd frontend && npm run dev` | Launch the React capture interface. |
| `cd frontend && npm run build` | Create a production bundle for the capture interface. |

## API overview

The HTTP surface is described in detail inside `docs/snap-to-search.md`. At a glance:

- `POST /api/snap-to-search` - Uploads a facade photo with device GPS metadata and returns the top matches along with a `nextActionToken`.
- `POST /api/snap-to-search/{token}/expand` - Replays the same context with a wider radius when the user taps "Not this."
- `GET /api/health` - Simple health probe for orchestration systems.

## Project layout

```
src/
  controllers/  HTTP request handling and validation
  services/     Geo filtering, visual matching, ranking, orchestration, session store
  utils/        Location math + logging helpers
  data/         Mock property dataset until the listing imagery API is available
frontend/
  src/          React components, styles, and API wiring for upload/capture UX
```

See `docs/snap-to-search.md` for the full flow, scoring weights, and future enhancements.
