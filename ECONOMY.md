# Bounded workshop commissions and natural wear

This pack adds a finite player-funded production loop, not a market simulation,
large population economy, or general quest director. It is renderer-independent.

## Canonical material flow

- At an assigned, operational workshop, commission one kit for **2 existing player
  scrap**. The scrap moves to that workshop's feedstock. Nothing is gifted or mined.
- **12 new seconds of actual causal caretaker service** convert 2 feedstock scrap
  into 1 repair kit. Existing causal work already consumes household water and
  requires resident needs and route access to allow work.
- Collecting transfers completed workshop stock to carried kit stock. It pays no
  reward, does not produce another kit, and cannot collect the same stock twice.
- Recycling at an assigned workshop consumes one kit and returns **1 scrap**.
  The second original scrap is lost. There is no profitable closed trade loop.
- Repairing a naturally worn production press consumes **1 whole kit** and awards
  **2 craft renown once**, separate from the causal founding-job ledger.

The existing player inventory remains `{scrap, core, water}`. Repair kits stay in
`EconomyState.kits`. `economyCost` is the net player inventory debit:

    scrap = 2 * commissions - recycledKits
    core = 0
    water = 0

Conservation is additionally checked inside the economy:

    2 * commissions = feedstock + 2 * workshopKits + 2 * carriedKits
                      + 2 * repairedPresses + 2 * recycledKits

There is no new raw-resource source. Returned scrap remains part of the same
collected world-resource total. The pack must be included in both the world save
conservation equation and historical pump-payment inference.

## Bounds and physical requirements

- Only workshops with actual assigned caretakers manufacture
- Maximum 4 queued kits and 4 completed kits per workshop, 6 carried kits
- Maximum 32 lifetime commissions, 8 natural-wear incidents and 16 craft renown
- Actual causal service is the clock for manufacture; idle, full and jammed presses
  do not bank unused service for future orders
- In-world transactions require a living valley player within the existing 3.5 m
  work-point distance, including actual terrain elevation
- Commands cannot run against stale causal time or service
- Menus/background invoke no ticks; there is no separate timer or offline catch-up

## Natural wear is an honest, bounded maintenance request

Wear selects a seeded eligible workshop. It requires a previously manufactured
kit, at least 24 new service seconds since the previous wear/baseline, at least
120 seconds of world-time rest since the last repair/baseline, and a kit already
in the player's possession. It fires only on a frame with new service at its target.
At most one incident is active. The last carried kit is reserved and cannot be
recycled while an incident is open. No deadline or invented salvage reward exists.

The damaged object is the **production press**, an economy-owned workshop overlay.
It stalls kit manufacturing. It does not toggle the founding causal workshop's
`operational`/`repairedBy` state, undo founding repairs, invent a new founding job,
or pretend the whole building is destroyed. Caretaker service may continue while
manufacturing is stalled. There is no player-damage API or sabotage-reward path.

## Integration API

`createEconomyState(seed, causal)` initializes at the current committed causal time
and service. This is also the optional-save migration path: historical service
cannot create goods or retroactive incidents.

`advanceEconomy(economy, causal)` consumes the newly committed service after each
causal tick. It is immutable and deterministic for the same fixed-step replay.

`applyEconomyCommand(economy, causal, causalContext, command)` returns
`{state, inventory, message}`. The world reducer must commit returned economy and
inventory atomically. Unknown/blocked commands return the original references.
Supported commands are `commission-kit`, `collect-kit`, `recycle-kit` with a
`workplaceId`, and `repair-press` with the exact committed `incidentId`.

`economyRecoverableScrap(economy)` returns recyclable carried/completed kits, less
one reserved incident kit. Add this to causal recoverable scrap so existing jobs
recognize real reversible stock; queued feedstock is excluded because it still
requires future production.

`ECONOMY_RECIPES` and `ECONOMY_ACTIONS` expose immutable typed input quantities,
service requirements, capacities, preconditions and committed effects.

`validEconomy(value, seed, causal)` rejects malformed payloads without throwing and
replays every bounded factual transaction. It verifies identity, exact shapes,
stock, progress, chronology, actual-service limits, rest periods, one-time reward,
reserved stock and conservation. The host must independently validate the causal
snapshot and canonical inventory. This is state validation, not cryptographic
save authentication.

`economyView(economy, seed)` contains presentation data only. History descriptions
come exclusively from committed typed records. Settlement names and workplace
identity come from the existing seeded causal plan. Motifs such as “Care and
repair” summarize actual transactions and make no claim about unrecorded events,
resident opinions or a wider cultural simulation.

`mountEconomyPanel(panel, {state, act, close, selectedWorkplaceId?})` is the isolated
DOM adapter. `state()` returns `{seed, economy, causal, context}`. `act(command)`
invokes the host reducer synchronously. It rerenders authoritative snapshots after
commands, uses plain text nodes, and has no simulation timers. Existing frontier
classes supply its styling. Its tests are DOM-contract tests, not screenshot QA.

## Verification

`node --experimental-strip-types --test tests/economy*.test.ts`

Tests cover immutable commands and deterministic roundtrips, actual resident work
and water consumption, input/output conservation, capacity and discarded idle
work, proximity/death/zone guards, repeated natural wear and rest periods, reserved
kits, reward replay, save corruption, factual history, mixed two-town trading, and
the pure DOM panel's exact targets/disabled states/refresh behavior.
