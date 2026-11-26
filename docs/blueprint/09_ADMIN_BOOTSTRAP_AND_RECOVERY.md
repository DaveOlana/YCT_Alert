# 09 — Secure Super-Admin Bootstrap and Recovery

## Non-negotiable credential rule

**Never hardcode plaintext administrative credentials in source, migrations, frontend assets, documentation, or Git history.** The owner-proposed username is **`ALERTadmin`**. The password previously discussed in chat is already exposed and **must not be reused**. This document deliberately does **not** reproduce it.

The protected account is *logically permanent*, not a permanent password.

## Bootstrap procedure — proposed

1. Initialize database schema in the selected environment through an approved migration.
2. Use an **explicit, one-time privileged CLI/bootstrap process**, not a public API endpoint; require an environment secret or interactive secure password entry and verified owner authorization.
3. Create the protected account with username `ALERTadmin` if absent and `protected_owner=true`, using a hardened password hash (prefer Argon2id with reviewed settings).
4. Log that bootstrap succeeded (account ID/time/environment) without logging the secret or password hash.
5. Consume/delete one-time bootstrap secret from the running environment where supported; enforce password reset at first sign-in if initial credentials were temporary.
6. Set up a second factor or other strong privileged access control before handling real public incidents, subject to the chosen auth system.
7. Run smoke tests: normal admin cannot revoke/delete protected account, protected account can grant and revoke an admin, revoked sessions fail immediately.

## Security essentials

- Unique password, salted one-way hash, TLS, brute-force protections, login and privilege change audit, session timeout and secure cookies if browser admin.
- `Secure`, `HttpOnly`, `SameSite` (chosen based on actual origin architecture), anti-CSRF measures for cookie-authenticated state changes.
- Separate dev/test/prod identities and secrets. Production secrets never in test fixtures or screenshots.
- Password values do not belong in `README`, `.env.example`, JavaScript bundles or issue discussions.
- No shared Alert/Map/YCEP credentials or cookie namespaces.

## Recovery and owner transfer

- Prefer documented two-person verified recovery in later institutional operations.
- Recovery should not depend on knowing an unchangeable hardcoded password.
- Out-of-band identity proof and audited secret reset under owner control; invalidate all old sessions.
- Guard against removal of the *last* functioning super-admin authority; protected ownership may be transferred with verification and rollback, never silently reassigned by student admins.

## Testing

1. Fresh approved environment bootstraps exactly one protected super-admin.
2. Running bootstrap again is idempotent, never resets credentials silently.
3. Strong authentication with hashed secret succeeds; raw secret absent from DB, logs and code.
4. Assigned admin cannot elevate self, change super-admin secret or delete protected identity.
5. Revoked admin token/session fails on the next protected request.
6. Reset invalidates prior sessions; expired assignment loses privileges.

## Deployment gate

Protected-role bootstrap and recovery must be reviewed by someone other than the agent who authored the implementation. Do not make a public pilot dependent on a single known-password login with no recovery plan.
