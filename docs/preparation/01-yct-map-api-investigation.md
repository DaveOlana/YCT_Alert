# YCT Map API Investigation — Preparation for S2 / G3

**Date:** 2026-11-07
**Author:** Repository reconnaissance agent
**Scope:** Static, read-only inspection of the YCT Map repository at `C:\Users\HP\Downloads\YCT_MAP_Repo`.
**Status:** Investigation only. This document is **not** an implementation authorisation and does not approve any integration.

---

## 0. Method and evidence rules

This investigation used **static source inspection only**:

- Read Django URL configuration, views, models, services, tests, templates and documentation.
- Read deployment/config files that are safe to inspect.
- **No HTTP requests were made.**
- **No running service was contacted.**
- **No database was opened or queried.**
- **No `.env`, private key, token or keystore file was read.**

Evidence labels used below:

| Label | Meaning |
|---|---|
| **VERIFIED (SOURCE)** | Directly confirmed in repository source code. |
| **DOCUMENTED** | Stated in repository documentation but not confirmed at runtime. |
| **RUNTIME VERIFIED** | Confirmed against a running service. **None in this report.** |
| **UNKNOWN** | Not determinable from the repository; requires owner input. |

> A route existing in source does **not** prove it is publicly reachable, deployed, or operational.

---

## 1. Does an API currently exist?

**Yes — VERIFIED (SOURCE).**

The repository implements a set of unauthenticated JSON/GeoJSON endpoints using Django function-based views, plus authenticated editor/admin interfaces. There is no separate API service and no API version prefix.

- Root URL configuration: `yctmap/urls.py`
- Location endpoints: `locations/urls.py`, `locations/views.py`
- Routing endpoints: `routing/urls.py`, `routing/views.py`
- Contribution endpoint: `contributions/urls.py`, `contributions/views.py`
- Health endpoint: `yctmap/views.py`

Public endpoints are Django views returning `JsonResponse`; they are routed directly from the app URL configs under the root `""` include.

**UNKNOWN:** Whether any deployed instance responds today, its exact hostname, TLS state, uptime, and whether the deployed revision matches this local checkout.

---

## 2. Backend framework and API architecture

**VERIFIED (SOURCE):**

| Concern | Implementation |
|---|---|
| Framework | Django **5.2.17 LTS** (`requirements.txt`) |
| API style | Function-based Django views returning `JsonResponse` |
| Serialization | Manual dictionary construction; **no Django REST Framework** |
| Schema | **No OpenAPI / JSON Schema / DRF schema** in the repository |
| API versioning | **None.** Routes are `/api/...`, not `/api/v1/...` |
| Authentication | Django session auth for editors/admin; public API is anonymous |
| CSRF | Global `CsrfViewMiddleware`; POST endpoints require CSRF tokens |
| CORS | **Not configured.** No `django-cors-headers`; no `Access-Control-*` headers |
| Rate limiting | Only the contribution endpoint has application-level limits |
| Persistence | Django ORM; SQLite locally, PostgreSQL in production via `DATABASE_URL` |
| Server | Gunicorn + WhiteNoise on Render (`render.yaml`, `build.sh`) |

### Important architectural consequence

Because there is **no CORS layer**, a browser page served from a different origin (for example a YCT Alert web origin or a Capacitor WebView origin) **cannot read** YCT Map API responses directly. `fetch()` will be blocked by the browser unless:

1. YCT Map adds an approved CORS configuration, **or**
2. YCT Alert performs the request server-side (proxy/service layer), **or**
3. both products are served from the same origin.

This is a G3 integration decision, not a change authorised by this assignment.

---

## 3. Where routes, controllers and services live

**VERIFIED (SOURCE):**

| Layer | File(s) | Role |
|---|---|---|
| Root routing | `yctmap/urls.py` | Mounts health, admin, editor, locations, routing, contributions |
| Public location routes | `locations/urls.py` | Map page, About page, locations, search, internal places |
| Public location controllers | `locations/views.py` | GeoJSON collection, search, internal-place directory |
| Routing routes | `routing/urls.py` | Public route, live-position route, debug routes |
| Routing controllers | `routing/views.py` | Request validation, error mapping, response shaping |
| Routing domain services | `routing/services.py` | Route orchestration |
| A* algorithm | `routing/algorithm.py` | Graph search |
| Live-position matching | `routing/matching.py` | Snap/approach/arrival classification |
| Destination resolution | `routing/destinations.py` | Accepted IDs, entrance/anchor selection |
| Graph construction | `routing/graph.py` | In-memory graph from active records |
| ETA and geometry | `routing/eta.py`, `routing/geometry.py`, `routing/route_geometry.py` | Distance, ETA, GeoJSON geometry |
| Contribution route | `contributions/urls.py` | Single POST route |
| Contribution controller | `contributions/views.py` | Validation, honeypot, rate limits, persistence |
| Editor routes/controllers | `locations/editor_urls.py`, `locations/editor_views.py` | Authenticated HTML workflows |
| Health | `yctmap/views.py` | `GET /health/` |

---

## 4. Available endpoints relating to campus places and geography

**VERIFIED (SOURCE).** All public routes are unversioned.

### 4.1 Public read endpoints

| Method | Route | Purpose | Notes |
|---|---|---|---|
| `GET` | `/api/locations/` | Published outdoor places as GeoJSON `FeatureCollection` | Optional `q` (≤100 chars), `category` (legacy value) |
| `GET` | `/api/search/` | Combined outdoor + internal-place search | Optional `q`; **outdoor results omit coordinates** |
| `GET` | `/api/locations/<uuid>/internal-places/` | Published internal places grouped by floor | 404 if parent location is not published |
| `GET` | `/api/routes/` | Walking route between two destinations | `origin`, `destination` query params |
| `GET` | `/health/` | Process liveness | Returns `{"status": "ok"}` |

### 4.2 Public write endpoints

| Method | Route | Purpose | Protection |
|---|---|---|---|
| `POST` | `/api/routes/from-position/` | Route from a live position to a destination | CSRF required; no auth |
| `POST` | `/api/contributions/` | Anonymous place-correction/creation suggestion | CSRF required; honeypot; session and IP rate limits |

### 4.3 Debug endpoints (development only)

| Method | Route | Guard |
|---|---|---|
| `GET` | `/api/debug/walkable-network/` | `settings.DEBUG` only (404 otherwise) |
| `GET` | `/api/debug/route-anchors/` | `settings.DEBUG` only |
| `GET` | `/api/debug/route/` | `settings.DEBUG` only |

### 4.4 HTML routes (not APIs)

- `GET /` — map application
- `GET /about/` — About page (present in working tree as an uncommitted change)
- `/editor/...` — authenticated editor workflows
- `/admin/` — Django admin

### 4.5 Endpoints that do **not** exist

**VERIFIED (SOURCE):**

- No `GET /api/locations/<uuid>/` single-place lookup (only the `internal-places` sub-route exists).
- No `/api/v1/...` prefix.
- No public incident/alert endpoint (correct — incident ownership belongs to YCT Alert).
- No webhook, queue, ETag, conditional-request or pagination support.
- No entrance GeoJSON endpoint.

> YCT Alert's blueprint (`docs/blueprint/04_YCT_MAP_INTEGRATION.md`) says entrances are *reportedly* included. **This is false for the current code:** `/api/locations/` exposes one representative point per place and does **not** expose entrance coordinates.

---

## 5. Authentication and authorisation

### 5.1 Public endpoints

**VERIFIED (SOURCE):**

- `/api/locations/`, `/api/search/`, `/api/locations/<uuid>/internal-places/`, `/api/routes/` and `/health/` are unauthenticated.
- No API key, bearer token, OAuth or signed-request mechanism exists for these routes.

### 5.2 CSRF-protected anonymous writes

**VERIFIED (SOURCE):**

- `POST /api/routes/from-position/` and `POST /api/contributions/` run under Django's global `CsrfViewMiddleware`.
- No `@csrf_exempt` exists anywhere in the repository.
- The map page sets a CSRF cookie via `@ensure_csrf_cookie`, which same-origin JavaScript reads.
- A cross-origin or server-to-server client cannot call these endpoints without obtaining a CSRF token and session cookie first.

### 5.3 Editor and admin

**VERIFIED (SOURCE):**

- Editor routes use `login_required` and `permission_required(..., raise_exception=True)` via `active_editor` / `active_editor_any` in `locations/editor_views.py`.
- Inactive accounts are explicitly rejected.
- Permissions are Django model permissions (`locations.*`, `routing.*`, `contributions.*`).
- Admin is the standard Django admin at `/admin/`.
- Login URL: `/editor/login/`; no public registration.

### 5.4 Transport and platform controls

**VERIFIED (SOURCE):**

- In production: secure session/CSRF cookies, SSL redirect, HSTS (default 3600 s), content-type nosniff, same-origin referrer policy.
- `TRUST_PROXY_HTTPS` enables `SECURE_PROXY_SSL_HEADER` when a trusted proxy overwrites `X-Forwarded-Proto`.
- No CORS policy (see §2).
- Public location/routing JSON responses set `Cache-Control: no-store`; `/health/` does not.

### 5.5 Public-write abuse controls

**VERIFIED (SOURCE):**

- Contributions: 3 accepted per session per 10 minutes; 30 per IP per 24 hours; honeypot field; `Retry-After` on 429.
- `/api/routes/from-position/` has no explicit rate limit in source.

---

## 6. Response structures and data schemas

All are **VERIFIED (SOURCE)** from view code.

### 6.1 `GET /api/locations/`

```json
{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "id": "<location-uuid>",
      "geometry": { "type": "Point", "coordinates": [3.000000, 6.000000] },
      "properties": {
        "id": "<location-uuid>",
        "destination_key": "location:<location-uuid>",
        "destination_type": "location",
        "name": "Example place",
        "category": "building",
        "category_label": "Buildings",
        "description": "",
        "verification_state": "UNVERIFIED",
        "verification_label": "Unverified",
        "is_checkpoint": false,
        "aliases": [],
        "categories": [{ "slug": "academic", "name": "Academic" }],
        "place_type": "BUILDING",
        "place_type_label": "Building",
        "routing_available": true,
        "routing_unavailable_reason": "",
        "places_inside_count": 0
      }
    }
  ],
  "meta": { "count": 1, "query": "", "category": "" }
}
```

Notes:

- `coordinates` are `[longitude, latitude]` (WGS84).
- Only `publication_status = PUBLISHED` places with a representative point are returned.
- `publication_status` itself is **not** returned.
- `category` is the legacy single-value field; `categories` is the newer many-to-many taxonomy. Two taxonomies coexist.
- No pagination; no ETag; `Cache-Control: no-store`.

### 6.2 `GET /api/search/`

```json
{
  "results": [
    {
      "id": "<uuid>",
      "destination_key": "location:<uuid>",
      "destination_type": "location",
      "name": "Example",
      "subtitle": "Building",
      "routing_available": true,
      "routing_unavailable_reason": ""
    }
  ],
  "meta": { "count": 1, "query": "exa" }
}
```

- Outdoor results deliberately omit coordinates.
- Internal results additionally include `internal_type`, `parent`, `floor`, `room_code`, `wing_section`, `direction_note`, `verification_state`.
- Maximum 50 outdoor + 50 internal results.

### 6.3 `GET /api/locations/<uuid>/internal-places/`

```json
{
  "location": { "id": "<uuid>", "name": "Example Building" },
  "floors": [
    {
      "label": "Ground floor",
      "places": [
        {
          "id": "<uuid>",
          "destination_key": "internal:<uuid>",
          "destination_type": "internal",
          "name": "Lecture Room 1",
          "internal_type": "CLASSROOM",
          "internal_type_label": "Classroom",
          "parent": { "id": "<location-uuid>", "name": "Example Building" },
          "floor": { "id": "<floor-uuid>", "label": "Ground floor", "level": 0 },
          "room_code": "LR1",
          "wing_section": "",
          "direction_note": "",
          "verification_state": "UNVERIFIED",
          "routing_available": true,
          "routing_unavailable_reason": ""
        }
      ]
    }
  ]
}
```

### 6.4 `GET /api/routes/`

Query: `origin`, `destination`. Each accepts a bare location UUID or `location:<uuid>`; `internal:<uuid>` is also accepted by the resolver.

```json
{
  "route": {
    "type": "Feature",
    "geometry": { "type": "LineString", "coordinates": [[3.37, 6.51], [3.38, 6.52]] },
    "properties": { "route_state": "FIELD_VERIFIED" }
  },
  "summary": {
    "origin": { "key": "location:<uuid>", "type": "location", "id": "<uuid>", "name": "A", "parent": {"id": "<uuid>", "name": "A"}, "routing_available": true, "routing_unavailable_reason": "" },
    "destination": { "...": "..." },
    "distance_metres": 123.4,
    "eta_label": "2 min walk",
    "eta_is_approximate": true,
    "verification_state": "FIELD_VERIFIED"
  }
}
```

Errors use `{ "error": "...", "code": "..." }` with codes including `INVALID_REQUEST`, `SAME_ORIGIN`, `INVALID_ENDPOINT`, `MISSING_ANCHOR`, `NO_ROUTE`, `ALREADY_AT_ARRIVAL`, `INVALID_ROUTE_GEOMETRY`.

### 6.5 `POST /api/routes/from-position/`

Request:

```json
{
  "destination": "location:<uuid>",
  "position": {
    "latitude": 6.518570,
    "longitude": 3.374240,
    "accuracy_metres": 8.5
  }
}
```

Response includes `navigation_state` (`ON_NETWORK`, `APPROACH_REQUIRED`, or `ARRIVAL_CANDIDATE`), optional `route` Feature, and `summary` with total/remaining distance, ETA source, network-match distance, match coordinate and corridor distance. Arrival-candidate responses omit route geometry.

### 6.6 `POST /api/contributions/`

Request fields: `request_id` (UUID, required), `type`, optional `target_location`, `proposed_name`, `proposed_category`, `description`, `context`, `proposed_point` (`latitude`, `longitude`), and a `website` honeypot.

Success `201`:

```json
{ "id": "<uuid>", "status": "PENDING", "message": "Thank you. Your submission will be reviewed before it can affect YCT Map." }
```

Idempotent replay `200`: `{ "id": "...", "status": "PENDING", "duplicate_request": true }`.

Errors: `{ "error": "...", "code": "...", "fields": { ... } }`.

### 6.7 Schema governance

- **No formal OpenAPI or JSON Schema is published by YCT Map.**
- Shapes are defined only by Python dictionaries in views and by tests.
- Any Alert integration contract must be frozen from inspected code, not from YCT Alert's illustrative blueprint examples.

---

## 7. Publication states: PUBLISHED, DRAFT, ARCHIVED

**VERIFIED (SOURCE):**

`Location.PublicationStatus` and `InternalPlace.publication_status` use:

| Value | Meaning |
|---|---|
| `DRAFT` | Not publicly visible |
| `PUBLISHED` | Eligible for public endpoints |
| `ARCHIVED` | Withdrawn; not publicly visible |

Rules:

- Default for new `Location` and `InternalPlace` is `DRAFT`.
- Publishing a `Location` requires both representative coordinates.
- Publishing an `InternalPlace` requires a published parent and an active floor.
- Public endpoints filter `publication_status=PUBLISHED`.
- `Location.is_active` is a **legacy compatibility flag** (default `False`) and is independent of publication status; public queries do not use it.
- Entrances and floors use their own `is_active` booleans, not publication states.
- Routing graph nodes/segments/anchors use `is_active` plus `verification_state`.
- The public API does **not** expose `publication_status`; consumers only see records that were published at request time.

**Consequence for YCT Alert:** A location disappearing from the feed is the only signal of archiving. Historical `yct_map_place_id` values must remain nullable snapshots and must not be treated as foreign keys.

---

## 8. Location identifiers and coordinates

**VERIFIED (SOURCE):**

| Item | Representation |
|---|---|
| `Location.id` | UUID v4, stringified in JSON |
| `Entrance.id`, `Floor.id`, `InternalPlace.id` | UUID v4 |
| `destination_key` | `location:<uuid>` or `internal:<uuid>` |
| Coordinates | Django `DecimalField(max_digits=9, decimal_places=6)`; emitted as JSON floats |
| GeoJSON order | `[longitude, latitude]` |
| Latitude range | −90 to 90 |
| Longitude range | −180 to 180 |
| Outdoor point | `representative_latitude` / `representative_longitude` |
| Legacy fields | `entrance_latitude` / `entrance_longitude` remain on the model but are not used by the collection endpoint |
| Entrances | Stored as `Entrance.latitude` / `longitude`; **not exposed by the public API** |
| Graph geometry | `WalkableSegment.geometry` JSON (GeoJSON `LineString`) |
| Graph nodes | `WalkableNode.longitude` / `latitude` decimals |

`/api/search/` intentionally omits coordinates; Alert must not assume search results can place a pin. Use `/api/locations/` for coordinates, or require reporter confirmation/manual placement.

---

## 9. Existing API documentation, tests and integration examples

### Documentation

**VERIFIED (SOURCE) — but partially stale:**

- `docs/project/technical/API_CONTRACT.md`:
  - Correctly documents `/api/locations/`, `/api/routes/`, `/api/routes/from-position/` and `/api/contributions/`.
  - Still labels the project "PHASE 1", omits `/api/search/`, `/api/locations/<uuid>/internal-places/`, `/health/`, debug endpoints and the `/about/` page.
  - Describes location responses as exposing "only" a subset that no longer matches the full property list.
- `docs/project/technical/ARCHITECTURE.md`, `ROUTING.md`, `DATA_MODEL.md` document the domain model and routing rules.
- `docs/project/operations/CURRENT_STATE.md` is dated 2026-10-14 and claims the local stability correction is uncommitted; git shows commit `36681bc`. **Documentation drift.**
- YCT Alert's `docs/blueprint/04_YCT_MAP_INTEGRATION.md` and `07_API_CONTRACTS.md` explicitly label Map shapes as "reported" and unverified. Good caution, but some assumptions (entrance coordinates, `/api/v1/` prefix) are now known to be inaccurate.

### Tests

**VERIFIED (SOURCE):** Tests exist and cover API contracts, including:

- `locations/tests/test_locations.py` — GeoJSON contract, checkpoint flag, search/category filters, empty results, invalid input, read-only enforcement, draft exclusion.
- `routing/tests/test_services.py` — `/api/routes/` success, same-origin conflict, missing endpoints.
- `routing/tests/test_live_routing.py` — `/api/routes/from-position/` POST behaviour, accuracy rejection, method restrictions.
- `routing/tests/test_route_contract.py`, `test_route_verification.py` — geometry and verification classification.
- `contributions/tests/test_contributions.py` — validation, idempotency, rate limits.
- JavaScript tests under `tests/js/`.

### Integration examples

- **No sample payload fixtures** specifically for external consumers.
- **No client SDK, Postman collection or OpenAPI document.**
- The only integration examples are YCT Alert's illustrative blueprint snippets, which are explicitly marked as proposals.

---

## 10. Deployment configuration and documented API base URLs

**VERIFIED (SOURCE):**

- `render.yaml` defines a Render web service named `yct-map`:
  - build: `bash build.sh`
  - start: `gunicorn yctmap.wsgi:application --bind 0.0.0.0:$PORT`
  - health check: `/health/`
  - `APP_ENV=production`, generated `DJANGO_SECRET_KEY`, external `DATABASE_URL`, `TRUST_PROXY_HTTPS=1`
- `build.sh` installs requirements, collects static files, runs migrations, assigns graph labels.
- `docs/project/technical/DEPLOYMENT.md` documents the Render/PostgreSQL plan and says deployment was **not performed**.
- `docs/project/operations/CURRENT_STATE.md` says an **existing Render + Neon service is unchanged**.
- These two statements conflict; the deployment state is **DOCUMENTED but unverified at runtime**.

### Documented base URLs

| Source | Value | Status |
|---|---|---|
| YCT Alert `.env.example` | `YCT_MAP_BASE_URL=https://yct-map.onrender.com` | Documented placeholder/default; unverified |
| YCT Alert `services/api/src/config.ts` | default `https://yct-map.onrender.com` | Coded default; unverified |
| YCT Map `DECISIONS.md` | example `yctmap.onrender.com` | Historical example, inconsistent with the above |
| YCT Map audit file (untracked) | `map.yctmap.ng`, `alert.yctmap.ng` | Not approved; speculative |

**UNKNOWN:** The authoritative production hostname, whether HTTPS/HSTS is active, whether the deployed schema matches this checkout, and whether the service is publicly reachable.

---

## 11. Documented owner/maintainer of the API

**PARTIALLY VERIFIED (SOURCE):**

- Governance documents repeatedly refer to an **owner** and a **project team** as the decision authority:
  - `AGENTS.md`, `docs/project/governance/*`, `docs/project/operations/CURRENT_STATE.md`.
- Editor accounts are described as administrator-provisioned; initial editor users are "the owner and project team" (`docs/project/phase4/CAMPUS_DATA_AND_EDITOR_SPEC.md`).
- **No named individual, role mailbox, on-call contact, `CODEOWNERS`, `SECURITY.md`, `CONTRIBUTING.md` or maintainer file exists.**
- **No service-level contact for API faults is documented.**

**UNKNOWN / OWNER INPUT REQUIRED:** Who is the named API maintainer, who approves contract changes, who owns the Render/Neon resources, and what is the escalation contact for G3 integration failures.

---

## 12. Integration-relevant findings summary

| Finding | Impact on S2 / G3 | Evidence |
|---|---|---|
| No CORS support | Browser/Capacitor clients cannot read Map API directly | VERIFIED (SOURCE) |
| CSRF required on both POST endpoints | Cross-origin/server clients cannot call route-from-position or contributions without a token/session | VERIFIED (SOURCE) |
| No API version prefix | Alert must target `/api/locations/`, not `/api/v1/...` | VERIFIED (SOURCE) |
| No entrance coordinates exposed | Alert cannot resolve precise building entrances from the feed | VERIFIED (SOURCE) |
| No single-place lookup | Alert must search/filter the collection or cache it | VERIFIED (SOURCE) |
| Feed has no `publication_status` field | Archived places simply disappear; treat IDs as snapshots | VERIFIED (SOURCE) |
| Two category taxonomies coexist | Alert must decide which field to use (`category` vs `categories`) | VERIFIED (SOURCE) |
| No formal schema/OpenAPI | Contract must be pinned by tests and sample payloads | VERIFIED (SOURCE) |
| API docs are stale | Do not rely on `API_CONTRACT.md` alone | VERIFIED (SOURCE) |
| Production status is contradictory | Base URL and availability require owner confirmation | DOCUMENTED / UNKNOWN |
| No named maintainer | G3 change approval path is undefined | UNKNOWN |

---

## 13. Recommended (not authorised) next steps for the owner

These are proposals for later approval, not actions taken:

1. Freeze a **read-only integration contract** for `GET /api/locations/` using a recorded sample response from a controlled local run.
2. Decide the CORS strategy:
   - server-side proxy in Alert (no Map change), or
   - owner-approved, narrowly scoped CORS on Map.
3. Confirm the authoritative production base URL and deployment revision.
4. Decide whether Alert needs entrance-level geography. If yes, that is a new, separately approved Map endpoint — it cannot be inferred from the current feed.
5. Name an API maintainer and a contract-change approval path.
