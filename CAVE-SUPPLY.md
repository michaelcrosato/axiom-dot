# Metered cave outfall to real household water

This staged additive pack connects the existing finite-volume cave to the existing
household loading depot. It does not add a raw-material source, canister inventory,
free goods, a new reserve or a remote backend. Old cave, causal, foundation and
economy manifests remain pinned.

## Paid action and real effects

At the existing dry-bank drain control, `connect-outfall` consumes **2 player scrap**
once. It installs a permanent small diversion with an exact **0.5 L/s** maximum
rate. The natural seep, cleared drain and repaired pump all supply the same
connection. Their original flood volumes, flow rates and route effects are unchanged.
The connection itself does not open the cave, fill a household or award job credit.

New committed pumped and drained outputs remain distinct m³ source receipts.
Their sum is converted using **1 m³ = 1,000 L**. Capture is limited simultaneously
by actual newly discharged volume, the meter's newly elapsed time and free capacity
in the existing 20 L household depot. All other new discharge is immediately
classified as discarded. There is no queued spill that can be recovered later.

A depot withdrawal tags only its actual proportion of cave water. The same tagged
litres travel in the existing carrier's cargo along the existing threat-gated route,
then enter that carrier's own household reserve. A founding water job earns cave
contribution evidence only on an actual positive tagged household delivery after
acceptance. The existing actual 6 L household predicate still decides completion.
Past deliveries, connecting a dry pipe, a full depot and a blocked route do not
award credit. Claims retain the existing exactly-once issuer reward ledger.

The original `waterRestored`, intake extraction, player-canister and modular-overflow
ledgers are unchanged. Cave water can satisfy a founding household need even when
no canisters remain available, including after another optional pack used them.
The bridge does not satisfy an unpaid original Mossbank commission by changing its
historical payment flags.

## Conservation and scope

For each pumped/drained stream, in m³:

    baseline + captured + discarded = seen = current cave sink total

The optional causal provenance ledger, in L:

    received = tagged depot + tagged carrier cargo + tagged household deliveries
    received = 1,000 × (pumped captured + drained captured)

Cave provenance is included once in the causal water balance. Household delivered
water remains accounted for by the existing reserve and consumed-water identity.
The exported `caveSettlementWaterBalance` treats cave captures as internal transfers,
subtracting them from the cave's outside discharge when combining both systems.

Proportional mixing and independent m³/L totals use a small new-receipt floating
allowance of 1e-7 L plus one part in 10 billion of cumulative receipts, capped at
**0.0001 L (0.1 millilitre)**. This is validation tolerance, never newly supplied
water. Existing source counters are not rewritten to hide a residual. Material
costs remain exact integers. Invalid present pack hashes, shapes, receipts, source
coupling or payment conservation are rejected rather than reset.

A closed repaired valve has finite usable water and eventually stops supplying.
Opening it admits real new source volume. The planner treats an open source gate
as sustained supply; a closed gate uses the existing conservative finite-stock
check based on actual carrier cargo, not optimistic recovery of all cave volume. Leaving the source open with a repaired
pump or cleared drain retains their original alternative fast-access strategies.

## Clock and migration contract

`CaveSupplyState` is optional on the world. `CaveReceipts` is optional on causal state.
Old generation-1 worlds stay unchanged. On first cave entry or load of a valid old
generation-2 cave world, `createCaveSupply(seed, cave)` snapshots its cumulative
pumped/drained totals as permanently excluded historical baselines. It initializes
unconnected with zero captures and zero causal receipts. Existing deployed schema
migration steps are not edited.

`connectedAt` records `cave.elapsed + cave.remainder`. Installing 0.20 seconds into
a quarter allows only 0.05 seconds of metering at the next boundary. Death while
that fraction is pending preserves it across save/load; no dead tick advances it.

`advanceCaveSettlement(cave, supply, causal, context, dt)` owns both cave and causal
advancement when the bridge is present. It splits at the next existing cave or
causal quarter boundary, preserving their independent remainders. There are at
most four cave boundaries, four causal boundaries and a final partial slice per
bounded one-second call; the loop budget is 12. There is no wall-clock or offline
catch-up. Identical committed steps at 60 Hz, quarters or grouped seconds give the
same physical receipts. Host pause policy remains authoritative.

## Integration handoff

This additive pack is integrated with the ecology checkpoint; the shared clock and material ledgers retain their separate ownership. Deployment follows the final independent gate.

New modules:

- `src/cave-supply.ts`: manifest/hash, state/cost/context/validator, paid command,
  bounded joint tick, presentation summary and combined conservation residual
- `src/cave-receipts.ts`: optional provenance state, receiving, proportional fetch
  and delivery adapters, bounded-rounding validation and actual-delivery evidence

Host integration in the staged diff:

1. Add optional `State.caveSupply` and the exact `cave-supply / connect-outfall`
   action; initialize the optional bridge on generation-2 cave entry/load
2. Include its two-scrap cost in current resource conservation and historical pump
   inference. Preserve the existing ecology water debit while merging these lines
3. Add `caveSupplyContext` to the causal context and validate the bridge before
   validating causal receipts. Missing bridge with positive receipts is invalid
4. When the bridge is present, skip direct `advanceCaveWater` in the ordinary world
   tick, and call the joint helper instead of a second `advanceCausal`. Commit all
   three returned states atomically. Advance economy once from that causal result;
   keep ecology on its independent alive world tick as before
5. Admit exactly `{type:'cave-supply',command:{type:'connect-outfall'}}` in server
   command validation, using the existing shared room clock and reducer. No amount,
   water total, clock or replacement state comes from the client
6. Expose the paid connection and capture/discard ledger in the existing cave board,
   plus actual received/delivered receipts on the existing frontier loading point

## Verification

Focused tests cover paid exact inventory, repeated/refused actions, m³/L capture,
full-depot discard, proportional mixed sources, tagged carrier trips, unchanged old
sources, acceptance/claim timing, all three original cave choices, exhausted closed
valve and reopened source, no-canister feasibility, offset clocks and 60 Hz inputs,
mid-quarter install/death/reload, save corruption and baseline migration, all zones,
co-op retries/two peers/one clock, DOM callback and disabled-state contracts, and an
eight-hour mixed-source stress run. The UI checks are DOM contracts, not screenshot,
mobile ergonomics, browser-rendering or measured runtime-performance approval.

## Integrated game controls and finite capability

The cave board exposes the paid connection at the dry-bank drain control; an attached meter appears only after payment and its needle follows actual captured litres. The loading-point board reports received and actually delivered water separately. Online menus explicitly continue the shared simulation. Existing durable rooms initialize a missing bridge before their first same-time action, never resetting present malformed data. The repeated systems course runs the real diversion, carrier deliveries and save ledger in disposable worlds.

A connected open source counts as sustained supply. A closed gate does not claim that residual cave volume guarantees a solution: only real current canisters, depot stock and assigned carrier cargo count toward finite water capability. Counting depot stock is a capability check for each individual need, not a multi-job reservation or delivery guarantee; safe roads and actual household receipt remain required. Worlds without a connected bridge retain their prior feasibility policy.
