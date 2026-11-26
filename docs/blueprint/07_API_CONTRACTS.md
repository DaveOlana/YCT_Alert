# 07 — Proposed HTTP API Contracts (Draft)

**Status:** Proposed names, payloads and response fields are illustrative, **not existing endpoints**. After choosing backend/framework, turn this file into validated OpenAPI 3.1 and automated contract tests. Use JSON over HTTPS and UTC ISO-8601 timestamps.

## Endpoint catalogue

| Route | Auth | Purpose |
|---|---|---|
| `GET /api/v1/health/live` | Public | Process liveness (not proof of DB/operations) |
| `GET /api/v1/health/ready` | Restricted/appropriate | Server/DB readiness |
| `GET /api/v1/taxonomy` | Public | Allowed incident categories and location inputs |
| `POST /api/v1/reports` | Anonymous | Create raw report; return receipt |
| `GET /api/v1/reports/receipts/{receipt_id}` | Possession of private receipt token, if built | Query submission delivery; don't expose incident private details |
| `GET /api/v1/incidents/active/` | Public | Safe approved ACTIVE GeoJSON feed |
| `POST /api/v1/admin/login` | Auth initiation | Admin login, hardened session management |
| `POST /api/v1/admin/logout` | Authenticated | Revoke admin session |
| `GET /api/v1/admin/incidents` | Admin | Pending/moderation queue |
| `GET /api/v1/admin/incidents/{id}` | Admin | Internal incident + linked report evidence |
| `POST /api/v1/admin/incidents/{id}/activate` | Moderator | Approve safe publication |
| `POST /api/v1/admin/incidents/{id}/reject` | Moderator | Reject with reason |
| `POST /api/v1/admin/incidents/{id}/resolve` | Moderator | Resolve with reason |
| `POST /api/v1/admin/incidents/{id}/links` | Moderator | Associate/split reports, auditable |
| `GET /api/v1/admin/assignments` | Super admin | List admin grants |
| `POST /api/v1/admin/assignments` | Super admin | Grant time-scoped role |
| `POST /api/v1/admin/assignments/{id}/revoke` | Super admin | Revoke assignment |

Paths/methods and whether admin is cookie-based should be decided and frozen at contract Gate G1.

## Public report request — draft

```http
POST /api/v1/reports HTTP/1.1
Content-Type: application/json
Idempotency-Key: <client-generated-random-value>
```

```json
{
  "category_code": "FIRE_OR_SMOKE",
  "description": "Smoke reported near an entrance; exact source unknown.",
  "incident_location": {
    "latitude": 6.0,
    "longitude": 3.0,
    "source": "MANUAL_POINT",
    "yct_map_place_id": null,
    "place_name_snapshot": null,
    "landmark_description": "Example landmark for synthetic testing only"
  }
}
```

The example coordinates are **synthetic placeholders, not a real campus incident**. Coordinates may be omitted when text-only location is permitted; the server must record the uncertainty. Require at least meaningful location evidence (coordinate or textual description). Exact description length, size limits and taxonomy are unresolved.

Successful first receipt (proposal):

```http
HTTP/1.1 202 Accepted
Content-Type: application/json
```

```json
{
  "receipt_id": "rct_example_not_real",
  "received_at": "2026-10-25T00:00:00Z",
  "delivery_status": "RECEIVED",
  "message": "Report received. It has not yet been reviewed; this does not confirm emergency response."
}
```

No raw `incident_id`, admin identity or contact data in this response. A duplicate retry with same idempotency key and identical payload produces the same receipt and status code; conflicting payload gets `409`.

## Public incident feed — draft GeoJSON

```json
{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "id": "alert_example_001",
      "geometry": {"type": "Point", "coordinates": [3.0, 6.0]},
      "properties": {
        "public_id": "alert_example_001",
        "category": "FIRE_OR_SMOKE",
        "status": "ACTIVE",
        "summary": "Illustrative approved incident summary for test only",
        "published_at": "2026-10-25T00:00:00Z",
        "updated_at": "2026-10-25T00:00:00Z"
      }
    }
  ],
  "generated_at": "2026-10-25T00:00:10Z"
}
```

**Production feed must never include simulated incidents**. `generated_at` is a proposed foreign member, permitted only if validators accept it. GeoJSON coordinates are `[longitude, latitude]`, not the input field order. Safe generalized locations can differ from precise private location. Only publish what a policy allows.

## Admin transition request — draft

`POST /api/v1/admin/incidents/{id}/activate` with `{ "summary": "...", "public_location": { ... }, "reason": "...", "expected_version": 3 }`.

Server checks session, CSRF/origin where relevant, active role, valid transition, expected version, publishability, then atomically updates incident and appends audit row. Return `409 VERSION_CONFLICT` on concurrent changes.

## Error contract

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Please check the incident location and try again.",
    "request_id": "req_example"
  }
}
```

Canonical codes: `VALIDATION_ERROR` (400/422), `UNAUTHENTICATED` (401), `FORBIDDEN` (403), `NOT_FOUND` (404), `IDEMPOTENCY_KEY_REUSED` (409), `VERSION_CONFLICT` (409), `RATE_LIMITED` (429), `SERVICE_UNAVAILABLE` (503). Do not leak stacks, SQL, keys or private data.

## Upstream Map geography API (reported existing)

`GET /api/locations/` — reportedly FeatureCollection of published places. **Do not assume field names beyond GeoJSON structure** until sample payload and code inspection. Map's `GET /api/search/` reportedly omits outdoor coordinates, and single-place lookup has not been implemented.

## Contracts to freeze before implementation

Pagination, taxonomy codes, location precision, timeouts, admin authentication format, error codes, rate limits, idempotency duration, receipt access protection, CORS/CSRF, external Map API schema and public feed safe-summary policy. Changes require explicit contract versioning and tests.
