# Changelog

All notable changes to WallpaperX. This release is the first one verified
end-to-end against a running backend and a real browser.

## [1.1.0] — 2026-10-22

### Fixed — the optimizer actually works again

- **The upload area was invisible.** Its callback ref set `display: none` on the
  drop zone, so the first thing every user saw was a blank panel. The drop zone
  renders, is keyboard-focusable, and accepts click, Enter/Space, and drag/drop.
- **The preview showed metadata, not your image.** Previews are now built from
  the real selected `File` via `URL.createObjectURL`, and the object URL is
  revoked when you choose another file or leave the page. No more memory growth
  after repeated uploads.
- **Files were read out of the DOM.** The page no longer scrapes
  `document.querySelector('input[type="file"]')` to find your file; the selected
  file lives in React state. Ready-to-optimize state can no longer disagree with
  what is on screen.
- **Spinners could spin forever.** Every failure path now clears its loading
  flag, so a rejected file, a dead network, or a server error always ends in a
  visible message instead of a stuck button.
- **Stale results could be mistaken for current ones.** Changing the target
  size, format, or resolution after optimizing clears the previous result; late
  responses from an earlier request can no longer overwrite a newer selection.
- **An image that already met the target returned JSON to a consumer that
  expected a file.** Both paths now return an image with `Content-Type`,
  `Content-Disposition`, and the same metadata headers, so downloads work in
  both cases. Errors are always structured JSON with a proper status code, and
  are no longer mistaken for an image.
- **Compression told the truth.** The reported output size is the size of the
  bytes actually returned, `X-Target-Met` matches reality, and a target that
  cannot be reached is reported as missed with an explanation instead of being
  silently exceeded.
- **No silent resizes.** Width/height are treated as upper bounds, aspect ratio
  is preserved, and images are never upscaled or stretched. Requesting the same
  format is honoured (a JPEG request returns a JPEG, not a WebP).
- **Transparency survives.** PNG/WebP/AVIF output keeps the alpha channel;
  verified by decoding the downloaded file and checking the alpha of a
  transparent pixel.
- **Downloads match the file.** The suggested filename extension follows the
  actual encoded format (`*-optimized.webp` for WebP output).
- **Larger-than-original results are labelled honestly** ("73.1 KB larger",
  "No bytes saved") rather than being presented as a win.

### Fixed — URL optimization

- Only `http`/`https` are accepted; `file:`, `javascript:`, and malformed URLs
  are rejected.
- Loopback, private, link-local, and cloud-metadata addresses are refused, with
  every redirect revalidated so a public URL cannot bounce to an internal one.
- DNS is resolved and checked before connecting, with connect/read timeouts and
  a streamed maximum download size.
- The downloaded bytes are decoded as an image; a 200 response with HTML is not
  treated as a wallpaper.
- Error messages stay generic ("Access to this address is not allowed") so
  internal hostnames and IPs never leak to the user.

### Fixed — deployment and configuration

- **`gunicorn app:app` could never have worked.** `app.py` is shadowed by the
  `app/` package. A real `wsgi.py` entrypoint now exists; deploy with
  `gunicorn wsgi:app`.
- **Plan limits were hardcoded** while the documented `FREE_*`/`PRO_*`
  environment variables were ignored. Quotas and size ceilings now come from
  configuration, with unchanged defaults.
- Production refuses to boot with placeholder or empty `SECRET_KEY`/`JWT_SECRET`.
- Duplicate `app/config.py` and `app/models.py` modules (byte-identical to the
  packages that shadowed them) were removed so only one definition is in effect.
- The service worker no longer serves stale app shells over a freshly deployed
  build.
- Authentication context/hook were split so the app fast-refreshes correctly,
  and the frontend now lints clean with zero warnings.

### Added

- Backend test suite (86 tests): image analysis and optimization for every
  supported format, alpha handling, already-under-target, unattainable targets,
  invalid/empty/oversized uploads, JSON-vs-binary contract, URL/SSRF rules,
  quota behaviour, config/entrypoint/secret checks.
- Frontend test suite (23 tests): file picker and drag/drop, preview generation,
  analysis failure and loading cleanup, blob error parsing, quota errors,
  settings-change invalidation, and URL optimization.
- `scripts/e2e_smoke.py`: a real-HTTP contract test for a running backend.
- ESLint configuration and `pnpm lint` / `pnpm test` scripts.

### Known limitations

- Sign-in requires Firebase (`VITE_FIREBASE_*`); without it the optimizer is
  anonymous-only, which is a supported mode.
- Library/history/admin endpoints need PostgreSQL; without `DATABASE_URL` they
  return `503 DATABASE_UNAVAILABLE` rather than inventing data.
- Anonymous daily quotas are tracked per worker in memory; use a shared store
  for strict global limits across multiple workers.
