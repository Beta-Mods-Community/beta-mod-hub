# Deploy runbook — betamods.com

Cloud from day one: **Railway** services + **Neon** Postgres + **Cloudflare R2**.
This doc is ordered end-to-end. Steps marked *(me)* I can run from the repo;
steps marked *(you)* need your accounts/dashboards.

## Topology

```
Internet ──► betamods.com ──► Railway app service (:3000, this repo's Dockerfile)
                                    │  runs: next start + scripts/scan-server.mjs (:3311)
                                    │
                                    ├─► SCAN_ENDPOINT=http://localhost:3311
                                    │       └─► clamd on clamav.railway.internal:3310
                                    │              (deploy/clamav image, private network)
                                    │
                                    ├─► DATABASE_URL  (Neon Postgres)
                                    └─► STORAGE_*     (Cloudflare R2, betamods-storage)
```

Uploads are always **quarantine → scan → serve**: quarantine is on the app
instance, the scan goes to the clamd sidecar, and only clean files are
promoted to R2. No dev exception, and no `SCAN_ENDPOINT` means uploads refuse.

## Step 0 — accounts

You need: GitHub, Railway (sign in with GitHub), Neon, and the existing
Cloudflare account (already has betamods.com).

---

## Step 1 — GitHub repo *(you: create — me: push)*

`gh` isn't installed here, so:

1. github.com → **New repository** → name `beta-mod-hub` → **Private** → no README (repo already has one).
2. Tell me the repo URL (e.g. `https://github.com/<you>/beta-mod-hub`). I'll add it as `origin` and push `master`.

---

## Step 2 — Neon Postgres *(you: create — me: schema + seed)*

1. neon.tech → new project (region near your Railway service, e.g. US East) → copy the pooled `DATABASE_URL`.
2. Paste it into the repo's local `.env.local` (replace the dev one) — then tell me, and I'll run `npx drizzle-kit push` to apply the schema.

   Demo seed data is dev-only; a fresh public site starts empty. Skip
   `node scripts/seed-demo.mjs` unless you want a sample mod on launch.

---

## Step 3 — Railway *(you — I'll write exact values here)*

1. **App service** — New Project → Deploy from GitHub repo → `beta-mod-hub`.
   - Railway auto-detects the `Dockerfile`.
   - Settings: **Memory ≥ 1 GB** (the Turbopack build is memory-hungry; can drop to 512 MB after first successful deploy), Healthcheck path `/`.
2. **ClamAV sidecar** — in the same project, add a second service: **Deploy via Docker image**... actually from source: create service pointed at the `deploy/clamav/` folder (its Dockerfile), or use the image `clamav/clamav:stable` directly.
   - Exposed port **3310**, TCP. **Private networking enabled**.
   - Service name `clamav` (this is what makes `clamav.railway.internal` resolve). If you name it differently, override `CLAMD_HOST` on the app service.
   - First boot downloads the ClamAV signature DB (can take minutes) — clamd reports 503 to the scan wrapper until ready, which uploads surface as "scan service unavailable". Graceful, not silent.

3. **Env vars on the app service** — copy the secret values from the repo's
   `.env.local` (never commit them):

   | Variable | Value |
   |---|---|
   | `DATABASE_URL` | Neon pooled URL |
   | `SESSION_SECRET` | random long string (use the one from `.env.local`) |
   | `STORAGE_DRIVER` | `r2` |
   | `STORAGE_ENDPOINT` | `https://<accountid>.r2.cloudflarestorage.com` (from `.env.local`) |
   | `STORAGE_BUCKET` | `betamods-storage` |
   | `STORAGE_ACCESS_KEY` | R2 access key (from `.env.local`) |
   | `STORAGE_SECRET_KEY` | R2 secret (from `.env.local`) |
   | `SCAN_ENDPOINT` | `http://localhost:3311` |
   | `CLAMD_HOST` | `clamav.railway.internal` |
   | `CLAMD_PORT` | `3310` |
   | `SCAN_API_KEY` | optional shared secret for the scan wrapper |
   | `MALWARE_SCAN_API_KEY` | same value as `SCAN_API_KEY` if set (the app sends it; the wrapper checks `SCAN_API_KEY`) |

   Don't ship `NEXUS_PERSONAL_API_KEY` (dev only) or `NEXUS_SSO_*` (set when
   SSO registration lands).

4. Deploy. Verify service logs show `scan server listening` and Next ready.

---

## Step 4 — betamods.com DNS *(you — Cloudflare)*

1. Railway app → Settings → **Domains** → add `betamods.com` (and `www` if you want) → Railway shows a CNAME target like `<app>.up.railway.app`.
2. Cloudflare → DNS for `betamods.com` → add a **CNAME record**:
   - Name: `betamods.com` (root) — Cloudflare may want a `@` record; use `@` → `<app>.up.railway.app`.
   - **Proxy status: DNS only (grey cloud)** — Railway needs to see real origin requests; proxying breaks its TLS/domain verification.
3. Back on Railway, it provisions the cert (HTTPS auto).

---

## Step 5 — verify *(me, once the app is reachable)*

- `GET https://betamods.com/` → 200, public home.
- `GET /browse` / `/mods/<id>` render.
- A real upload through the UI lands in R2 (`betamods-storage`) and files
  download byte-identical; a test with the EICAR string is refused with
  "Upload blocked", and the sidecar's quarantine stays empty.

## Ops notes

- `.dockerignore` excludes `.env*` — secrets never enter the image. All
  secrets come from Railway env vars / Neon.
- If you ever need to re-provision R2 creds, `node scripts/setup-r2.mjs`
  (needs a bootstrap token as `CLOUDFLARE_API_TOKEN` in `.env.local`).
- Local dev still uses `STORAGE_DRIVER=local` + a local clamd + `SCAN_ENDPOINT=http://127.0.0.1:3311`; the deployed app uses R2 + the sidecar. Both paths are covered by `npm run e2e`.