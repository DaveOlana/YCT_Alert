# 03 — YCT Map Repository Audit: Evidence Digest

**Source:** User-supplied pasted Gemini agent output (`sources/GEMINI_AUDIT_SUMMARY_AS_SHARED.txt`). The attached text **is not the full audit** `YCT_MAP_REPOSITORY_AUDIT_FOR_YCT_ALERT.md` stored on the user's machine. No repository files were uploaded here. Thus each assertion below is **AUDIT-REPORTED**.

## Reported existing technology

- Django **5.2.17**, Python **3.12**, PostgreSQL on Neon, Gunicorn/Render.
- MapLibre GL JS **v6.10.0** with OpenFreeMap.
- Pedestrian A* routing with in-memory graph and Haversine heuristic, destination/primary entrance resolution, location acquisition and path verification.
- Public map frontend from Django templates and static JS.
- Agent-reported local tests: **265 Django / 162 JavaScript passing = 427**; not rerun by this package.

## Reported API and model facts

| Evidence claim | Path or code pointer reported by Gemini | Implementation consequence |
|---|---|---|
| `GET /api/locations/` returns GeoJSON FeatureCollection of **published** places, category filters, verification state and primary-entrance coordinates | `locations/views.py`, approx. line 84 | Reuse existing endpoint before adding redundant v1 locations endpoint; inspect actual keys in live code |
| `GET /api/search/` exists but omits coordinates for outdoor places | Search endpoint in summary | Do not use search response as authoritative coordinate source |
| Single-place API `GET /api/locations/<uuid>/` does not currently exist | `locations/urls.py` | Optional additive endpoint only when demonstrably needed |
| `Location`, `Entrance`, `Floor`, `InternalPlace` purported UUIDv4 PKs | `locations/models.py` | Store `yct_map_place_id` as external UUID/string, not DB FK |
| WGS84; Python latitude/longitude vs GeoJSON `[longitude, latitude]` | Model and mapping code references | Explicit conversion and unit tests mandatory |
| MapLibre can support a separate incident GeoJSON source/layer | `static/yct_map/js/map.js` | Add independent source without changing walking/path/navigation layers |
| Routing algorithm must remain untouched | `routing/algorithm.py`, `graph.py`, `matching.py` | Strict no-edit zone for Alert V1 |

## Important qualification and audit inconsistencies

- Audit prose suggests **dispatch and responder dashboards**, but these were *not agreed* for V1. Treat them as speculative, not implemented requirements.
- It suggests ~30-second polling and specific layer names. These are candidates, not finalized operational parameters.
- It implies soft archive universally protects historical references. **Verify per-model deletion, archival behaviour and location API visibility**; external references can become unresolved without a cross-DB FK.
- The audit described the session as read-only but also said a Markdown audit report was created in the YCT Map repository root. Future audits should clarify whether untracked report creation is permitted and not claim a perfectly unchanged working tree solely from `git status` with no recorded output.
- Existing auth, privacy, exact coordinate properties and the full API catalogue were not included in this pasted summary. These require inspection of the full report and the actual repository.
- Model versions above are as reported at audit time, not permanent guarantees.

## Evidence check before Map changes (Gate G3)

1. Obtain `YCT_MAP_REPOSITORY_AUDIT_FOR_YCT_ALERT.md` in full.
2. Inspect `locations/urls.py`, `locations/views.py`, `locations/models.py`, `templates/map/index.html`, `static/yct_map/js/map.js`, map tests and settings.
3. Capture redacted example `GET /api/locations/` response containing at least one real **public** location; validate UUID, `geometry.coordinates`, properties, verification status, primary entrances and empty responses.
4. Verify archival rules and whether `GET /api/locations/` handles pagination/filtering.
5. Check current tests and working tree independently. Do not treat agent report as proof of production uptime.
6. Verify owner-approved incident layer ordering and visibility without modifying route engine.

## Forbidden inference

No agent may assume an Alert incident endpoint, a Map single-place detail endpoint, emergency-aware routing, a functioning Alert database or an operational dispatch service exists today.
