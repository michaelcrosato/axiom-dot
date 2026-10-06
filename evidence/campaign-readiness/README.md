# Campaign readiness and reply hardening verification

Frozen tested source: `35fa4cc6c0a8b34d99478cc469c207c86cae6586`. The later evidence commit adds only this directory.

- **1,906 permitted cases across 275 files pass**, with zero failures, cancellations, skips or todos. All 1,864 previous cases remain; 42 were added. Four existing source-extraction tests only gained the new dependency or equivalent wiring assertion; no behavioral assertion or case name was removed.
- Independent and root registration-only catalogs exactly match the complete TAP by case name and contiguous ID. All **828 frozen hashes** remain unchanged. The same **13 held files** are excluded and unchanged from baseline `19db579`.
- Both TypeScript projects and production client/server build pass. Eleven source/emitted gates cover the current connected models, save/HTTP authority, workers/main/startup, staged geometry, readiness and the built client.
- `emitted-feedback.json` compares 524,288 boolean control combinations and 160 target cases against the actual production readiness export, with explicit priority/recovery/read-only assertions. These are presentation-condition fixtures, not simulated player journeys.
- `emitted-client.json` runs eight source/actual-built-client deferred mocked-HTTP traces: queued/in-flight acknowledgement without model changes, older replies, exact retry after loss, malformed new-overlay replies, suspension and late disconnect. This is not real network/server integration; the other domain reports retain their disposable HTTP/SQLite checks.
- Existing staged geometry retains 147 plans / 2,352 source/emitted Three frames and invariant colliders. No browser/GPU/touch/device acceptance is claimed.

The first full attempt is retained in `first-attempt.tap` and `first-attempt.json`: 1,903 passed, two missing-fixture-dependency failures, and one unchanged animation-replay timeout counted as cancelled. The narrow fixture correction and isolated 11-case recovery passed; the entire suite was then rerun after refreezing, with one test file at a time and unchanged deadlines. Before/after files are development regression records. `main-before.tap` and `restoration-before.tap` replay the final new tests against actual baseline `19db579` main/UI source in temporary files with current unchanged dependencies; their corresponding current-source cases pass. Earlier focused records may precede the final additional cases. The final frozen suite and independent certificate are authoritative.

Scheduling: Node 22.23.0; all emitted gates completed before `taskset -c 0,1 node scripts/cloud/test-safe.mjs` (one test file at a time). No deadline, assertion, exclusion or runner was relaxed. No new dependencies, live saves, credentials, original private Site or hosting/sharing changes.

See [CAMPAIGN-LOOP.md](../../CAMPAIGN-LOOP.md) for the connected player/developer route and recovery steps. Existing gateway-crate/fatigue-replay caveats and all held scope remain.
