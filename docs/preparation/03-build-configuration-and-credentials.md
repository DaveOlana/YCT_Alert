# YCT Alert — Build Configuration and Credentials Inventory

**Date:** 2026-11-07
**Scope:** YCT Alert repository at `C:\Users\HP\Documents\YCT Alert`
**Status:** Documentation only. **No secret values were read, printed, or changed.**

---

## 1. Method and safety boundaries

- Inspected configuration source, package manifests, `.env.example` templates and architecture docs.
- **Did not read** any `.env`, private key, token, keystore or secret-bearing file.
- **Did not create** credentials or connect to any database or external service.
- **Did not modify** `.env.example` or any S1 implementation file.
- Values below are **placeholder names and purposes only**. Never put real values in this document.

> The existing `.env.example` files contain development placeholders (for example a local-only database username/password and "change-me" secrets). These are **not production credentials** and must never be reused outside a disposable local environment.

---

## 2. Authoritative configuration sources

| Source | What it defines |
|---|---|
| `services/api/src/config.ts` | Zod-validated API environment schema |
| `.env.example` (repo root) | Root template, including planned storage and frontend values |
| `services/api/.env.example` | API-focused template |
| `apps/public/.env.example` | Public web build-time `VITE_API_URL` |
| `apps/admin/.env.example` | Admin web build-time `VITE_API_URL` |
| `apps/public/capacitor.config.ts` | Capacitor app ID, web directory, Android scheme |
| `docs/blueprint/15_ENVIRONMENTS_AND_RELEASE.md` | Environment policy and illustrative secret names |

**Canonical naming rule:** where documentation and code disagree, the actual code/config names in this repository are canonical. `15_ENVIRONMENTS_AND_RELEASE.md` uses illustrative aliases such as `APP_ENV`, `ALERT_DATABASE_URL`, `ALERT_PUBLIC_BASE_URL`; these are **not** the implemented names.

---

## 3. Variable inventory

Legend for **Status**:

- **Active** — read by current code.
- **Validated only** — accepted/validated by config but not yet consumed by a feature.
- **Planned** — required by an approved later milestone but not yet implemented.
- **Template-only** — present in `.env.example` but not referenced by code yet.

| Variable | Purpose | Required? | Applies to | Origin of value | Notes / status |
|---|---|---|---|---|---|
| `NODE_ENV` | Selects `development` / `test` / `production` behaviour; controls API logging and whether the server auto-starts | Required (defaults to `development`) | DEV, TEST, PROD | Deployment environment; local shell/`.env` | **Active.** Zod enum. `test` silences logging and prevents auto-start. |
| `API_PORT` | Fastify listen port | Optional (default `4000`) | DEV, TEST, PROD | Hosting platform / local `.env` | **Active.** Coerced number. |
| `API_HOST` | Fastify bind address | Optional (default `127.0.0.1`) | DEV, TEST, PROD | Hosting platform | **Active.** Production containers usually need `0.0.0.0`; confirm per host. |
| `API_PUBLIC_URL` | Public base URL used in startup log messages | Optional (default `http://localhost:4000`) | DEV, TEST, PROD | Environment config | **Active (logging only).** Must match the real public origin in production. |
| `DATABASE_URL` | Primary Alert PostgreSQL connection | **Required for any real persistence** | DEV, TEST, PROD | Local PostgreSQL (DEV), CI service (TEST), hosting secret manager (PROD) | **Validated only.** No DB client/driver is installed yet; no migration code exists. Fallback to a localhost dev URL when unset — see risk R-01. |
| `TEST_DATABASE_URL` | Isolated test database | Required for DB-backed tests | TEST | CI secret store / ephemeral PostgreSQL | **Validated only.** Referenced by config and safeguard tests; no DB tests exist yet. |
| `STORAGE_DRIVER` | Selects `local` or `s3` storage adapter | Optional (default `local`) | DEV, TEST, PROD | Environment config | **Validated only.** Storage abstraction not yet implemented (approved D-11). |
| `LOCAL_STORAGE_DIR` | Local media upload directory | Optional (default `./tmp/media_uploads`) | DEV, TEST | Local environment | **Validated only.** `tmp/` is Git-ignored. |
| `YCT_MAP_BASE_URL` | Upstream YCT Map geography API base | Optional (default `https://yct-map.onrender.com`) | DEV, TEST, PROD (G3) | Environment config; owner-confirmed URL | **Validated only.** Geography sync not yet implemented. Default is unverified — see the API investigation report. |
| `GEOGRAPHY_SYNC_INTERVAL_MINUTES` | Polling cadence for Map geography | Optional (default `15`) | DEV, TEST, PROD (G3) | Environment config | **Validated only.** Approved decision D-08. |
| `ADMIN_SESSION_SECRET` | Server-side admin session signing/entropy | **Required in production** | DEV, TEST, PROD | CSPRNG-generated secret; hosting secret manager | **Validated only.** Zod minimum 16 chars, but a hard-coded development default exists — see risk R-02. |
| `ADMIN_BOOTSTRAP_SECRET` | One-time `ALERTadmin` bootstrap token | **Required only during bootstrap** | DEV, TEST, pilot/PROD bootstrap | Generated once; injected outside CI logs; destroyed after use | **Validated only.** Zod minimum 8 chars, with a development default — see risk R-02. |
| `STORAGE_S3_ENDPOINT` | S3-compatible endpoint (R2/MinIO/AWS) | Required when `STORAGE_DRIVER=s3` | Pilot/PROD | Storage provider console | **Planned / template-only.** Present in root `.env.example`; **not** in `config.ts` yet. |
| `STORAGE_S3_REGION` | S3 region (often `auto`) | Required when `STORAGE_DRIVER=s3` | Pilot/PROD | Storage provider console | **Planned / template-only.** |
| `STORAGE_S3_BUCKET` | Private media bucket name | Required when `STORAGE_DRIVER=s3` | Pilot/PROD | Storage provider console | **Planned / template-only.** Non-secret, but bucket must stay private. |
| `STORAGE_S3_ACCESS_KEY_ID` | Storage access key ID | Required when `STORAGE_DRIVER=s3` | Pilot/PROD | Storage provider console / secret manager | **Planned / template-only.** Secret. |
| `STORAGE_S3_SECRET_ACCESS_KEY` | Storage secret access key | Required when `STORAGE_DRIVER=s3` | Pilot/PROD | Storage provider console / secret manager | **Planned / template-only.** Secret. |
| `VITE_API_URL` | API base URL baked into public/admin frontend builds | Required for S2 onward | DEV, TEST, pilot, PROD builds | Build environment (public value) | **Template-only.** Declared in both app templates, not yet referenced in source; S2 will consume it. **Never put secrets in a `VITE_*` variable** — they are embedded in the client bundle. |

---

## 4. Credentials inventory (names and custody only)

| Credential | Used by | Where it must originate | Storage rule |
|---|---|---|---|
| Development database username/password | API DEV | Developer's local PostgreSQL | Local `.env` only; disposable; never reused in TEST/PROD |
| Test database username/password | API TEST/CI | CI secret store or ephemeral DB service | Injected at test runtime; never committed |
| Production database URL (includes credentials) | API PROD | Managed PostgreSQL provider (separate from YCT Map) | Hosting secret manager; least-privilege user; rotation plan required |
| S3/R2 access key ID and secret | Media storage (planned) | Object-storage provider | Secret manager; private bucket; no public read |
| `ADMIN_SESSION_SECRET` | Admin session integrity | Generated with a CSPRNG | Secret manager; per-environment unique; rotate on suspicion |
| `ADMIN_BOOTSTRAP_SECRET` | One-time super-admin bootstrap | Generated once by owner/operator | One-time injection; revoke/destroy immediately after bootstrap |
| Android signing keystore + passwords | G5 distribution (future) | Owner-controlled custody | **Outside the repository.** Never in Git, CI logs, or `.env.example`. |

**No YCT Map API key is required.** The inspected public endpoints do not use API keys. Any future Map-side authentication is an owner decision.

**No credentials are currently created or provisioned by this assignment.**

---

## 5. Environment separation

| Environment | Database | Secrets | Allowed data |
|---|---|---|---|
| DEV | Disposable local PostgreSQL (`yct_alert_dev`) | Local `.env`, developer-owned | Synthetic only |
| TEST/CI | Isolated `yct_alert_test` or ephemeral | CI secret store | Synthetic only |
| STAGING/PILOT | Separate managed PostgreSQL | Hosting secret manager | Restricted supervised data, owner-authorised |
| PRODUCTION | Separate managed PostgreSQL | Hosting secret manager + audited access | Real users only after policy/ops signoff |

The database safeguard in `services/api/src/config.ts` rejects URLs containing `yct_postgres`, `yctmap`, or `yct_map` (case-insensitive). This is a **hard boundary** protecting YCT Map's databases.

---

## 6. Secure configuration instructions

1. **Never commit real environment files.** `.gitignore` already excludes `.env`, `.env.local`, `*.local`, `tmp/`, `dist/`, logs and `node_modules/`.
2. **Copy, do not invent.** Create a local `.env` from `.env.example`, then replace placeholders. Keep `.env.example` placeholder-only.
3. **Use a CSPRNG** for `ADMIN_SESSION_SECRET` and `ADMIN_BOOTSTRAP_SECRET`. Recommended length: at least 32 random bytes (64 hex characters), even though the current Zod minimum is lower.
4. **Never prefix a secret with `VITE_`.** Anything exposed to Vite is public in the browser and Android bundle.
5. **Inject production secrets at deploy time** through the hosting provider's secret manager. Do not bake them into images, APKs, static builds, shell history, or CI logs.
6. **Use separate credentials per environment.** Never reuse the development database user in staging or production.
7. **Apply least privilege.** The API database user should own only the Alert schema/database.
8. **Keep the media bucket private.** Public delivery must be proxied and gated by moderation, not by bucket ACLs.
9. **Destroy the bootstrap secret after use.** Bootstrap must not remain a permanent shared password.
10. **Redact logs and terminals.** Print only environment labels/hostnames. Do not echo connection strings, tokens or key material.
11. **Rotate immediately** if a secret appears in Git history, a screenshot, a log, a build artifact or a chat message.
12. **Verify before commit** that `.env.example` contains placeholders only.

---

## 7. Why `.env.example` was not modified

No `.env.example` change was made in this pass because:

- The root template already lists every currently implemented and planned variable name.
- `services/api/.env.example` omits the planned `STORAGE_S3_*` names and `VITE_API_URL`, but editing it would alter the accepted S1 scaffolding, which this assignment explicitly forbids.
- The gap is documented below as a proposed, separately authorised change.

**Proposed future alignment (not applied):**

- Add `STORAGE_S3_*` placeholders to `services/api/.env.example` when the storage adapter is implemented.
- Add `VITE_API_URL` to the relevant app template when S2 consumes it.
- Consider validating the S3 variables in `config.ts` only when `STORAGE_DRIVER=s3`.
- Consider making `DATABASE_URL`, `ADMIN_SESSION_SECRET` and `ADMIN_BOOTSTRAP_SECRET` fail fast when `NODE_ENV=production`.

---

## 8. Findings and risks

| ID | Finding | Severity | Recommendation |
|---|---|---|---|
| R-01 | `DATABASE_URL` silently falls back to a localhost dev URL when unset, regardless of `NODE_ENV`. | High | Require an explicit URL in production; fail fast. |
| R-02 | `ADMIN_SESSION_SECRET` and `ADMIN_BOOTSTRAP_SECRET` have hard-coded development defaults and no production guard. | High | Reject defaults when `NODE_ENV=production`; require strong values. |
| R-03 | No database driver (`pg`/ORM) is installed yet; DB variables are validated but unused. | Medium | Expected for S1; do not assume persistence works. |
| R-04 | `API_HOST` defaults to `127.0.0.1`; a container may be unreachable. | Medium | Set `0.0.0.0` in hosted environments. |
| R-05 | CORS origins are hard-coded in `services/api/src/app.ts`, not env-driven. | Medium | Externalise and restrict per environment before pilot. |
| R-06 | `VITE_API_URL` is templated but unused; S2 must wire it correctly. | Low | Confirm at S2 review. |
| R-07 | Root and per-workspace `.env.example` files differ. | Low | Reconcile under a separately authorised change. |
| R-08 | Blueprint secret names (`ALERT_DATABASE_URL`, etc.) differ from implemented names. | Low | Treat code as canonical; update docs when authorised. |

---

## 9. Owner decisions required

1. Confirm the canonical production hostname(s) and whether the Alert API will be same-origin, proxied, or separately hosted.
2. Approve secret-generation length/algorithm policy and who holds production secrets.
3. Decide whether to enforce production fail-fast for DB/session/bootstrap secrets.
4. Decide the S3-compatible provider (Cloudflare R2, MinIO, AWS S3) and bucket custody.
5. Name the owner of the Android signing keystore before G5.
6. Confirm whether any Map-side credential will ever be required (currently none).
