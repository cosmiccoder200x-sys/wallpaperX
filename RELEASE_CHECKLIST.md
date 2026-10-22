# Release Checklist — WallpaperX 1.1.0

Verified build: **READY FOR RELEASE** for the optimizer path.
See `RELEASE_REPORT.md` for the exact commands, outputs, and limitations.

## Pre-deploy

- [ ] Set `ENV=production`.
- [ ] Set `SECRET_KEY` and `JWT_SECRET` to fresh 32+ byte random values.
      The app refuses to start with placeholders or empty values.
- [ ] Set `DATABASE_URL` (PostgreSQL). Without it the library, history, and admin
      endpoints return `503` by design — deploy with it for a complete product.
- [ ] Set `CORS_ORIGINS` to the exact production frontend origin(s). Do not use `*`.
- [ ] Keep `SUPABASE_SERVICE_ROLE_KEY` server-side only. It must never appear in
      `VITE_*` variables or in the frontend bundle.
- [ ] Confirm the frontend build was produced with the intended `VITE_API_URL`.
- [ ] Verify `MAX_UPLOAD_SIZE_MB`, `MAX_OUTPUT_SIZE_MB`, `MAX_PIXELS`, and
      `FREE_DAILY_OPTIMIZATIONS` match the plan you sell.

## Build and test gate (all must be green)

```bash
cd backend && .venv/Scripts/python.exe -m pytest tests -q      # 86 passed
cd frontend && pnpm exec tsc --noEmit                          # clean
cd frontend && pnpm lint                                       # 0 errors, 0 warnings
cd frontend && pnpm test                                       # 23 passed
cd frontend && pnpm build                                      # succeeds
```

Then, against a running backend:

```bash
python scripts/e2e_smoke.py http://<host>:<port>               # 38/38 checks
```

## Deploy

- [ ] Serve the app with `gunicorn -w 4 wsgi:app` (not `app:app` — that is
      shadowed by the `app/` package).
- [ ] Serve the built `frontend/dist` behind the same origin (or a configured
      `VITE_API_URL`), with `/api` proxied to the backend.
- [ ] Ensure the reverse proxy allows at least the configured upload size.
- [ ] Ensure the deployment terminates TLS; `X-Forwarded-*` handling requires
      `TRUST_PROXY=1` behind a proxy so client IPs (and quotas) are correct.
- [ ] If you run more than one worker, remember anonymous quotas are per-worker.

## Post-deploy smoke tests (manual, 5 minutes)

1. Open `/optimizer`. The drop zone is visible with a "Drop wallpaper here" label.
2. Upload a JPEG over the smallest preset; the preview shows your actual image
   with its real dimensions and size.
3. Optimize; the report shows a smaller size, a real percentage, and a working
   download whose format matches the label.
4. Upload an image smaller than the target; the download still works and the
   report says the original already met the target.
5. Upload a transparent PNG with PNG output; the downloaded file keeps its
   transparency.
6. Paste an `http://127.0.0.1/...` URL; expect "Access to this address is not
   allowed" and no internal address in the message.
7. Check the browser console: no errors, and no request to an unintended origin.

## Rollback

- [ ] Keep the previous release artifact and its `VITE_*` build available.
- [ ] Roll back by redeploying the previous frontend build and backend image
      together; the API contract changed in 1.1.0 (JSON→image for the
      already-under-target case), so do not mix a new frontend with an old
      backend.
- [ ] The service worker caches assets; after a rollback, users may need one
      reload for the new bundle to take over.
- [ ] No database migration is included in this release, so rollback carries no
      schema risk.

## Monitoring

- [ ] Alert on `5xx` rate for `/api/optimize/*` and on p95 latency above 5s.
- [ ] Alert on `QUOTA_UNAVAILABLE` responses — this means the database is
      unreachable and authenticated users are being blocked.
- [ ] Watch the ratio of `X-Target-Met: false` responses; a sudden jump means
      the target presets are unrealistic for typical inputs.
- [ ] Watch upload-rejection codes (`FILE_TOO_LARGE`, `DIMENSIONS_EXCEEDED`,
      `INVALID_IMAGE`) for signs of a bad client build or abuse.
- [ ] Log `RATE_LIMITED` / `QUOTA_EXCEEDED` volume per IP.
