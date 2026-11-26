# PROJECT — YCT Alert: Intent and Durable Decisions

**Project:** YCT Alert  
**Version:** 0.2 Baseline  
**Status:** In Active Development (Pre-G3.5 Hardening & Integration Readiness Completed)  
**Governance:** Gates G0 through G3.4 Approved & Verified · Ready for Gate G3.5 Local Integration Testing  

---

## 1. Product Summary

**YCT Alert** is an independent, anonymous campus incident-reporting and public-safety awareness platform for the Yaba College of Technology (YABATECH) community in Lagos, Nigeria. It allows students, staff, and visitors to submit potential incident reports (fire, medical, security, structural hazards) without creating an account or logging in, via a responsive web client and a Capacitor Android application. Authorized administrators review, corroborate, and approve reports, publishing safe public summaries and markers to an active GeoJSON feed that YCT Map can safely display.

**Core Boundary Invariant:** YCT Map owns campus geography, walkways, and pedestrian routing; YCT Alert owns incident reports, moderation, and public safety advisories. Zero shared database tables, zero cross-database foreign keys, zero shared cookies/tokens.

---

## 2. Authoritative Document Map

| Concern | Authoritative Source Document | Evidence Classification |
|---|---|:---:|
| Reconciled Architecture & G0 Decisions | [`PHASE_0.2_DECISIONS_RECONCILIATION.md`](file:///c:/Users/HP/Documents/YCT%20Alert/PHASE_0.2_DECISIONS_RECONCILIATION.md) | **APPROVED BY OWNER** |
| Product Requirements & Journeys | [`docs/blueprint/01_PRODUCT_REQUIREMENTS.md`](file:///c:/Users/HP/Documents/YCT%20Alert/docs/blueprint/01_PRODUCT_REQUIREMENTS.md) | **VERIFIED SPEC** |
| System Architecture & Monorepo | [`docs/blueprint/02_SYSTEM_ARCHITECTURE.md`](file:///c:/Users/HP/Documents/YCT%20Alert/docs/blueprint/02_SYSTEM_ARCHITECTURE.md) | **VERIFIED SPEC** |
| Data Model & PostgreSQL Integrity | [`docs/blueprint/05_DATA_MODEL.md`](file:///c:/Users/HP/Documents/YCT%20Alert/docs/blueprint/05_DATA_MODEL.md) | **PROPOSED RELATIONAL** |
| Lifecycle & Proximity Deduplication | [`docs/blueprint/06_INCIDENT_MATCHING_AND_LIFECYCLE.md`](file:///c:/Users/HP/Documents/YCT%20Alert/docs/blueprint/06_INCIDENT_MATCHING_AND_LIFECYCLE.md) | **VERIFIED RULES** |
| API Contracts & OpenAPI Schemas | [`docs/blueprint/07_API_CONTRACTS.md`](file:///c:/Users/HP/Documents/YCT%20Alert/docs/blueprint/07_API_CONTRACTS.md) | **CORE CONTRACT** |
| Administration & RBAC | [`docs/blueprint/08_ADMIN_ROLES_AND_ASSIGNMENT.md`](file:///c:/Users/HP/Documents/YCT%20Alert/docs/blueprint/08_ADMIN_ROLES_AND_ASSIGNMENT.md) | **APPROVED GOVERNANCE** |
| Super-Admin Bootstrap (`ALERTadmin`) | [`docs/blueprint/09_ADMIN_BOOTSTRAP_AND_RECOVERY.md`](file:///c:/Users/HP/Documents/YCT%20Alert/docs/blueprint/09_ADMIN_BOOTSTRAP_AND_RECOVERY.md) | **APPROVED SECURITY** |
| Capacitor Mobile Strategy | [`docs/blueprint/10_CAPACITOR_AND_WEB.md`](file:///c:/Users/HP/Documents/YCT%20Alert/docs/blueprint/10_CAPACITOR_AND_WEB.md) | **VERIFIED MOBILE** |
| Test Strategy & Simulation Scenarios | [`docs/blueprint/13_TEST_AND_ACCEPTANCE.md`](file:///c:/Users/HP/Documents/YCT%20Alert/docs/blueprint/13_TEST_AND_ACCEPTANCE.md) | **ACCEPTANCE GATES** |
| Build Roadmap & Gate Delivery | [`docs/blueprint/14_BUILD_ROADMAP.md`](file:///c:/Users/HP/Documents/YCT%20Alert/docs/blueprint/14_BUILD_ROADMAP.md) | **DELIVERY PLAN** |
| First Implementation Sprint (S1–S5) | [`docs/blueprint/20_FIRST_IMPLEMENTATION_SPRINT.md`](file:///c:/Users/HP/Documents/YCT%20Alert/docs/blueprint/20_FIRST_IMPLEMENTATION_SPRINT.md) | **SPRINT BACKLOG** |
| YCT Map Repository Audit | [`c:\Users\HP\Downloads\YCT_MAP_Repo\YCT_MAP_REPOSITORY_AUDIT_FOR_YCT_ALERT.md`](file:///c:/Users/HP/Downloads/YCT_MAP_Repo/YCT_MAP_REPOSITORY_AUDIT_FOR_YCT_ALERT.md) | **INSPECTED REPO EVIDENCE** |

---

## 3. Approved Goals and Explicit Non-Goals

### Approved V1 Goals
1. Anonymous incident intake via web and Capacitor Android without user accounts.
2. Optional device GPS with manual landmark/text fallback that functions during Map or GPS outages.
3. Atomic client idempotency (`Idempotency-Key` header) returning CSPRNG bearer receipt tokens.
4. Non-destructive candidate duplicate suggestion (join table, manual admin confirmation; zero automatic publishing).
5. Strict admin state machine (`PENDING -> ACTIVE -> RESOLVED/REJECTED`) enforced server-side.
6. Public GeoJSON feed exposing only safe fields (`public_id`, `category`, `safe_public_summary`, `coordinates`, `published_at`, `verification_status`).
7. Dynamic 15-minute backend geography synchronization from YCT Map's `GET /api/locations/`.
8. Configurable storage abstraction (`LocalStorageAdapter` for DEV, `S3CompatibleStorageAdapter` for PROD).
9. Secure public delivery proxy for admin-approved photographs; storage bucket 100% private.
10. 30-day post-resolution data retention lifecycle with administrative retention hold overrides.

### Explicit V1 Non-Goals
1. Automated emergency dispatch (no police/fire/ambulance CAD call-outs; unstaffed pilot wording).
2. Dynamic routing avoidance (no incident-aware recalculation of YCT Map pedestrian A* paths).
3. Compulsory user registration or personal identification.
4. Continuous background GPS tracking.
5. Push webhooks in YCT Map (YCT Map has no webhook/queue architecture).
6. iOS App Store publication (Android-first; responsive web preserved for iOS users).

---

## 4. Architecture Overview & Workspaces

The repository is organized as an npm monorepo with four primary workspaces:

* **`apps/public`:** Vite + React + TypeScript + Tailwind CSS, bundled with Capacitor Android (`com.yctalert.app`).
* **`apps/admin`:** Vite + React + TypeScript + Tailwind CSS desktop and mobile-responsive moderation dashboard.
* **`services/api`:** Fastify + TypeScript + PostgreSQL REST API, schema validation, matching engine, and storage service.
* **`packages/contracts`:** Shared OpenAPI 3.1 specifications and Zod validation schemas.

---

## 5. Approved Key Decisions

* **D-01 to D-06 (Stack & App ID):** TypeScript, Fastify, React, Vite, Tailwind CSS, PostgreSQL, Capacitor Android (`com.yctalert.app`).
* **D-07 (Taxonomy):** 5 core categories: `FIRE_OR_SMOKE`, `MEDICAL_EMERGENCY`, `PHYSICAL_HAZARD`, `SECURITY_INCIDENT`, `OTHER_URGENT`.
* **D-08 (Sync Cadence):** 15-minute polling interval + super-admin manual trigger (`POST /api/v1/admin/sync-geography`).
* **D-09 (Location Model):** 3-layer location separation (Macro Map place UUID + Micro incident pin + Contextual text).
* **D-10 (Safe Locations):** Alert-owned registry; proximity $\ne$ safety; hazard deconfliction; human moderator approval.
* **D-11 (Storage):** Pluggable `StorageService` interface (local disk in DEV, S3-compatible in PROD).
* **D-12 (Photo Delivery):** 100% private bucket; public reverse-proxy delivery gated by admin approval and active status.
* **D-13 (Super-Admin):** Reserved username `ALERTadmin`; secure one-time CLI bootstrap script (Argon2id).
* **D-14 (Abuse Protection):** Layered conventional defenses (Honeypot, payload limits, sliding-window IP limits).
* **D-15 (Photo Sanitization):** Magic byte check, EXIF metadata stripping, WebP re-encoding via `sharp`.
* **D-16 (Retention Policy):** 30 days post-resolution purge; active emergencies preserved; retention holds supported.
* **D-17 (Map Omission Rule):** Multi-tick absence (2 hours / 8 syncs) before unlisting; zero instant deletion.
* **D-18 (Immediate Unverified Publication):** Eligible reports publish immediately as `UNVERIFIED` without waiting for admin triage, maintaining internal `PENDING` status.
* **D-19 (Coordinate Consensus & Auditable Overrides):** Medoid spatial calculation across legitimate reports within 50m; auditable administrator override (`COORDINATE_OVERRIDE`) with atomic coordinate selection.
* **D-20 (Sensitive Data Guardrails):** Real-time client-side warning and server-side 400 rejection preventing publication of contact or identifying numbers.
* **D-21 (Fail-Closed Local Testing Override):** `ALLOW_LOCAL_NON_TEST_REPORTS` restricted strictly to development environments; throws critical exception and crashes on boot in production mode.
