# Recurring household water relief

This optional pack implements one genuine recurring need loop. It does not change
founding request IDs, the original causal/terrain manifests, stock, water sources,
or the authored Mossbank commissions. It is not a general event director.

## Actual relief, consumption and relapse

Each settlement observes its actual household reserve at **8 L or more**. A later
committed quarter-second may open a request only when the reserve is **below 3 L**,
residents have consumed **at least 5 additional litres** since that observed relief,
and a full **4-renown** reward can be reserved. A supplied town cannot produce
periodic arbitrary work. Only one episode per town can remain active or awaiting a
claim. Failure does not immediately reissue the request: a fresh observation of
relief and later consumption/relapse is required.

Accept at the issuing settlement flag, then restore the real reserve to **6 L**.
A newly consumed player canister, including one donated through the commons
exchange, counts only if cumulative `playerDelivered` increased after the accepted
receipt. A source repair by itself earns no recurring credit. Resident/carrier or
cave relief without new accepted player delivery resolves the episode unpaid.
Existing direct delivery and commons commands remain the only water-transfer
boundaries; this pack does not create or duplicate any water.

## Deadlines and finite rewards

- Completion must happen strictly before creation + **180 active-world seconds**
- An earned completion permits a claim strictly before completion + **180 seconds**
- At exact deadline equality, expiry wins before relief inspection or a claim
- Completion/claim expiry stores the actual physical-water receipt and failure cause
- A completed request remains earned even if its reserve is consumed before claim
- Claiming requires a living valley player within the existing 3.5 m flag distance
- Claiming moves one reservation to spent renown exactly once
- Resolution and expiry release reservations without paying anything

Every reward comes from the original **32-renown budget per settlement**. Founding
and recurring claimed/reserved liabilities are summed by both the founding
reservation code and the validator. Historical founding liability is reconstructible:
a claim transfers reserved to spent, while an unpaid resolution releases at its
recorded `resolvedAt`. Bounded receipt replay checks the budget at every opening,
not just the final state. Remaining budget below 4 defers issuance; no fractional
or zero-reward request is advertised. Total causal renown remains at most **64**.

There are at most **8 episode identities per town**, at most one pending arm per
town and at most **82 persisted records**. Identity is the semantic plan/home ID
plus the replayed per-home ordinal. No terminal history is discarded or reused.

## Additive storage and replay

`causal.waterRequests` is optional, separately versioned and hashed. Absent old
saves keep their exact serialized shape. `enableWaterRequests(world)` initializes
once from current committed counters; it does not infer old relief or perform
elapsed-time catch-up. Current relief can arm the first future relapse. Explicitly
present undefined, null or malformed values are rejected rather than replaced.
Solo activation/immutable rollback storage is an owner integration responsibility.
Online creation, join/resume and the pre-action authority path enable absent packs.

The payload contains its baseline, revision and compact records:

    [kindCode, canonicalHomeIndex, activeTime,
      [reserve, delivered, playerDelivered, consumed]]

Kind codes are 0 arm, 1 open, 2 accept, 3 complete, 4 resolve, 5 claim and 6 expire.
Each array has an exact shape; indices, counters and semantic episode ordinals are
validated/replayed rather than accepted from a client. The public projection
expands records to named evidence, full semantic home/request/issuer IDs and actual
causes. Physical ledger balance uses the original causal **1e-5 L tolerance**;
identities, rewards, revisions and canister counts remain exact integers.

Replay validates identity, chronology, thresholds, fresh player credit, terminal
ordering, deadlines, counter monotonicity, final physical ledgers, record bounds,
and historical/current issuer liabilities. It is save consistency validation,
not cryptographic authentication of player-edited files.

## Integration API

- `enableWaterRequests(world: State): State` explicitly adds an absent pack
- World action: `{type:'water-request', command:{type:'accept'|'claim', id,
  expectedRevision}}`
- `applyWaterRequestCommand(causal, context, command)` validates receipts and the
  exact command before projection; blocked/malformed/stale commands preserve the
  original reference
- `waterRequestView(causal, seed)` returns full episode/evidence/history projections,
  household budget availability, and the current request revision
- `mountWaterRequestsSection(container, world: State, options)` uses full World State
- Options: `command(command)`, `canRun(command)`, optional `continuesInMenus`
- The owner supplies reducer-backed callbacks and passes `continuesInMenus: coop.active`
- Existing frontier/commons controls handle delivery; this section only accepts/claims

The UI writes literal text, uses no simulation or expiry timers, and rerenders
committed snapshots only. Closed-by-default history expansion and keyboard focus
are preserved across repeated authoritative remounts. Every click rechecks its
captured ID/revision against `canRun`, including old callbacks after newer snapshots.
Solo menus/background pause the solo clock. Online menus continue shared host time;
a backgrounded guest does not pause the room. Host inactivity follows the existing
co-op authority's pause/no-catch-up rules.

## Verification and import envelope

- Real seed 1 gameplay: 3 collected canisters support two distinct relief → resident
  consumption → relapse episodes, opened at 91 s and 224.25 s, paying 8 total renown
- Real seed 15 gameplay: original founding rewards pay 28, one recurring request
  pays the remaining 4, and another genuine relapse is deferred at the 32 ceiling
- Same quarter-step causal state under 0.25/1-second partitions, reloads, partial
  accumulators and oversized input clamping; exact completion/claim deadline tests
- Two active-world hours with real source extraction, carrier trips and resident
  consumption, with 30 repeated exact serialize/parse checks
- Exact command shapes, malformed/explicitly-present optional data, counter/reward
  corruption, remote/dead/out-of-zone commands, stale callbacks and duplicate claims
- Four real HTTP players over SQLite CAS; simultaneous founding + recurring claims,
  lost-success byte-for-byte retry, old room baseline, durable resume and host pause
- Pure DOM contracts cover literal text, gated commands, authoritative deadline
  boundaries, online clock copy and preserved expansion/keyboard focus

`node --experimental-strip-types scripts/water-request-size-envelope.mjs` measures
a deliberately overfilled serialization-only envelope, not a playable fixture.
It uses maximum 10-digit seed identities, all 82 recurring / 144 economy / 132 ecology
record caps simultaneously, eight economy incidents, four commons receipts, cave
water/supply/receipts, custom equipment, six resident routes, eight founding jobs,
12 modules/24 links, finite collection/tombstone IDs and 20 × 300-byte production
message allowance. Numeric fields use long finite representations; another 4,096
bytes covers growth of remaining snapshot counters. Those independent history
maxima cannot all be earned from the same finite stock, so this is intentionally
conservative for production saves, not a bound on arbitrary edited prose accepted
by legacy validators.

Compact recurring payload: **9,011 bytes**. Combined envelope: **90,403 bytes**;
with numeric-growth allowance: **94,499 bytes**. The **100,000-byte import limit is
unchanged**, leaving 5,501 bytes of headroom. A regression runs this envelope and
checks the unchanged import gate. The owner should rerun it after future pack growth.

No browser, live preview, screenshot, WebGPU, touch-device or visual approval was
performed. The previously denied browser route was not retried. No hosting,
services, credentials, database schema, commits or canonical source were changed.

## Integrated controls and recovery

Settings and the Living frontier navigation open a dedicated recurring-request panel. It links back to real household delivery and existing-stock barter, gates commands through the world reducer and refreshes from authoritative online snapshots. Online copy explicitly says menus do not pause the shared clock. The section retains open history and keyboard focus across snapshot refreshes. The same accepted request can be relieved through an actual commons exchange; concurrent four-player tests prove one reciprocal exchange, one completion and one4-renown payout.

Before the first local save introducing this optional renown ledger, the session preserves a valid same-world raw pre-request checkpoint, independently of earlier equipment/barter backups. Settings exports those exact bytes. Quota failure or an invalid occupied checkpoint leaves current and rolling slots intact. No earlier save is fabricated for new worlds. Online rooms remain separate and require compatible source versions; there is no promise of arbitrary backward loading of evolved room JSON.

The disposable world-systems lab includes a named seed-1 two-episode recurrence check using three actual collected canisters, real resident consumption and the original finite reward budget. This does not mutate the campaign or certify rendered quality.
