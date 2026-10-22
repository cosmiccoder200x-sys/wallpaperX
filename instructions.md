# WallpaperX — Engineering Instructions

These instructions apply to every change in this repository. They were written
after a full audit of the current codebase (2026-10-20) and must be followed
during the repair and release process.

---

## 1. Architecture

```
frontend/                 React 18 + TypeScript + Vite + Tailwind (SPA)
  src/pages/              Route-level screens
  src/components/optimizer/  UploadArea, UrlInput, OptimizationControls, Comparison
  src/components/ui/      Design-system primitives (Button, Input, Card, Badge, Select)
  src/services/api.ts     Axios client (backend HTTP API) + Firebase helpers
  src/hooks/useAuth.tsx   Firebase Authentication context
  src/firebase/           Firebase app/Firestore helpers
backend/                  Flask 3 + Pillow (image pipeline)
  app.py                  App factory, CORS, JSON error handlers
  app/routes/             auth, optimize, wallpapers, admin blueprints
  app/services/           image_optimizer, url_fetcher, database, auth
  app/config/settings.py  Environment configuration (single source of truth)
  app/models/models.py    Dataclasses/enums shared by routes and services
database/schema.sql       PostgreSQL schema (Supabase-compatible)
```

Data flow for the release-critical feature:

```
Select file → POST /api/optimize/analyze (JSON metadata)
            → POST /api/optimize/optimize (binary image + X-* metadata headers)
            → comparison UI + client-side download of the returned Blob
URL path    → POST /api/optimize/optimize-url (same binary + header contract)
```

### API response contract (authoritative)

| Endpoint | Success | Failure |
|---|---|---|
| `POST /api/optimize/analyze` | `200 application/json` `{success:true,data:{...}}` | JSON `{success:false,error:{code,message}}` + 4xx |
| `POST /api/optimize/optimize` | `200` **binary image**, `Content-Type` of the actual encoded format, `Content-Disposition: attachment; filename=...`, plus `X-*` metadata headers | **always JSON** + 4xx/5xx |
| `POST /api/optimize/optimize-url` | same as `/optimize` | **always JSON** + 4xx/5xx |
| `GET /api/optimize/limits` | JSON | JSON + 4xx |
| `GET /api/optimize/history` | JSON (401 without a backend JWT) | JSON + 4xx/5xx |

Binary metadata headers (all strings, exposed through CORS):

```
X-Original-Size, X-Original-Width, X-Original-Height, X-Original-Format
X-Output-Size, X-Output-Width, X-Output-Height, X-Output-Format
X-Target-Size, X-Target-Met ("true"/"false")
X-Quality-Used, X-Processing-Time-Ms, X-Compression-Ratio, X-Saved-Bytes
X-Filename, X-Message (optional human-readable limitation)
```

Rules:

- A successful optimization **always** returns a real image body, including when
  the original already satisfies the target size. Never return JSON from a
  success path of a binary endpoint.
- A failure **never** returns image bytes. Errors are structured JSON. Clients
  use `responseType: 'blob'`, so the frontend must parse Blob errors as text/JSON.
- `X-Target-Met` is truthful. If the encoded output exceeds the requested
  target, report `false` and explain why in `X-Message`; never claim success at
  hitting the target.
- `X-Output-Format` and `Content-Type` describe the **actual** encoder used, not
  the requested one. There are no silent format fallbacks.

---

## 2. Coding conventions

- **Frontend**: function components, hooks, strict TypeScript (`strict`,
  `noUnusedLocals`). No `any` in new code unless unavoidable at an external
  boundary. Styling via Tailwind utility classes and the `brand`/`accent`
  palettes; reuse `components/ui`. Keep existing visual language.
- **Backend**: stdlib + Flask + Pillow + requests. Type hints on public
  functions. Structured logging through `logging`, never `print`.
- **Errors**: backend returns `{"success": false, "error": {"code", "message"}}`
  with a meaningful HTTP status. Messages are user-safe: no stack traces, URLs,
  internal IPs, credentials or DB details.
- **Files**: no new duplication of modules. `app/config/` and `app/models/` are
  packages; there must be exactly one definition of `Config`/dataclasses.
- **Deletion of user work is forbidden.** Preserve unrelated uncommitted
  changes. The canvas-based `/studio` page is intentionally retained user work.
- Do not commit directly to `main` as part of the repair. Leave the diff
  uncommitted unless the maintainer asks for a commit.

---

## 3. Image processing rules (release blockers)

1. A requested target size is a **maximum**. Never report `target_met` for an
   output that exceeds it.
2. Measure the **actual encoded byte length**; never trust estimates.
3. If the target is unattainable, return the smallest valid encoding with
   `target_met=false` and a clear, truthful explanation.
4. Never upscale. Never distort aspect ratio: width/height are **bounds**.
5. Preserve transparency whenever the output format supports alpha (PNG, WebP,
   AVIF). Flatten onto white only for JPEG, and say so.
6. Honour EXIF orientation (`ImageOps.exif_transpose`) before resizing/encoding;
   do not copy EXIF metadata to the output.
7. Reject unsupported input formats and corrupt/truncated files with 4xx.
8. Verify every encoded result by re-decoding it and comparing format/dimensions
   before it is returned.
9. AVIF is optional. If the Pillow build has no AVIF encoder, respond with a
   structured `AVIF_UNSUPPORTED` error (422) — never silently substitute WebP.
10. `ImageFile.LOAD_TRUNCATED_IMAGES` must stay disabled.

---

## 4. Security requirements

- **SSRF**: only `http`/`https`; resolve DNS once and pin the validated IPs for
  the connection; re-validate the host and every redirect hop; block loopback,
  private, link-local, CGNAT, multicast, reserved ranges, IPv6 equivalents and
  IPv4-mapped IPv6. Reject URL credentials. Bound connections/reads with
  timeouts; cap streamed download size; validate magic bytes after download.
- **Never** leak the fetched URL, internal IPs, or exception traces to clients.
- **Secrets**: no secrets in the repo or logs. In `ENV=production` the app
  refuses to start with placeholder `SECRET_KEY`/`JWT_SECRET`. The Supabase
  service-role key is backend-only and must never reach frontend code.
- **AuthZ**: admin routes re-check role server-side on every request. Disabled
  users are rejected. Inputs are validated server-side regardless of the UI.
- **Uploads**: enforce byte size, pixel count (decompression bombs), and actual
  image decoding. Never write uploads to disk.
- **Quotas**: anonymous usage is rate/daily limited; authenticated limits come
  from the plan. Quota state failures must fail closed with 503, not "allow".

---

## 5. Environment configuration

Copy `.env.example` → `.env` (backend) and provide the Vite variables for the
frontend. Never commit either file.

Backend (required in production):
`ENV=production`, `SECRET_KEY`, `JWT_SECRET`, `DATABASE_URL`,
`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`,
`CORS_ORIGINS`, `MAX_UPLOAD_SIZE_MB`, `MAX_OUTPUT_SIZE_MB`, `MAX_PIXELS`.

Frontend: `VITE_API_URL` (defaults to `/api` via the Vite/nginx proxy) and
`VITE_FIREBASE_*` web SDK values (public by design; no server secrets).

Missing `DATABASE_URL`/PostgreSQL is a supported degraded mode for the
optimizer (anonymous quota only). Library/history/admin endpoints return
`503 DATABASE_UNAVAILABLE` instead of inventing data.

---

## 6. Build, test and verification commands

```bash
# Backend
cd backend
.venv/Scripts/python.exe -m pip install -r requirements.txt
.venv/Scripts/python.exe -m pytest tests -v

# Frontend
cd frontend
pnpm install
pnpm exec tsc --noEmit
pnpm build
pnpm test          # vitest (unit/component)
pnpm lint          # eslint

# End-to-end HTTP contract test against a *running* backend (real network).
# Covers the binary/JSON contract, truthful target-size reporting, alpha
# preservation, format honouring, and SSRF rejection.
cd backend && .venv/Scripts/python.exe ../scripts/e2e_smoke.py http://127.0.0.1:5199

# Manual integration (two terminals)
cd backend && .venv/Scripts/python.exe -m flask --app wsgi run --port 5000 --no-reload
cd frontend && pnpm dev                            # http://localhost:3000
```

The production entrypoint is `wsgi:app` (`gunicorn wsgi:app`). `app.py` is
shadowed by the `app/` package, so `gunicorn app:app` cannot work.

The anonymous daily allowance is `FREE_DAILY_OPTIMIZATIONS` (default 5). To
exercise the optimizer manually without exhausting it, start the verification
backend with a raised value, e.g. `FREE_DAILY_OPTIMIZATIONS=200`.

All of the above must be run before a release. Record actual output. Never
report a command as passing without running it; record environment blockers
(no PostgreSQL, no browser, unavailable AVIF, etc.) explicitly.

---

## 7. Release criteria

The build is `READY FOR RELEASE` only when all of the following are verified:

- Upload area visible; click, keyboard and drag-and-drop selection all work.
- Preview shows the real selected file; object URLs are revoked.
- Analyze + optimize succeed without unhandled errors; every loading flag
  recovers on success and failure.
- JPEG/PNG/WebP/AVIF inputs work; available output encoders produce valid files.
- Original-under-target and unreachable-target cases both download a valid image
  with truthful metadata.
- Frontend parses binary success and JSON/blob errors correctly.
- URL optimization works or its blocker is documented; SSRF tests pass.
- TypeScript check and production build pass.
- Backend test suite passes (or documented, non-blocking environment skips).
- No unresolved critical security issue.
- README/changelog match verified behaviour.

Anything short of this is labelled **NOT READY FOR PUBLIC RELEASE**.
