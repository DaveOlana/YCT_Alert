# YCT Alert integration example — v0.2 drop-in

1. Create a **separate YCT Alert repository**; do not place AEOS at the root of the existing YCT Map repository.
2. Extract the **contents** of `AEOS_v0_2_Drop_In` into the YCT Alert root, not into an `AEOS_v0_2_Drop_In/` subdirectory. If root instructions already exist, reconcile them without overwrite.
3. Put the entire 31-entry YCT Alert builder blueprint under `docs/blueprint/` and preserve its `AGENTS.md`, G0–G5 gates and original documents. Include companion YCT Alert Agent Guide and Map/Alert Integration Brief as supplied.
4. Provide **read-only access** to the separate YCT Map codebase. Map owns geography/routing; Alert owns incidents/admin/database. Confirm actual APIs in source; do not invent endpoints.
5. Send: `AEOS INIT: inspect the Alert blueprint and Map read-only. Generate PROJECT.md and STATE.md as factual indexes, list approved versus proposed decisions, list G0 blockers, propose synthetic-only first vertical slice; no application code.`
6. Review initial records and explicitly approve relevant G0 decisions. Authorize a **bounded** `BUILD S1` only after all required gates have been met.
7. During BUILD, agent can implement and verify within S1, but cannot commit/push/deploy without separate authorization. Real Android checks required for device-dependent claims; do not leak synthetic alerts to public feeds.

**Important:** This example uses prior supplied YCT Alert documents; it does not certify actual current YCT Map APIs, deployment or code quality. No official emergency-response service may be inferred from a functional prototype.
