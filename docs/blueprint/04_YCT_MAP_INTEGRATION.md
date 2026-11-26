# 04 — Minimal YCT Map ↔ YCT Alert Integration

## Integration direction A: Map geography into Alert

**Reported existing endpoint:** `GET /api/locations/`, returning published-place GeoJSON FeatureCollection, location identifiers, category/verification data, and reportedly entrance coordinates. Confirm exact shape and whether an origin policy applies from Android native container.

**Minimum client flow:** Alert requests a public list or search of campus places, shows display names, and retains selected external `yct_map_place_id` plus **incident position** chosen or confirmed by reporter. If Map is down, manual description and/or GPS coordinate still allow intake; set `location_resolution_status=NEEDS_REVIEW` as appropriate.

**No cross-product foreign keys.** Keep `yct_map_place_id` as nullable identifier string/UUID. An archived, hidden or deleted Map place must not make historical Alert records unprocessable. Cache name snapshot carefully, marked potentially outdated.

**Coordinate rule:** GeoJSON position is WGS84 `[longitude, latitude]`; application fields may be `lat, lon`. Do not swap. Latitude range `[-90,90]`; longitude range `[-180,180]`; check campus bounds as a **warning/review cue**, not a reason to discard urgent reports.

**Optional future endpoint:** `GET /api/locations/{uuid}/` *only if an actual need emerges*. Do not implement `GET /api/v1/places/` just to satisfy an obsolete planning example.

## Integration direction B: Alert incident feed into Map

**New Alert endpoint proposal:** `GET /api/v1/incidents/active/` returning only safe ACTIVE incident summaries, with output freshness metadata. A GeoJSON FeatureCollection is convenient for direct MapLibre rendering, but require a contract test before choosing between a direct GeoJSON feed and JSON that Map transforms.

**Recommended initial contract:** GeoJSON, one Point Feature per safely displayable ACTIVE incident; unlocated incidents remain in the admin queue and are **not fabricated at a campus centroid**. An optional separate public list can be designed later for general advisory items.

**Map change (later, separately approved):** Add an isolated `incidents.js` module, a source/layer in `static/yct_map/js/map.js`, and an optional `Report incident` link in the existing public Menu. Use unique IDs to avoid collision with existing layer identifiers. Choose unobtrusive marker z-order that does not block location markers or active navigation routes.

**Refresh policy:** Proposed starting trial ~30–60 seconds while visible. Not final. Pause excessive polling in background; on reactivation refetch. Never display stale incident age as current. Respect conditional requests/ETag/Cache-Control where supported.

**Fetch failure:** Do not block map initialization. Display an `Incident information temporarily unavailable` hint if incident overlay is user-visible; do not falsely say `No incidents`. Any cached incidents must carry `last successful update`, an age limit and expired/stale visual treatment. Do not rely on incident overlay as a complete safety warning system.

## Public feed field allowlist — proposal

| Field | Purpose | Restrictions |
|---|---|---|
| `public_id` | Opaque incident ID | No raw report or DB internal keys |
| `category` | Broad incident type | Approved taxonomy |
| `summary` | Human-safe admin-written summary | No personal names/phone/contact/private raw reports |
| `status` | `ACTIVE` | Only ACTIVE included |
| `coordinates` | Safe point | Generalize/omit for vulnerable individuals/sensitive security cases |
| `published_at` | Date/time of public activation | ISO UTC |
| `updated_at` | Age/freshness | ISO UTC |

## Mandatory failure tests

- Map unavailable at report time → manual incident location submission succeeds.
- Alert unavailable at Map render time → Map routing/search/GPS remain functional.
- No active incidents → truly empty, successfully fetched feed distinguishes `0 incidents` from `fetch failed`.
- Incident resolved between refreshes → marker removed on next successful refresh.
- Invalid coordinate or private field in feed → client rejects invalid feature and alerts telemetry without leaking data.
- App/map on slow data → timeout and safe UI; no runaway fetch or duplicate layers.

## Change boundaries

- **Never edit** `routing/algorithm.py`, `routing/graph.py`, `routing/matching.py`, graph/survey DB tables, GPS filters, heading implementation or path-verification rules for Alert V1.
- No Map database migrations or Map admin-account sharing.
- Do not deploy or commit Map changes without separate owner approval and passing pre-existing tests.

## Open contract questions

Exact `GET /api/locations/` structure, CORS/Capacitor origin, rate limits, public location eligibility, appropriate layer/order, safe location accuracy for incidents, polling freshness/TTL and domains are all **awaiting proof or decision**.
