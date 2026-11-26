# Unknowns, Risks and Owner Decisions — S2 / G3 Preparation

**Date:** 2026-11-07
**Status:** Consolidated register for owner review. No item below is resolved by this assignment.

---

## A. Blocking unknowns (require owner input before G3 integration)

| ID | Unknown | Why it matters | Needed from owner |
|---|---|---|---|
| U-01 | Authoritative YCT Map production base URL | Code defaults say `https://yct-map.onrender.com`; docs mention `yctmap.onrender.com`; audit file mentions unapproved domains | Confirm the real URL, or confirm that no public service is currently approved |
| U-02 | Whether a YCT Map service is currently operational | "Deployment prepared / not performed" (DEPLOYMENT.md) conflicts with "existing Render + Neon service unchanged" (CURRENT_STATE.md) | Confirm current deployment state and revision |
| U-03 | CORS strategy for Map geography | Map has **no CORS**; browser/Capacitor clients cannot read the feed directly | Choose server-side proxy in Alert vs owner-approved Map CORS change |
| U-04 | Whether Alert needs entrance-level coordinates | Map API exposes only a representative point, not entrances | Decide if representative point + manual confirmation is sufficient for V1 |
| U-05 | Named API maintainer / contract-change approver | No named owner, CODEOWNERS or security contact exists | Name the responsible person/role and escalation path |
| U-06 | Which Map taxonomy to use | `category` (legacy single value) and `categories` (many-to-many) both exist | Choose the field Alert maps to its own taxonomy |
| U-07 | Publication/archival semantics for cached IDs | API returns only currently published places and no status field | Confirm that disappearance = archival and that Alert keeps nullable snapshots |
| U-08 | Legal right to reuse YCT Map logo/favicon | No licence or authorship statement in the repository | Confirm ownership and permission, or decline reuse |
| U-09 | Ownership of YCT Map colour/typography identity | Alert S1 already reuses Map hex tokens without a recorded decision | Confirm whether shared visual identity is intentional and approved |
| U-10 | Production secret ownership and rotation policy | Secrets are currently dev placeholders; no production custody defined | Assign custody and rotation responsibility |
| U-11 | Android signing keystore custody | Required for G5; outside repository | Name custodian and recovery process |

---

## B. Technical risks

| ID | Risk | Likelihood | Impact | Mitigation (proposal) |
|---|---|---|---|---|
| R-01 | Cross-origin fetch fails because Map has no CORS | High | High | Use an Alert server-side proxy for G3, or obtain a narrowly scoped Map CORS decision |
| R-02 | CSRF requirement blocks server-to-server calls to Map POST endpoints | High | Medium | Do not depend on Map POST endpoints; keep route calculation optional/local |
| R-03 | Map API contract drifts silently (no OpenAPI) | Medium | High | Pin a versioned sample fixture + contract tests on the Alert side; require owner approval for changes |
| R-04 | Location disappears/archives without status signal | Medium | Medium | Treat `yct_map_place_id` as a nullable historical snapshot; cache display name with "may be outdated" |
| R-05 | Search results omit coordinates | Certain | Low | Use `/api/locations/` for coordinates; never infer a pin from search |
| R-06 | No pagination / potentially large feed | Low now, grows later | Medium | Cache with an explicit age limit; add pagination only by owner decision |
| R-07 | Production DB URL falls back to localhost if unset | Medium | High | Fail fast when `NODE_ENV=production` (see credentials report) |
| R-08 | Admin secrets have development defaults | Medium | High | Require strong explicit values in production |
| R-09 | API binds to `127.0.0.1` by default | Medium | Medium | Set `0.0.0.0` on hosted environments |
| R-10 | Blueprint and code use different env names | Medium | Low | Code is canonical; update docs under separate authorisation |
| R-11 | Reusing YCT Map branding could imply endorsement | Medium | Medium | Owner approval only; prefer palette continuity over logo reuse |
| R-12 | Staged assets accidentally integrated into runtime | Low | Medium | Keep them under `docs/preparation/`; require explicit review |
| R-13 | Documentation drift (CURRENT_STATE.md dated 2026-10-14; API_CONTRACT.md still says Phase 1) | High | Medium | Do not treat those documents as current; reconcile under owner authority |
| R-14 | Untracked/audit document contains inaccuracies (references to nonexistent files/fields) | High | Medium | Do not rely on `YCT_MAP_REPOSITORY_AUDIT_FOR_YCT_ALERT.md` as authoritative |

---

## C. Decisions required for S2 (public UI + Android shell)

| ID | Decision | Default recommendation |
|---|---|---|
| D-S2-01 | Confirm `VITE_API_URL` usage per build target | Wire it in S2; keep it non-secret |
| D-S2-02 | Confirm API base URL for browser and Capacitor builds | Use environment-specific public URLs; never embed secrets |
| D-S2-03 | Confirm whether S2 shows Map place data at all | Keep S2 independent; use synthetic taxonomy as planned |
| D-S2-04 | Confirm CORS origins for local Vite and Capacitor | Keep the existing localhost/capacitor allowlist until production domains are approved |
| D-S2-05 | Confirm app icon/splash asset source | Do not reuse YCT Map logo by default; owner must approve or provide an Alert-specific mark |

---

## D. Decisions required for G3 (Map integration)

| ID | Decision | Default recommendation |
|---|---|---|
| D-G3-01 | Integration transport | Alert server-side fetch of `/api/locations/`; never trust client-side cross-origin access |
| D-G3-02 | CORS change on Map | Avoid if possible; if required, narrowly scoped and owner-approved with Map regression tests |
| D-G3-03 | Geography refresh cadence | Follow approved D-08 (15 minutes), with manual trigger later |
| D-G3-04 | Incident feed shape | GeoJSON `FeatureCollection`, safe allowlist, explicit freshness metadata |
| D-G3-05 | Map incident overlay scope | Isolated `incidents.js` + source/layer; never modify routing algorithm or graph tables |
| D-G3-06 | Failure UX | Distinguish "0 incidents" from "feed unavailable"; never imply safety |

---

## E. Items explicitly out of scope for this assignment

- Implementing S2 or any feature.
- Changing S1 code or accepted contracts.
- Adding dependencies.
- Creating credentials or API keys.
- Running migrations or connecting to databases.
- Modifying the YCT Map repository.
- Committing, pushing, merging or deploying.
- Integrating staged assets into runtime directories.
