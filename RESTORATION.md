# Habitat restoration · bounded pack 1

This additive pack connects modular neutral bodies, compiled utility actions, conservative fields and plant recovery. It does not alter the old sentries, gardens, regional food/weather clocks, the historical town stores, generation foundations or original Site. The additive care connection described in RESTORATION-CARE.md transports finite surplus biomass to a separate apothecary stock.

## Find and play

Open **Menu → Play & world → Habitats · automaton & restoration**. The full **M atlas** has three restoration destinations near Fern Hollow, Old Kiln Ruins and Fallen Survey Station. The dock and machine can also be opened with **E / X** when nearby.

1. Reach a dock. A basic nimble/reed/filter body costs three real scrap, the amount in the once-only arrival kit. Other bodies have their own compiler-derived cost.
2. Stage the body and utility recipe, then Apply refit. Service the packed rig to transfer finite dock charge, filter capacity and scent, and to seal captured waste.
3. Stand beside the dock, clear of its body footprint, and Deploy. Choose a source and target cell. Non-pump organs operate on one selected cell; the pump transfers between adjacent cells or the onboard tank.
4. Close the panel to let the actual automaton walk to its source and complete windup/work/recovery. Follow it to issue new local orders. A changed order interrupts the old cast into its original cooldown; it cannot rewrite an accepted pulse.
5. Recall returns along the same path and packs only at the dock. If charge runs out, a nearby grounded explorer can tow it along that path. Blocked routes still stop it.
6. Restore every cell's actual viability/health. The restored site's recovered biomass can provide finite suit repairs; each repair consumes that biomass. No new canonical scrap, water, cores or renown is minted.

Sites remain dormant and pristine until the first successful local refit/service/deploy there. Merely opening a remote panel does not start them. After activation, their bounded state continues on active game time. This preserves the initial heat/smoke encounter during the walk to a distant site. Solo menus/background pause simulation; shared room time continues. There is no offline catch-up.

## Body and ability composition

One separate neutral quadruped family compiles trunk, four named two-link supports, drive, shell and one utility organ through the existing semantic compiler. Typical output is 16 nodes and 20 shapes, below explicit 40-node/80-shape budgets. Historical enemy plans and animations remain pinned.

- Nimble/sturdy supports change actual travel speed and preparation pace
- Reed/alloy shells change actual heat tolerance; the hotter sites make waiting/cooling versus a paid alloy refit a real choice
- Pump transfers water and its proportional contaminant mass
- Filter moves contaminant into a finite waste cartridge and consumes actual filter capacity
- Vent removes measured heat and smoke into explicit boundary sinks
- Beacon spends finite scent and changes a real routed pollinator's target; a visiting pollinator can improve growth
- Strength and tempo change accepted utility preparation, pulse, recovery, cooldown, energy and filtration costs

Recipes are strict data, not executable scripts. Accepted abilities latch their recipe, target and intent. Duplicate intents cannot pulse twice. Refit returns only structural parts; charge, water, waste, filter contents and habitat history are preserved. The same organ primitive also compiles with a stationary dock host; this release's controllable unit is the mobile rig. The dock compiler is an authoring/compatibility proof, not a second free deployable machine.

## Fields, ecology and ledgers

There are exactly three six-cell plots and one player-configured rig. Named cell/edge IDs, declared adjacency and deterministic bounded placement own the simulation. Every edge uses one snapshot transfer calculation with canonical ordering. No full-world field array exists.

Seven identities remain exact: water, contaminant, energy/heat, smoke, scent, organic matter and filter capacity. Water uses integer millilitres; contamination and the other game fields use explicit integer units. Water carries its proportional suspended contaminant. Filtration stores waste rather than deleting pollution. Cooling, ventilation, scent decay, water uptake and consumed biomass enter named sink ledgers.

Plant health depends on actual water, contamination, heat and smoke. Growth consumes finite nutrients and water. Scent-guided pollination changes real growth. Restored status persists, while biomass treatment remains constrained by surviving finite stock. This is a small restoration ecology, not a general reproducing animal ecosystem or engineering-grade fluid/thermal model.

Water surfaces show shallow wetness/volume, not a deep-water collision barrier. Smoke affects utility/sensor eligibility and plants; it is not arbitrary player poison damage. Terrain and main routes are unchanged.

## Placement, collision and streaming

A deterministic candidate planner places plots inside the existing cleared non-economic landmarks, away from established roads, rivers, structure solids and wilderness. Each cell and route is checked with 1.15 m full-body clearance and ≤30% sampled grade. No existing farm/freight/collector pad is reused.

The rig follows those finite paths with a swept full compiled-body actor margin. Deploy rejects occupied footprints. A single conservative convex prism derived from the same compiled body blocks explorer movement in both Rapier and server movement. It is a kinematic proxy, not a simulated articulated rigid-body creature. A late overlapping cell update retains the last confirmed collider and visible pose, then retries with a short bound; it does not freeze or teleport the explorer. Rendering receives only collision-confirmed rig positions.

Field graphics appear only beside nearby confirmed terrain (90 m); 126 maximum field instances and one bounded body are retained. The new work does not expand world size or the 49 terrain-chunk residency cap.

## Persistence and online authority

State.restoration is separately versioned. Its plan identity hashes the actual immutable plan, initial resources, rules and algorithm versions. Historical saves without it opt in once; a malformed present pack is rejected. Old terrain/manifest versions and collected/defeated tombstones are unchanged.

Compiler-derived structural and irreversible costs participate in every canonical inventory check and historical pump-payment inference. Causal feasibility counts only the actual refundable difference to the cheapest retained body. Online structural refits are host-owned; local operating actions use the acting player's accepted pose. Shared command revision is distinct from autonomous ticks. Online retries cannot duplicate spending. Towing selects a nearby eligible peer rather than assuming the host is beside the machine.

## Repeatable development

- **Developer lab → enter isolated lab → Start/reset playable restoration practice** creates three fresh plots in the actual physics course, with explicit separate test inventory and suit HP. Walk to the docks/rig and use E/X. The campaign remains captured and write-locked. Return restores it; reload opens the last ordinary checkpoint.
- **Practice controls** use the production command kernel and real explorer position. Reset replaces only practice. A 1,200-second bound and 128-action report retain source, seed, recipes, actual worker steps, missed snapshots, ledgers and results. Older/repeated snapshots do not advance the model.
- **Field numerical model** is separate and clearly labeled. It exposes staged bounded water/air transport, growth interval, movement and scent weights; strict scenario/preset imports; manual stepping; exact costs, causes and balance export. It never pretends its test-context positioning is a physical explorer.

Tests use real local Rapier WASM, actual Three matrices, source/emitted engine parity, strict schemas, co-op authority and in-memory HTTP/SQLite fixtures. They do not certify browser rendering, GPU behavior, touch ergonomics, internet latency or physical-device performance. Those checks remain unavailable. The thirteen held food/clock files stay excluded.
