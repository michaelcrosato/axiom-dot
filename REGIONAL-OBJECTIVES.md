# Regional objective handoff

The live project HUD now follows one nearby community through its actual freight,
collector, crop and food-delivery dependencies. It is a read-only projection of
the existing production state, not a new quest system or simulation.

## Selection and priorities

- The closest fixed community/work-point anchors select a community. A transient
  UI cursor retains it until another is both 64 m and 25% closer, or the player
  approaches a different work point within 3.5 m. Carrier movement, rain changes
  and task completion never rotate communities by themselves. Direct approach
  prevents an old incoming source from pinning a remote completed community.
- Accepted Mossbank requests and active commissions keep their existing priority
  inside the core valley. Cave, vault and laboratory objectives keep ownership.
- For a community with a freight store, start its real source, repair the real
  road and build the store from delivered stock. A waiting carrier can yield to
  collector materials already in the player's pack.
- A **built store** hands off immediately. It does not demand all eight reserve
  withdrawals or wait for source exhaustion. Actually withdrawable reserve may
  still be suggested if its material is needed for the selected collector.
- Collector guidance distinguishes missing material, staged material, work in
  progress and completed infrastructure. Raw availability uses gathered plus
  withdrawn stock minus every collector's allocations.
- Food guidance distinguishes local startup, real crop water, optional tending,
  harvesting, loading, travel, unloading and actual consumption. Optional work
  on a second crop cannot hide the first crop's delivery or meal.

## Honest states and water causes

`actionable` means there is local work the player can pursue; it does not bypass
distance, grounded stance, collision acknowledgments, current revisions or the
online server. `waiting` means the selected dependency needs active world time.
`completed` for a food loop requires positive harvested and delivered food and
more consumed meals than the entire finite starter allowance. Starter meals,
held portions, pantry stock and stewardship marks are not completion evidence.

An unbuilt collector is an infrastructure shortage. Once it works, dry weather
is distinct from rain that must refill the residents' drinking reserve before
new overflow can reach crops. No forecast promises immediate overflow. Food v2
can mention the existing optional once-per-farm 4 L canister import only when its
earned canister and full receiving space are available. Used entitlement stays
used; v1 remains overflow-only. An already funded irrigated crop stays visible
even when its renewable collector is unfinished.

## Controls and persistence

Inspect and Map open the existing read-only panels. All start/build/deliver/tend/
irrigate commands remain in their original local E / X paths. The HUD never
dispatches a production command, spends stock, grants a reward, advances a clock,
or writes a save. Disabled, superseded and hidden inspection callbacks cannot
act. Buttons use 44 px minimum height and descriptive accessible labels; their
actual device layout remains unreviewed.

The existing Journal mirrors the current project text and keeps its community
inspection links. Touch mode's existing compact HUD rules remain unchanged;
Menu → Journal provides the guidance when that mode hides the project overlay.

No save schema, generation flavor, production rate, resource, price, reward,
server protocol or migration changes are included. The HUD avoids finite-source
catalog generation; it reads production food/freight summaries plus collector
ledger balances and the existing supply-weather projection.

## Regression evidence

- `tests/regional-objective.test.ts`: independent pure-selector fixtures.
- `tests/regional-objective-ui.test.ts`: literal DOM and executed main adapter,
  read-only inspection, disabled/stale controls, core/lab ownership, solo/online
  waiting, and actual production milestones.
- `tests/fixtures/regional-objective-events.json`: accepted actions copied from
  the prior 73129 regional-rain/regional-travel matrix report at clean commit
  `5bdbd3b7725aae0512577b572c3cba9fe422a62c`, whose final fingerprint is `28f357e8`.
  This regression starts empty, executes ordinary production actions and ticks,
  and stops at the first proven crop meal within a 2,500-second bound. It reaches
  the store at 488 s, collector at 1,142 s, delivery at 2,399 s and crop meal at
  2,401 s. Approach poses are model assignments, not controller traversal.
- Existing food/supply/freight extracted-main, UI, physics, recovery and co-op
  tests continue to cover original action authority.

The inherited terminal-clock review and release holds remain. No browser,
rendered/device, registry, deployment, live-save or archive-replacement work is
claimed. Validation uses the explicitly selected ordinary-safe suite, with its
13 held clock-probe files excluded, rather than a full aggregate test run.
