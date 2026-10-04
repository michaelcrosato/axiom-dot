# Natural river cave and conservative flood compartments

This additive cave pack preserves the pinned valley and Echo Vault plans and existing object IDs. It describes a bounded cave with spatially distinct flood volumes, not a full fluid/pressure solver or an infinite underground generator. `src/natural-cave.ts` and `src/cave-water.ts` have no renderer, DOM or Rapier dependency. Their commands are suitable for execution by an authoritative server as well as the local reducer.

## Cave plan

`naturalCave(seed)` returns a deeply frozen, independently versioned plan. A seven-point seeded sinuous spine and three irregular elliptical chambers carve a finite two-metre floor lattice. Exposed edges produce matching collision walls; seed-dependent wall heights and chamber boundaries give the annex different geometry from the rectangular Echo Vault. Every floor tile is connected, and the spine reserves standing-capsule clearance. An entrance bank, three wet compartments and a far dry grotto occupy a bounded 80 × 80 m zone. The actual carved footprint is much smaller.

At most 700 tiles, 700 wall boxes and 50,000 planning operations are admitted. Generation has no retry loop or load-order random source. Semantic IDs begin `cave:1:<seed>:` and never reuse `dungeon:` IDs. Named seed sampling is independent of other packs, and the plan cache retains at most four seeds. `CAVE_MANIFEST` and `CAVE_HASH` pin the overlay without rewriting foundation manifests.

The entrance contains two finite scrap pickups and one core. The far grotto contains two scrap and one sealed water canister. This gives each flood solution an independently feasible payment before the route opens, and enough total scrap to complete all repairs eventually. Ordinary inventory/collection tombstones own these pickups; the water system does not create inventory rewards.

Both the entrance and the far grotto contain a return anchor. The latter is an emergency return line so a route that refloods while the player is beyond it cannot trap them. `caveReturnNearby(plan, player)` deliberately accepts either anchor. Both anchors remain dry for every admitted seed and flood state.

## Water model and conservation

Three adjacent compartments contain separate volumes in cubic metres, with areas measured from their actual floor-tile footprints. Their visible surface heights are volume / area above a flat zero-height floor. Adjacent compartments exchange water according to head differences through a bounded conductance. Candidate transfers are computed together, then scaled to donor volume and receiver free capacity before application. Water moves between actual distinct surfaces; this is a finite-volume compartment approximation rather than a single decorative progress meter.

Each quarter-second step applies:

1. An open source gate admits 2 m³/s into the upper rill; excess over the 1.8 m depth capacity is explicitly spilled outside the modeled system
2. Two connections exchange water between adjacent compartment heads without creating volume, overfilling a receiver or making a donor negative
3. The lower sump discharges at most 1.1 m³/s naturally, plus 5.5 m³/s if its obstruction is cleared
4. A repaired running pump discharges at most 7 m³/s from the middle compartment outside the cave

Sources/sinks are declared boundary flows. The sewer discharge is capacity-limited, not a hydraulic pressure simulation. The optional paid outfall now transfers a metered fraction of new pumped/drained output into the existing household depot with a matching provenance receipt; it is subtracted as an internal transfer in the combined ledger. Excess remains discharged. Nothing becomes a player canister or bypasses actual carrier delivery. See CAVE-SUPPLY.md.

The invariant, in m³, is:

    initial + extracted = sum(compartment volumes) + pumped + drained + spilled

Initial depth is 0.9 m in each compartment. `caveWaterBalance` exposes the residual. No disappearance is hidden as an inventory canister, and no sink can remove water absent from its compartment.

`advanceCaveWater(state, dt)` executes at most four quarter-second steps per invocation; elapsed input above one second is intentionally dropped. The sub-step remainder is persisted. There is no wall-clock input or offline catch-up. The host owns pause policy; it must not advance the state while menus/background/transition pause gameplay. Frame grouping with equal quarter-second steps is deterministic.

## Player choices and real access

All machinery is reachable in the dry entrance chamber:

- Repair source valve: 2 scrap, closes inflow immediately; natural drainage then clears the route. The repaired valve can subsequently be opened/closed for free
- Repair cave pump: 1 scrap + 1 core, starts pumping immediately; the repaired pump can subsequently be switched on/off for free
- Clear sump drain: 1 scrap, permanently increases drainage enough to handle an open source

Each repair consumes its cost once, and there is no dismantle/refund exploit. Repeating a completed repair is a no-op. Commands reject a wrong zone, dead player, non-finite positions or inventory, insufficient inventory and machinery farther than 3.5 m. Source/pump toggles require their corresponding repair. Each command returns the unchanged state and inventory references on rejection.

For seed 73129, starting with the initial flood, the all-compartment route predicate becomes clear after approximately 83 seconds for a source repair, 18 seconds for the pump or 27 seconds for the drain. Other seeds vary with their actual floor areas. Turning off the pump or reopening a repaired source can genuinely reflood the course.

A compartment is unsafe above 0.45 m depth. `caveFloodObstacles` projects its exact wet tile footprint into collision boxes. These are deliberately tall gameplay safety barriers (4.8 m high) to prevent jumping over a flood-risk restriction; their height is not the water depth. Render water at the actual `caveWaterSurfaces` height and clearly identify unsafe floodwater in the UI. No swim/drowning, buoyancy or dynamic fluid-body interaction is claimed. `caveRouteOpen` and `caveNavigable` use exactly the same depth threshold as the physical access blockers.

`safeCavePosition` preserves a safe player position, otherwise returns the nearest dry bank. Call it on load and when newly activated flood blockers could overlap a capsule. The emergency return on the far bank remains available independently of the route state.

## Host integration API

From `src/natural-cave.ts`:

- `naturalCave(seed)` / `generateNaturalCave(seed)`: plan with `bound`, `spawn`, `returnAnchors`, `tiles`, `walls`, `objects`, `anchors`, `basins`, `navigation`, `budget`, `constraints`
- `caveWalkable(planOrSeed, x, z, radius?)`: static floor/wall clearance
- `caveReturnNearby(plan, point, distance?)`: either safe return anchor

From `src/cave-water.ts`:

- `createCaveWater(seed)`: independently versioned initial state
- `advanceCaveWater(state, dt)`: pure bounded simulation
- `applyCaveWaterCommand(state, {inventory, player, zone, hp}, command)`: immutable state/inventory/message result
- Commands: `repair-valve`, `repair-pump`, `clear-drain`, `set-source` with `on`, `set-pump` with `on`
- `caveWaterCost(optionalState)`: exact cumulative `{scrap, core, water}` payments
- `validCaveWater(unknown, seed)`: strict validation for a present optional state
- `caveDepth(state, basinIndex)`, `caveRouteOpen(state)`, `caveWaterBalance(state)`
- `caveWaterSurfaces(state)`: tile surfaces with position, actual y/depth and basin index
- `caveFloodObstacles(state)`: dynamic worker collision boxes with explicit center y
- `caveNavigable(state, point)` / `safeCavePosition(state, point)`

A host can add an optional `caveWater` field without changing old save foundations. Absence may initialize once when the cave is first visited; a malformed present field must be rejected, never silently reset. The host must append cave resource IDs to the allowed collected-ID/available-inventory catalog and subtract `caveWaterCost` in its full resource conservation equation, including historical quest-payment inference. Foundation resources, tombstones, previous-write backups and old migrations remain unchanged.

For rendering/physics, initialize static walls once and change dynamic flood colliders only when the three unsafe/safe basin booleans change. Water surface geometry can update its y without rebuilding physics on every fractional depth change. The host should expose the three repair costs, source/pump states, three depths, route predicate and explicit descriptions through its existing touch-ready interaction board.

## Verification

The isolated domain tests cover 258 deterministic plan seeds without relying on seed text for variation, connected floors, continuous capsule-clear spine samples, finite budgets, distinct stable IDs, both dry return anchors and immutable plans. An additional 1,000-seed generation sweep passed.

Water tests prove all three alternatives independently feasible across 42 seeds, exact inventory costs and duplicate refusal, spatial head differences and distinct surface heights, gate/pump reflooding, overflow accounting, fixed-step equivalence, 5,000-call control-change conservation and JSON replay, bounded oversized steps, malformed state rejection and safe recovery from flooded positions.

Real Rapier standing capsules across five seeds stop at the initial flood, cross the actual carved route after drainage removes its colliders, reach the far return and traverse the cave back to its entrance. These tests verify simulation and collision, not browser visuals, touch ergonomics, WebGPU/WebGL rendering or device performance. Aggregate application integration and rendered verification belong to the host release checks.
