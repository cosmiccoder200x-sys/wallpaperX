# WallpaperX 1.1.0 — Release Report

Date: 2026-10-22
Verdict: **READY FOR RELEASE** for the image-optimization path, with the
limitations in §6 (configuration requirements and environment gaps, not defects).

---

## 0. Deliverables index

Every artifact requested for this release, and where it lives:

| Deliverable | Path | Contents |
| --- | --- | --- |
| Project instructions (written before code was touched) | `instructions.md` | Architecture, API contract, conventions, image rules, security requirements, env config, exact test commands, release criteria. |
| Diagnosed and repaired application code | `backend/app/**`, `frontend/src/**` | 16 root causes fixed in place; see §1 (analysis) and §2 (file-by-file). |
| Regression tests | `backend/tests/` (86), `frontend/src/**/*.test.ts?(x)` (23) | §3. |
| End-to-end verification against a live server | `scripts/e2e_smoke.py` | 38 real-HTTP assertions; run output in §4. |
| Browser verification of the real UI | §5 | 9 scenarios driven through Chromium against the running app. |
| Production entrypoint that can actually start | `backend/wsgi.py` | `gunicorn wsgi:app`; `gunicorn app:app` can never import (R12). |
| Updated README | `README.md` | Correct entrypoint, test/verification commands, degraded-mode behaviour. |
| User-facing changelog | `CHANGELOG.md` | 1.1.0: what was broken for users, what changed, known limitations. |
| Release checklist (deploy, smoke, rollback, monitoring) | `RELEASE_CHECKLIST.md` | Pre-deploy, gate, deploy, 5-minute post-deploy smoke list, rollback, monitoring. |
| Final verdict | §6 and this header | `READY FOR RELEASE` for the optimizer path, conditional on the configuration in §6. |

---

## 1. Root-cause analysis of confirmed issues

### R1 — Upload area was permanently invisible (release blocker)
`UploadArea`'s callback ref assigned `display: none` to the container it was
handed, so the drop zone never rendered. Nothing else on the page could be used
because file selection was the only entry point. **Fix:** removed the style
mutation; selection now goes through a single hidden input opened by one
explicit `openPicker()` handler, with keyboard activation and no nested
click handlers.

### R2 — Preview was not the user's image
The preview was derived from analysis metadata rather than the selected `File`,
so the panel showed a placeholder/incorrect image and never reflected the actual
upload. **Fix:** previews are `URL.createObjectURL(selectedFile)` values held in
state, revoked on file change and unmount.

### R3 — Selected file was read from the DOM
`Optimizer.tsx` called `document.querySelector('input[type="file"]')` to recover
the file at optimize time. Any re-render that reset the input (or a second
upload) desynchronised the visible card from what would be sent. **Fix:** the
`File` lives in React state; the input is only a picker.

### R4 — Loading flags leaked on early returns
Several early-return paths in the analyze/optimize handlers returned before
clearing `isAnalyzing` / `isOptimizing`, leaving a permanent spinner. **Fix:**
every path clears its flag in `finally`; loading state is also gated on an
in-flight request counter so a late response cannot clear a newer request.

### R5 — Stale results and races
Changing target size, format, or resolution kept the previous result on screen,
and a slow earlier response could overwrite a newer selection. **Fix:** settings
changes clear the result; requests carry a monotonically increasing id and only
the newest may commit.

### R6 — API contract split: JSON vs binary (release blocker)
`/api/optimize/optimize` returned an image for real optimization but JSON for
the "already small enough" early return, while the frontend called it with
`responseType: 'blob'`. Users got a `.jpg` download containing JSON, and Axios
error bodies (JSON) were parsed as blobs, hiding real error messages.
**Fix:** one contract — success is always a valid image with
`Content-Type`, `Content-Disposition`, and `X-*` metadata headers; failure is
always structured JSON with a non-2xx status. The frontend reads blob responses
as text first and only then decodes JSON errors, so `RATE_LIMITED`,
`QUOTA_EXCEEDED`, and validation errors surface as messages.

### R7 — Target size reported, not measured
The route could claim a target was met while the encoded output exceeded it.
**Fix:** the optimizer verifies the encoded byte length, sets `X-Target-Met`
from that measurement, and when a target is unreachable it returns a truthful
result with an explanation instead of silently overshooting.

### R8 — Resizing distorted or upscaled images
Width/height were applied as exact dimensions. **Fix:** they are upper bounds;
`_fit_size` preserves aspect ratio and refuses to enlarge; Lanczos resampling.

### R9 — Requested output format could be replaced
A JPEG request could come back as WebP. **Fix:** an explicitly requested format
is honoured or the request fails with `*_UNSUPPORTED`; `AUTO` remains the only
"server chooses" mode, and the chosen format is reported in the UI and filename.

### R10 — Transparency and mode handling
Palette, `LA`, `RGBA`, and grayscale inputs could lose alpha or crash the
encoder on format conversion. **Fix:** `_prepare_mode` normalises per target
format (alpha-capable → `RGBA`, JPEG → `RGB` on white), verified by decoding the
downloaded PNG and asserting a transparent pixel stays transparent.

### R11 — SSRF in URL optimization
The fetcher followed redirects blindly and did not validate the resolved
address, allowing `file:`/`javascript:` schemes and loopback, private,
link-local, and cloud-metadata targets. **Fix:** scheme allow-list, DNS
resolution plus address-class checks, per-redirect revalidation, connect/read
timeouts, streamed size cap, magic-byte image validation, and generic error
text ("Access to this address is not allowed") so internal hosts never leak.

### R12 — `gunicorn app:app` could never start
`app.py` is shadowed by the `app/` package, so the documented production command
imported the wrong thing. **Fix:** new `wsgi.py` exposing `app`; docs and
checklist use `gunicorn wsgi:app`. A test imports it in a clean interpreter.

### R13 — Plan limits were hardcoded while config declared them
`FREE_DAILY_OPTIMIZATIONS`, `FREE_MAX_INPUT_MB`, `FREE_MAX_OUTPUT_MB`, and the
`PRO_*` counterparts were defined and documented but never read; quotas came
from constants. **Fix:** limits come from configuration (defaults unchanged:
5/day, 25 MB in, 10 MB out; Pro 100/50).

### R14 — Duplicate shadowed modules
`app/config.py` and `app/models.py` were byte-identical copies of the packages
that shadow them, so edits to one had no effect. **Fix:** removed; the packages
are the single definition.

### R15 — React fast-refresh warning / lint gate
`useAuth.tsx` exported both a provider component and a hook. **Fix:** context +
hook moved to `hooks/useAuth.ts`, provider to `hooks/AuthProvider.tsx`; lint is
now clean at `--max-warnings 0` rather than suppressed.

### R16 — Service worker served stale shells
The cache-first shell strategy kept serving an old app after deploys. **Fix:**
versioned cache, network-first navigations with cached-shell fallback, cache-first
only for hashed assets, and API/cross-origin requests never cached.

---

## 2. Changed files

Backend

| File | Change |
| --- | --- |
| `backend/wsgi.py` (new) | Real WSGI entrypoint (`gunicorn wsgi:app`). |
| `backend/app/factory.py` (new) | App factory: config validation, CORS, blueprint registration, safe DB-failure handling. |
| `backend/app/__init__.py` | Re-exports `create_app`. |
| `backend/app/config.py`, `backend/app/models.py` | Deleted (shadowed duplicates). |
| `backend/app/config/settings.py` | Env-driven config, placeholder-secret rejection, production guards. |
| `backend/app/models/models.py` | Plan limits sourced from config; format/MIME/error models. |
| `backend/app/routes/optimize.py` | Single image/JSON contract, measured target reporting, param validation, quota wiring. |
| `backend/app/services/image_optimizer.py` | Format honouring, upper-bound resizing, alpha/mode handling, verified encodings, truthful target messages. |
| `backend/app/services/url_fetcher.py` | SSRF hardening, redirect revalidation, timeouts, size cap, byte validation. |
| `backend/app/services/quota.py` (new) | Per-minute burst + daily allowance tracking, fail-closed on DB outage. |
| `backend/app/services/auth.py`, `routes/auth.py`, `routes/admin.py`, `routes/wallpapers.py`, `services/database.py`, `app.py` | Auth/session handling, admin authorization, DB error mapping, no fake data, entrypoint fix. |
| `backend/tests/**` (new) | 86 tests across optimizer, API contract, URL security, quota, config/entrypoints. |
| `backend/pytest.ini`, `backend/requirements-dev.txt` (new) | Test configuration and dev dependencies. |

Frontend

| File | Change |
| --- | --- |
| `src/components/optimizer/UploadArea.tsx` | Removed `display:none` ref hack, single click/keyboard/drag-drop path, validation errors, busy guards. |
| `src/pages/Optimizer.tsx` | File in state, blob preview + revocation, request ids, loading cleanup, result invalidation, URL mode. |
| `src/services/api.ts` | One response contract, blob-vs-JSON error parsing, accurate filenames/MIME. |
| `src/components/optimizer/Comparison.tsx` | Real before/after blobs, truthful deltas, larger-than-original handling, download naming. |
| `src/components/optimizer/UrlInput.tsx`, `OptimizationControls.tsx` | Accessible URL entry and settings; bounds not targets. |
| `src/utils/validateFile.ts` (new) | Shared client-side file validation. |
| `src/utils/format.ts` | Size/percentage/dimension formatting. |
| `src/types/index.ts` | Types match the API contract. |
| `src/hooks/useAuth.ts` + `AuthProvider.tsx` | Split for fast refresh and correctness (token handling, logout). |
| `src/App.tsx` | Routing/auth wiring. |
| `src/pages/Login.tsx`, `Register.tsx`, `Wallpapers.tsx`, `WallpaperDetail.tsx`, `AdminDashboard.tsx` | Error handling, request-cancellation guards, download safety. |
| `src/pages/Studio.tsx` (new, untracked pre-existing user file) | Left as found. |
| `public/sw.js` | Versioned cache, network-first navigations, no API caching. |
| `vite.config.ts` | Dev proxy, sourcemap off, deterministic chunking. |
| `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml` | Test/lint scripts, vitest + jsdom + testing-library. |
| `.eslintrc.cjs`, `vitest.config.ts`, `src/test/setup.ts` (new) | Lint and test tooling. |
| `*.test.ts(x)` (new, 3 files) | 23 frontend tests. |

Root

| File | Change |
| --- | --- |
| `instructions.md` (new) | Architecture, conventions, security rules, commands, release criteria. |
| `CHANGELOG.md` (new) | User-facing changelog. |
| `RELEASE_CHECKLIST.md` (new) | Deploy, smoke, rollback, monitoring. |
| `RELEASE_REPORT.md` (new) | This report. |
| `scripts/e2e_smoke.py` (new) | Real-HTTP contract test. |

No credentials were added; `.env` values were never printed.

---

## 3. Tests added

**Backend (86 tests, `backend/tests/`)**
- `test_image_optimizer.py` — analysis for JPEG/PNG/WebP/AVIF, mode/alpha handling,
  upper-bound resize, no-upscale, JPEG/PNG/WebP/AVIF encodes, already-under-target,
  unattainable target truthfulness, corrupt/truncated/mislabeled files, tiny and
  large images, invalid resolution/format values.
- `test_api_optimize.py` — binary success vs JSON error, MIME/filename/size/dimension
  headers, empty upload, oversized upload, excessive dimensions, quota responses.
- `test_url_fetcher.py` — scheme rejection, loopback/private/link-local/metadata
  blocking, redirect revalidation, timeout, size cap, non-image content, error hygiene.
- `test_auth_quota.py` — token round trip, expiry, anonymous vs authenticated limits,
  fail-closed on DB outage.
- `test_config_and_entrypoints.py` — `wsgi:app` import (in-process and clean
  subprocess), config-driven plan limits, production rejects placeholder/empty secrets.

**Frontend (23 tests, vitest + jsdom + Testing Library)**
- `UploadArea.test.tsx` — picker selection, drag/drop, keyboard, rejection messages,
  busy guard, removal.
- `services/api.test.ts` — binary success, JSON error over `responseType: 'blob'`,
  quota error, filename/MIME extraction.
- `pages/Optimizer.test.tsx` — real preview URL, analysis success/failure, loading
  cleanup, already-under-target flow, settings invalidation, URL optimization,
  rejected URL schemes.

**End-to-end HTTP (`scripts/e2e_smoke.py`)** — 38 assertions against a live server:
analyze dimensions, already-under-target returns an image, decode checks, no upscale,
`X-Optimized-Size` matches the body, target claim matches measured size, alpha
preservation, WebP/AVIF output, filename/format agreement, structured errors, and
five SSRF rejections with no internal address echo.

---

## 4. Commands executed and results

| Command | Result |
| --- | --- |
| `cd backend && .venv/Scripts/python.exe -m pytest tests -q` | **86 passed**, 4 warnings (short test JWT keys) in 37.8s (run twice; final run after the last code change) |
| `cd frontend && pnpm exec tsc --noEmit` | **exit 0**, no output |
| `cd frontend && pnpm lint` | **exit 0**, 0 errors, 0 warnings |
| `cd frontend && pnpm test` | **23 passed** (3 files), exit 0 |
| `cd frontend && pnpm build` | **exit 0**, built in 11.96s (1507 modules) |
| `python scripts/e2e_smoke.py http://127.0.0.1:5199` | **38/38 checks passed** (run twice, reproducible) |
| Browser journey (Chromium, `localhost:3100` → backend `127.0.0.1:5199`) | see §5 |

### Browser-verified scenarios (real UI, real network)

1. **JPEG upload → optimize → download.** 523.3 KB → 119.6 KB at 1620×1080,
   JPEG, "Target met: 119.6 KB ≤ 120 KB"; both comparison blobs decoded as valid
   JPEGs (original 535,878 B; optimized 122,468 B ≤ 122,880 B budget).
2. **Already under target.** 495.7 KB file with a 10 MB target: image returned
   (not JSON), "0.0% smaller", download decodes as a 2400×1600 JPEG.
3. **Transparent PNG, PNG output.** Corner pixel alpha 0, centre alpha 255 after
   download — transparency preserved; 20.8 KB → 9.6 KB.
4. **Invalid file.** `broken.jpg` (text bytes) → "Unsupported image format. Use
   JPG, PNG, WebP, or AVIF.", no optimize action offered, metadata shown as em
   dashes; selecting a valid file afterwards clears the error and re-enables
   optimization.
5. **Settings change after optimization.** Changing target/format/resolution
   cleared the previous result before the next run.
6. **URL optimization.** `https://httpbin.org/image/jpeg` → optimization
   completed with correct before/after; a lossless PNG conversion that grew the
   file was labelled "73.1 KB larger / No bytes saved" (honest reporting).
7. **Invalid/SSRF URLs.** `http://127.0.0.1:5199/...`, `file:///etc/passwd`, and a
   malformed URL all produced "Access to this address is not allowed" with no
   internal address in the message.
8. **Backend outage and recovery.** With the file analyzed, the backend was
   stopped and Optimize clicked: `net::ERR_CONNECTION_REFUSED` surfaced as
   "Could not reach the server. Check your connection and try again." within 2.5s,
   the spinner stopped, and the button re-enabled. After restarting the backend,
   the same click returned 200, the stale error cleared, and a valid result
   rendered (6.2 KB passthrough under the 120 KB target).
9. **Console/network.** No unhandled console errors; the only failed request in
   the whole session is the deliberate `ERR_CONNECTION_REFUSED` above. Remaining
   warnings are expected (Firebase not configured, React Router v7 future flags).

---

## 5. Pass/fail by acceptance criterion

| Criterion | Status | Evidence |
| --- | --- | --- |
| Upload area visible and functional | PASS | Snapshot shows drop zone; click/keyboard/drop handlers tested |
| File selection and drag-and-drop | PASS | `UploadArea.test.tsx`; browser file input journey |
| Preview shows the actual uploaded image | PASS | `img.src` is a `blob:` URL, natural size 2400×1600 |
| Analyze + optimize without unhandled exceptions | PASS | Backend suite + browser runs; no 5xx |
| Supported formats produce valid files | PASS | JPEG/PNG/WebP/AVIF decoded from returned bytes |
| Download works when compression occurs and when target is already met | PASS | Both journeys decoded valid images |
| Frontend handles binary responses and structured errors | PASS | `api.test.ts` + live 429/error paths |
| URL optimization secure | PASS | 5 SSRF cases rejected; public URL succeeds |
| Loading indicators always recover | PASS | Invalid-file journey, tests, and live backend-outage recovery |
| Type check and production build | PASS | exit 0 both |
| Backend tests | PASS | 86/86 |
| No known critical security issue | PASS | SSRF closed, secrets validated, no secret leakage found in diff |
| README/changelog accurate | PASS | `CHANGELOG.md`, `RELEASE_CHECKLIST.md`, `instructions.md` |

---

## 6. Limitations and required configuration

1. **Sign-in not exercised live.** Firebase is not configured in this checkout
   (`VITE_FIREBASE_*` unset), so auth ran in the supported anonymous mode. The
   auth code paths are unit-tested; a signed-in end-to-end run requires Firebase
   project credentials.
2. **Database unavailable in this environment.** `DATABASE_URL` did not
   initialise (logged `Database initialization skipped: DatabaseUnavailable`).
   Optimizer and quota paths degrade safely; library/history/admin return `503`.
   Seeding and admin journeys could not be verified against live data.
3. **No automated browser harness.** Playwright is not a dependency; the browser
   journey was executed manually through the app's Chromium preview and recorded
   above. Screenshot capture failed (webview produced no frames), so the evidence
   is DOM/network assertions rather than images.
4. **AVIF support depends on the host's Pillow build.** It worked here; the code
   returns `AVIF_UNSUPPORTED` rather than silently substituting another format.
5. **Anonymous quotas are per worker** (in-process). Use a shared store for
   strict global limits with multiple workers.
6. **`pnpm-lock.yaml` and `pnpm-workspace.yaml`** were updated when test
   dependencies were added; `pnpm install` is required on a fresh clone.

### Outstanding manual action

Set production `SECRET_KEY`, `JWT_SECRET`, `DATABASE_URL`, `CORS_ORIGINS`, and
the `VITE_FIREBASE_*` values, then run the post-deploy smoke list in
`RELEASE_CHECKLIST.md` against the deployed origin.
