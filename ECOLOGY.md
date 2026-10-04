# Bounded field ecology and climate, optional pack v1

## Implemented scope

Three seeded, safe garden beds in generation-2 valley; an actual plant → moisture/weather-dependent growth → harvest → craft → suit-repair loop. Twelve finite starter seed packets support at most twelve harvests. There is no spontaneous reproduction, natural-tree harvesting, soil destruction, disease, animal ecosystem, full climatology, medical item or claim of perpetual resource production.

The pack owns its seeds, crops, biomass and bio-gel. It never creates canonical scrap, cores or sealed water canisters. Rain only enters garden soil. A paid irrigation action consumes one existing canonical water canister and introduces exactly **4,000 mL (4 L)**, matching the causal system's canister convention.

Original valley terrain, reservations, resources, IDs, native foliage, generation manifests and old saves are not modified by this module.

## Integration contract

Files provided:

- `src/ecology.ts`: deterministic planning, production reducers, strict validator and presentation projection
- `src/ecology-ui.ts`: snapshot-only field-panel DOM adapter
- `src/ecology-view.ts`: shared/instanced Three renderer
- `tests/ecology.test.ts` and `tests/ecology-presentation.test.ts`

Core API:

```ts
createEcologyState(seed): EcologyState
advanceEcology(state, dt): EcologyState
ecologyPlan(seed): EcologyPlan
ecologyWeather(seed, activeSeconds)
ecologyView(state)
validEcology(value, seed): value is EcologyState
ecologyCost(state | undefined): {scrap: 0, core: 0, water: number}
applyEcologyCommand(state, context, command): {
  state, inventory, hpEffect, message
}
```

Context is `{seed, generation, zone, player:{x,z,hp}, inventory:{scrap,core,water}}`. Commands are:

```ts
{type:'plant', plotId, species:'sunleaf'|'reedmoss', expectedRevision}
{type:'water'|'harvest', plotId, expectedRevision}
{type:'craft-gel'|'use-gel', expectedRevision}
```

`expectedRevision` is the **accepted-player-command revision**, not an elapsed-time revision. Weather and growth ticks do not change it. Thus a server may advance time before executing a queued command, recheck its current stock/maturity/reach/HP, then execute it once. An accepted command increments the revision once; an old queued or repeated command cannot spend water or goods or restore integrity again.

The world reducer must atomically commit the returned pack, returned canonical inventory and `player.hp + hpEffect`. Do not recalculate or blindly add 20 HP: the exact returned repair is `min(20, 100-currentHP)`. A full-health player cannot consume gel. The supplied pack cannot resurrect a zero-integrity player. Gel can be used underground; planting, watering, harvest and mixing require an alive generation-2 architect within 3.5 m of a valley bed. This is a fictional suit repair.

Add `ecologyCost(state.ecology)` to every canonical world-resource ledger and pump-inference calculation that accounts for optional-pack spending. In particular, `water` is **spent canisters**, not mL. Initialization is opt-in/optional migration: an absent pack may be created at tick zero with no history, crops, biomass, gel or retroactive growth. A present malformed pack must be rejected, not reset into fresh rewards. Do not expose any reset that refunds finite seeds or canister costs.

Call `advanceEcology` only where the existing world already advances active, alive gameplay. Do not advance it from UI/renderer/background clocks. Attach `createEcologyView(seed).root` to the valley, call `sync(optionalPack)` after committed state changes, and dispose it on world replacement. The beds are low-profile non-solid growing surfaces and do not need new blocking physics geometry.

`mountEcologyPanel(panel,{state:()=>({ecology,context}),act,close,selectedPlotId?})` uses existing field-panel CSS classes. `act` delegates to the world reducer; the adapter remounts from a fresh snapshot after the callback. It owns no timers, simulation or authoritative inventory. Add the panel entry/nearby plot interaction in `main.ts`; the isolated delivery intentionally does not edit main, world, causal or server files.

## Actual climate and soil model

Climate is a seeded 96-second cycle of four 24-second phases: clear, overcast, rain and breeze. The seed selects phase and daylight offset. A 240-second daylight cycle changes local temperature and growth light; weather cools air; real elevation and nearby original-tree canopy cool each bed. Soil retention includes a deterministic seeded component plus canopy effect.

Each bed holds up to 8 L, initially 1.6 L. Rain is intercepted partly by actual nearby canopy; evaporation depends on current weather, canopy and soil retention. When there is a growing crop, soil moisture, species temperature preference, real sunny/sheltered habitat and daylight multiply its growth rate. Sunleaf prefers sunshine and moderately wet soil; reedmoss prefers shelter and wetter soil. Very dry soil stalls growth; saturated soil reduces it. Growing plants remove actual integer mL of uptake. Every transfer is clamped to real available water/capacity.

Water ledger (all stored as integer **mL**):

```
initial + rain + irrigation = current soil + evaporated + plant uptake + runoff
```

Public physical capacities/rates are in litres; `ECOLOGY_WATER_SCALE = 1000` converts them. `ecologyView().plots[].soilLitres` is ready for presentation. Rain can overflow; overflow is recorded as runoff. Manual watering is rejected unless the entire 4 L fits, so a paid canister never silently disappears. Irrigation is capped at 48 lifetime canisters; this is an upper action budget, not free canister stock. Weather continues through ordinary arbitrarily long sessions after seeds run out.

Fixed quarter-second ticks are deterministic. Each advance call executes at most four ticks (one active second), keeps only a sub-quarter-second remainder, and discards excess time. This is intentional bounded catch-up, not offline farming. Existing world pause/background behavior remains authoritative.

## Conserved finite goods

- Plant: consume 1 of 12 starter seed packets; create exactly one crop in an empty bed
- Growth: seeded → sprouted at 10 growth → budding at 20 → ripe at 30; every stage transition is committed from simulation
- Harvest: remove one ripe crop and put 2 biomass in the pouch, whose capacity is 6
- Mix: consume 2 biomass; create 1 bio-gel, capacity 3
- Apply: consume 1 gel; restore only the exact missing suit integrity up to 20

Ripe crops wait without decaying or auto-harvesting when the pouch is full. No harvested crop regrows. No crop exists before an accepted planting. Pouch/crop conservation is exact:

```
seeds + standing crops + harvested crops = 12
2 × harvested crops = current biomass + 2 × crafted gel
crafted gel = current gel + consumed gel
```

The finite maximum is 12 gel and at most 240 restored suit integrity, conditional on actual growth, harvest, crafting, living-player damage and consumption. Weather itself earns nothing.

## Safe seeded layout

Planning checks the actual generation-2 `worldValley` data:

- Original reservations including their clearance margin
- All building solids, foundations, bridge and infrastructure boxes
- Actual dense road segments plus width and extra clear standing room
- Actual river segments, native tree/rock radii, canonical pickups and a 12 m enemy stand-off
- Garden-to-garden spacing, world bounds and sampled terrain grade

The full square bed plus a standing margin must fit. The planner first tries at most 144 named ring candidates around camp/settlements, then a deterministic distance-sorted 37×37 grid. It never retries indefinitely, deletes native vegetation or shifts original content. The total candidate budget is 1,513, with a clear failure if no valid optional layout exists.

A separate 256-seed spread scan found three safe beds for every seed; its worst case used 220 candidates. Fallback was exercised for seeds 2528090702, 3084875593 and 2993451726. The automated suite retains these regression seeds, boundaries 0/UINT32_MAX, seed 73129, 1/3, and a further 48-seed spread. This is tested coverage, not a claim to have exhaustively enumerated all uint32 seeds.

## Strict validation without long-session replay

The pack pins its own version and hash, which includes rules, crop parameters, climate rates and transaction contracts. Validation rejects wrong versions/hashes/seeds, extra/missing keys, foreign plot IDs, malformed records, invalid numbers, impossible capacities, forged counters, invented growth/history, incorrect water totals, duplicated spending and unsupported repair amounts. It reproduces every finite player transaction and natural growth event and compares all saved values, irrespective of JSON key ordering.

There are at most 96 accepted commands and 36 growth-stage records. Weather status is derived from committed simulation time and **is not fabricated as an unbounded historical log**. The history panel shows actual committed planting, watering, growth stages, harvests, crafts and gel use only.

Large elapsed time does not cause quarter-second replay from zero:

1. With no immature crop, a dry/rain span is solved analytically using the exact same integer transfers as ordinary ticks
2. Empty/ripe water state reaches an exact repeating 96-second cycle; pinned minimum net rainfall guarantees convergence within the 16-cycle guard
3. Once the soil values repeat, complete cycles are skipped in one integer ledger multiplication
4. Only immature crops require quarter-second replay. Twelve finite seeds bound their combined work; replay has a conservative 196,608-step guard independent of total elapsed play

The numeric input limit exceeds 31,000 years of active play and exists to keep cumulative integer-mL arithmetic safe. It is not an ordinary-session trial timer. A hostile astronomical timestamp is rejected before any replay. A valid save after one million weather cycles, followed by new planting and harvesting, validates without replaying those millions of cycles.

The validator establishes internal production/ledger/history consistency. It does not prove historical player position or combat damage from an unsigned client save; reach and live HP are checked at authoritative command execution, and canonical material spending remains the parent world's responsibility. No cryptographic anti-cheat claim is made.

## Rendering and verification

Three terrain-sampled bed meshes plus five instanced draws: 12 border stakes, 15 stems, 15 leaves, 15 fruit, 24 local rain streaks. Shapes and materials are shared where possible. Mesh positions, moisture colors, growth heights and fruit visibility come from production data. Harvest visibly removes the ripe crop; rain appears only during actual rainy conditions. No hidden renderer timers change weather or water.

Verified in the isolated staging checkout:

- Client TypeScript check
- 12 focused domain/presentation tests
- One and three complete repeated gameplay loops
- Canonical canister and exact-mL water conservation
- All twelve finite crops, pouch capacity, full-health rejection and partial repairs
- Command-revision dedup before/after simulation ticks
- Climate/habitat/moisture effects, deterministic replays and split-step progression
- Strict malformed/forged-save rejection, bounded catch-up, long-elapsed validation
- Mixed commands across all three beds
- Snapshot UI repeated mounting/clicking/closing and stale detached callbacks
- Renderer geometry against actual terrain, shared-instance budgets and harvested fruit removal

These isolated tests do not claim integrated world/server save tests, browser visual playthrough, full-repository test success or deployment. Those belong to the parent integration checkpoint.

## World integration

The optional pack is enabled once in generation-2 campaigns and online rooms, then preserved through imports and resumes. `world.ts` applies exact inventory and HP effects atomically, includes irrigation in the canonical canister ledger, and rejects a present invalid pack. Dead, invalid-dt, paused and offline worlds receive no growth. Active underground play still advances the surface weather. Main projects committed beds, map markers and current weather, provides nearby interactions and a Settings panel, and includes pack changes in the five-second checkpoint. Online menus keep the shared world running; the panel says so explicitly. The repeated systems course uses actual collected canisters and actual suit damage to exercise the complete production recipe in disposable worlds.
