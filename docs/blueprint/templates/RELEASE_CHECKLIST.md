# Release Checklist — [Build ID]

**Environment:** DEV / TEST / STAGING / PRODUCTION  
**Release owner:** [name]  
**Approved by:** [name and date]

- [ ] Explicit product scope and operational status approved.
- [ ] Correct build commit and clean change diff.
- [ ] No credentials, signing keys or private reports in repository/build.
- [ ] Migrations reviewed, DB target confirmed, backup/rollback tested.
- [ ] Unit, integration, API contract and browser tests reported accurately.
- [ ] Physical Android permission, network and lifecycle tests completed.
- [ ] Admin authorization, revocation and protected super-admin tested.
- [ ] Idempotency and concurrent duplicate tests passed.
- [ ] Public incident feed contains only safe ACTIVE incidents.
- [ ] Alert-down and Map-down fallback tests pass.
- [ ] Synthetic incidents cannot reach live Map/public incident feed.
- [ ] Map routing/GPS/verification untouched or regression-approved.
- [ ] Web error copy does not imply emergency dispatch.
- [ ] Verified emergency contacts/privacy notice and authorized coverage in place for real pilot.
- [ ] App ID, signing custody and store/hosting account ownership recorded.
- [ ] Feature flags, monitor/alert and rollback owner assigned.
- [ ] Any unrun/blocked test is explicitly documented and accepted or blocks release.

**Outcome:** GO / NO-GO / GO FOR SYNTHETIC TEST ONLY  
**Evidence links:** [redacted]
