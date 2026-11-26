# 15 — Environments, Hosting, Secrets and Release Procedure

## Environments

| Environment | Data | Allowed actions |
|---|---|---|
| DEV | Disposable synthetic | Feature development, local scripts, rebuilds |
| TEST/CI | Isolated synthetic | Automated migrations/tests; no real credentials or reports |
| STAGING/PILOT | Restricted supervised data | Integration and authorized pilot only, protected admin |
| PRODUCTION | Real users, only after policy/operation signoff | Audited deployments and authorized migrations only |

No `db:seed`, destructive migration, schema reset or production deployment without owner authorization. Agents must echo safe hostname/environment labels without printing secret connection strings.

## Hosting architecture

Choose **independent** Alert API hosting/DB from Map's Neon/Render resources. Free hosting is acceptable for experimentation but cannot be assumed emergency-grade. Evaluate idle sleeping, cold start, outbound networking, DB connection limits, automated backups and monitoring before running a live reporting service.

- Public web: deploy built static frontend (possibly CDN/static provider) with HTTPS.
- Android: bundle frontend assets, API over HTTPS; no embedded admin secrets.
- Admin web: separate host/path, secure sessions, verified origin/CSRF configuration.
- API: persistent hosted service for pilot as justified; DB in separate PostgreSQL project.
- YCT Map: do not redeploy or modify until integration-specific gate.

## Recommended CI checks

Formatting/lint → unit tests → API schema validation → isolated DB integration → browser e2e → static secret scan/dependency check → signed artifact build (restricted) → manual device verification for releases. Keep deploy permissions separate from read-only coding agents.

## `.env.example` policy (names only)

```dotenv
# Illustrative names only — no live credentials
APP_ENV=development
ALERT_DATABASE_URL=
ALERT_PUBLIC_BASE_URL=
ALERT_API_BASE_URL=
YCT_MAP_PUBLIC_GEOJSON_URL=
ADMIN_SESSION_SECRET=
ADMIN_BOOTSTRAP_SECRET=
PUBLIC_FEED_REFRESH_SECONDS=
INCIDENT_MATCH_RADIUS_METERS=
INCIDENT_MATCH_WINDOW_MINUTES=
```

Do not place `ADMIN_BOOTSTRAP_SECRET` into Android build environment variables prefixed for frontend exposure. For production prefer a one-time secret-injection process outside the frontend/CI logs.

## Release sequence

1. Owner selects release scope (internal test APK vs public web pilot vs store release).
2. Check gate test matrix, open risk register and all unresolved *blocking* questions.
3. Confirm migration plan/backups/restore rehearsal and separate DB target.
4. Confirm trusted certificates, domains/origins and permissions.
5. Check the generated Android artifact signing identity, keystore custody and package ID.
6. Deploy API/staging first, then web client, then device test; stage Map adapter separately.
7. Run smoke tests (report → receipt; admin → status; active feed; Map overlay degraded/working).
8. Record build commit, artifact hashes, changed config, signing and rollback plan, actual owner approval.
9. Monitor errors and incident-feed freshness; support a rollback/kill switch for public overlay.

## Backup and restore

Define RPO/RTO for chosen hosting only when operational owners and budget exist. At pilot gate perform real restore into isolated test environment; a nominal backup checkbox is insufficient. Protect audit trails and DB dump privacy.

## Release note

Never announce `official emergency service` or `24/7 assistance` without proof of institutional authorization and operational coverage. A signed APK alone is not an operational emergency response launch.
