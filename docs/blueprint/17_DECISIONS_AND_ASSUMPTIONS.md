# 17 — Decision Register and Assumption Ledger

## Owner-confirmed / agreed decisions

| ID | Decision | Status |
|---|---|---|
| D-01 | Separate Alert and Map products, repos, DBs, hosting and admin accounts | AGREED |
| D-02 | Map owns geography; Alert owns incidents | AGREED |
| D-03 | Anonymous public reporting, browser access without installation | AGREED |
| D-04 | Web-first shared frontend, Capacitor initialized from start, Android first | AGREED |
| D-05 | Separate browser admin dashboard | AGREED |
| D-06 | Reports preserved, duplicates grouped carefully, not auto-verified | AGREED |
| D-07 | Protected permanent super-admin account; student admin assignments revocable | OWNER CONFIRMED |
| D-08 | Username `ALERTadmin` reserved for protected account | OWNER STATED; implementation pending |
| D-09 | Security officials may later join; head leadership transfer must be controlled | FUTURE PROPOSAL supported by owner |
| D-10 | No A* incident avoidance or invasive Map changes in Alert V1 | AGREED |
| D-11 | Free/low-cost prototype, no assertion of operational-grade free hosting | AGREED CONSTRAINT |

## Engineering recommendations NOT YET APPROVED

| ID | Option | Rationale / alternative |
|---|---|---|
| R-01 | TypeScript Vite React frontend | Buildable shared web/Android assets; alternative Vue/Svelte |
| R-02 | TypeScript Fastify API with PostgreSQL | Unified TS code, typed contracts; alternative separate Django/FastAPI backend |
| R-03 | OpenAPI 3.1 and shared schemas | Prevent agent/API drift |
| R-04 | 50m / 15min proximity window initially | Needs empirical false merge/false split tuning |
| R-05 | GeoJSON `GET /api/v1/incidents/active/` | Direct MapLibre consumption; subject to safe public schema review |
| R-06 | 30–60 second foreground incident refresh | Needs availability and user expectations test |
| R-07 | No photo/contact collection by default | Minimize privacy/security complexity |
| R-08 | Optional receipt-status checking | Needs security of bearer/receipt token and desired UX |

## What this package does NOT assert

- No claim that Map routes /api/v1/places/ or `/api/v1/incidents/active/` already exist.
- No claim that the campus authorizes the project to act as an official emergency response channel.
- No claim that any student or campus security officer is currently assigned.
- No claim the live production Map is healthy at the moment of packaging.
- No claim Gemini's full report has been reviewed; only pasted summary was provided.
- No claim that 427 reported passing tests have been independently reproduced.

## Decision change process

Document date, proposer, owner approval, alternatives, implementation impact, rollback path. Update requirements/contracts/acceptance tests in one coordinated change. See `templates/ADR_TEMPLATE.md`.
