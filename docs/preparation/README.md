# Preparation Area — YCT Alert

**Pass date:** 2026-11-07
**Status:** Repository reconnaissance and documentation preparation only.
**Authorisation:** No implementation, deployment, credential provisioning, or YCT Map modification was authorised or performed.

---

## What this folder contains

| File / folder | Deliverable |
|---|---|
| `01-yct-map-api-investigation.md` | Assignment 1 — read-only YCT Map API investigation |
| `yct-map-brand-assets/` | Assignment 2 — staged visual assets (no runtime integration) |
| `yct-map-brand-assets/INVENTORY.md` | Source paths, destinations, dimensions, suggested use, licensing uncertainty |
| `03-build-configuration-and-credentials.md` | Assignment 3 — environment variable and credential inventory (names only, no secrets) |
| `04-unknowns-risks-and-owner-decisions.md` | Consolidated unknowns, risks and decisions for S2 / G3 |

---

## Headline findings

1. **YCT Map has a real Django JSON/GeoJSON API**, but it is **not** versioned under `/api/v1/`.
2. Public reads are anonymous; writes require Django CSRF. Editor/admin access uses Django sessions and model permissions.
3. **No CORS support exists**, so browser/Capacitor clients cannot read Map responses cross-origin without a Map change or an Alert-side proxy.
4. **No entrance coordinates and no single-place lookup** are exposed by the current feed.
5. Publication states are `DRAFT` / `PUBLISHED` / `ARCHIVED`; only `PUBLISHED` records appear publicly, and the status field itself is not returned.
6. Identifiers are UUIDs; coordinates are WGS84 `[longitude, latitude]` with 6 decimal places.
7. **No OpenAPI schema**, no named maintainer and no authoritative production base URL are documented.
8. The existing Map documentation is partially stale (`API_CONTRACT.md` says Phase 1; `CURRENT_STATE.md` is dated 2026-10-14).
9. The only reusable visual assets are a logo PNG and a small favicon SVG; **no licence or attribution information exists**.
10. YCT Alert's environment configuration is scaffolded correctly but several secrets still have development defaults, and the database/storage layers are not yet implemented.

---

## Files created or copied in this pass

### Created

- `docs/preparation/README.md`
- `docs/preparation/01-yct-map-api-investigation.md`
- `docs/preparation/03-build-configuration-and-credentials.md`
- `docs/preparation/04-unknowns-risks-and-owner-decisions.md`
- `docs/preparation/yct-map-brand-assets/INVENTORY.md`

### Copied (byte-identical, hashes verified)

- `docs/preparation/yct-map-brand-assets/yct-map-logo.png`
  - from `YCT_MAP_Repo/static/yct_map/images/yct-map-logo.png`
- `docs/preparation/yct-map-brand-assets/favicon.svg`
  - from `YCT_MAP_Repo/static/yct_map/favicon.svg`

### Not created / not changed

- No YCT Map files were created, edited, renamed, moved or deleted.
- No `.env`, private key, token or keystore was read.
- No credential was created or provisioned.
- No dependency was added or installed.
- No database or external service was contacted.
- No commit, push, merge or deployment was performed.
- No staged asset was copied into a runtime directory.

---

## Boundary reminder

The staged assets are **reference candidates only**. They are not approved YCT Alert branding. Do not move them into `apps/*/public`, Android resources, or any runtime directory without explicit owner approval.
