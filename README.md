# ImageOptimize

A production-ready image optimization web app built with **Express.js** and **Sharp**. Drag-and-drop JPEG, PNG, or WebP images to compress them instantly — with a side-by-side before/after comparison and one-click download.

![Node.js](https://img.shields.io/badge/Node.js-18%2B-green) ![Express](https://img.shields.io/badge/Express-4.x-lightgrey) ![Sharp](https://img.shields.io/badge/Sharp-0.33-orange) ![Docker](https://img.shields.io/badge/Docker-ready-blue)

---

## Features

- **Drag-and-drop upload** — drop a file or click to browse; instant local preview before the upload even starts
- **JPEG · PNG · WebP** — SVG, GIF, and other formats are rejected with a clear error
- **Sharp optimization** — mozjpeg for JPEG, adaptive PNG compression, configurable WebP effort
- **Before / After comparison** — side-by-side panes with file size and savings stats
- **One-click download** — grab the optimized file directly from the browser
- **Rate limiting** — 30 requests per minute per IP via `express-rate-limit`
- **25 MB upload cap** — enforced at the multer layer before the file hits Sharp
- **Auto-cleanup** — temp files older than 30 minutes are deleted automatically
- **Dockerized** — multi-stage Alpine build; PM2 cluster mode for production

---

## Project Structure

```
image-optimization-app/
├── src/
│   ├── server.js              # Entry point — binds port, graceful shutdown
│   ├── app.js                 # Express setup: Helmet, compression, routes
│   ├── config/
│   │   └── index.js           # Central config: port, limits, Sharp presets, cleanup
│   ├── validators/
│   │   └── image.js           # MIME / extension allow-list, rejection messages
│   ├── middleware/
│   │   ├── rateLimiter.js     # express-rate-limit (30 req/min per IP)
│   │   └── upload.js          # Multer disk storage + typed error handling
│   ├── routes/
│   │   ├── pages.js           # GET / → index.html
│   │   └── api.js             # POST /api/upload, GET /api/file/:f, GET /api/download/:f
│   └── utils/
│       └── cleanup.js         # Interval-based temp-file deletion
├── views/
│   └── index.html             # Single-page UI
├── public/
│   ├── css/style.css          # Responsive layout, panes, spinner, stats bar
│   └── js/app.js              # Client: drag-drop, FileReader preview, fetch upload
├── temp/                      # Runtime temp files (auto-created, gitignored)
├── logs/                      # PM2 log output (gitignored)
├── ecosystem.config.js        # PM2 cluster config
├── Dockerfile                 # Multi-stage Alpine image
├── docker-compose.yml         # Service + named volumes + health check
└── package.json
```

---

## Prerequisites

| Tool | Version |
|------|---------|
| Node.js | ≥ 18 |
| npm | ≥ 9 |
| Docker + Compose | any recent version (optional) |

---

## Getting Started

### 1 — Install dependencies

```bash
npm install
```

### 2 — Start in development mode (nodemon)

```bash
npm run dev
```

### 3 — Open the app

```
http://localhost:3000
```

---

## Running in Production

### Option A — PM2 directly

```bash
npm run pm2:start    # start cluster workers
npm run pm2:logs     # tail logs
npm run pm2:restart  # rolling restart
npm run pm2:stop     # stop all workers
```

PM2 runs one worker per CPU core (`instances: 'max'`, `exec_mode: 'cluster'`). Workers share the `temp/` directory safely because every file is named with a UUID.

### Option B — Docker Compose

```bash
docker-compose up --build -d   # build and start
docker-compose logs -f         # tail logs
docker-compose down            # stop and remove containers
```

The Compose file mounts named volumes for `temp/` and `logs/` so files survive container restarts.

### Option C — Docker standalone

```bash
docker build -t image-opt .
docker run -p 3000:3000 --name image-opt image-opt
```

---

## API Reference

All API routes are rate-limited to **30 requests per minute per IP**. Rate-limit state is tracked per worker in development; use Redis or a shared store for multi-host production deployments.

### `POST /api/upload`

Upload and optimize an image.

**Request** — `multipart/form-data`

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `image` | file | yes | JPEG, PNG, or WebP; max 25 MB |

**Response `200 OK`**

```json
{
  "success": true,
  "original": {
    "filename": "photo.jpg",
    "size": 2457600,
    "sizeFormatted": "2.34 MB",
    "width": 3024,
    "height": 4032,
    "format": "jpeg",
    "url": "/api/file/3f1a...jpg"
  },
  "optimized": {
    "filename": "opt-9c2b...jpg",
    "size": 1245184,
    "sizeFormatted": "1.19 MB",
    "savedPct": 49.3,
    "savedPctFormatted": "49.3%",
    "url": "/api/file/opt-9c2b...jpg",
    "downloadUrl": "/api/download/opt-9c2b...jpg"
  }
}
```

**Error responses**

| Status | Cause |
|--------|-------|
| `400` | No file provided or unexpected field name |
| `413` | File exceeds 25 MB |
| `415` | Unsupported file type (SVG, GIF, etc.) |
| `422` | Sharp could not decode the file (corrupt or misidentified) |
| `429` | Rate limit exceeded |

---

### `GET /api/file/:filename`

Serve a temp file (used for in-browser image display).

| Status | Cause |
|--------|-------|
| `200` | File content |
| `404` | File not found or already cleaned up |

---

### `GET /api/download/:filename`

Trigger a browser download of the optimized file.

| Status | Cause |
|--------|-------|
| `200` | File download with `Content-Disposition: attachment` |
| `404` | File not found or already cleaned up |

---

## Configuration

All tuneable values live in `src/config/index.js`.

| Key | Default | Description |
|-----|---------|-------------|
| `port` | `3000` | HTTP port (override with `PORT` env var) |
| `maxFileSize` | `26,214,400` | Max upload bytes (25 MB) |
| `rateLimit.windowMs` | `60000` | Rate-limit window (ms) |
| `rateLimit.max` | `30` | Max requests per window per IP |
| `cleanup.maxAge` | `1,800,000` | Delete temp files older than this (ms) |
| `cleanup.interval` | `300,000` | How often to run cleanup (ms) |
| `sharp.jpeg` | `quality: 80, mozjpeg: true, progressive: true` | JPEG output settings |
| `sharp.png` | `compressionLevel: 9, adaptiveFiltering: true` | PNG output settings |
| `sharp.webp` | `quality: 80, effort: 4` | WebP output settings |

---

## Sharp Optimization Details

| Format | Technique | Why |
|--------|-----------|-----|
| **JPEG** | mozjpeg encoder, quality 80, progressive | mozjpeg consistently beats libjpeg-turbo by 10–15% at the same perceptual quality |
| **PNG** | zlib level 9, adaptive row filtering | Adaptive filtering picks the best predictor per scanline, reducing deflate input entropy |
| **WebP** | quality 80, effort 4 | Effort 4 (0–6 scale) balances encode speed with compression ratio for interactive use |

---

## Security

- **Helmet** — sets `Content-Security-Policy`, `X-Content-Type-Options`, `X-Frame-Options`, and other hardening headers
- **Path traversal prevention** — `path.basename()` is applied to every `:filename` parameter before a filesystem read
- **Double validation** — file type is checked at both the multer `fileFilter` stage (MIME + extension) and again implicitly by Sharp (which will throw on corrupt or misidentified files)
- **Body size cap** — JSON/URL-encoded bodies are limited to 1 MB independent of the file upload limit

---

## Future Roadmap

The `pane--after` panel is intentionally designed as an extension point. Planned features:

- **OpenCV.js processing** — client-side or server-side filters, edge detection, object-aware cropping
- **Resize / crop controls** — width, height, fit mode
- **Batch upload** — queue multiple files and download a ZIP
- **Format conversion** — convert JPEG → WebP, PNG → WebP, etc.
- **Quality slider** — real-time before/after comparison at different compression levels

---

## Development Scripts

```bash
npm start          # node src/server.js
npm run dev        # nodemon (auto-restart on file changes)
npm run pm2:start  # PM2 cluster (production)
npm run pm2:stop
npm run pm2:restart
npm run pm2:logs
```

---

## License

MIT
