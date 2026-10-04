# AXIOM: The Living Frontier

Private development source import. Start with [cloud setup and current verification limits](CLOUD-SETUP.md). This import does not publish the game or create a cloud environment.

The procedural completion pass adds persistent [town requests](TOWN-REQUESTS.md), [modular habitat restoration](RESTORATION.md), constrained workshop authoring, and read-only save differences. [Coverage and boundaries](PROCEDURAL-COVERAGE.md) distinguishes actual playable systems from broader architecture targets and held review gates.

Regional project guidance now follows actual freight → collector → farm → harvested meals, with explicit local-work and waiting states. See [REGIONAL-OBJECTIVES.md](REGIONAL-OBJECTIVES.md) for selection, resource provenance, controls and regression scope.

The standalone workbench now includes a from-zero **Alder–Pine settlement** scenario: real freight, store construction, drinking water, new overflow, crops and meals on one active clock. See [the measured one-hour recipe](REGIONAL-SETTLEMENT.md) and [workbench controls](SYSTEM-WORKBENCH.md). Local numerical verification does not clear the inherited food release-review hold.

Overnight integrated frontier checkpoint, 1 October 2026. Responsive quadruped encounters, a natural river cave with conserved flood routes, real workshop manufacturing, climate-driven field gardens, synthesized audio, actual-frame review tools and opt-in four-player online expeditions. The new regional save adds a genuinely streamed 10 km² frontier around the preserved valley; the larger engine framework remains a longer-term target.

## Standalone system workbench (local checkpoint)

Open `/system-workbench.html` directly, or Settings → Advanced → System workbench, for repeatable production water, farming and freight experiments without booting the game. Pause/step/fast-forward, bounded chunk/settlement/route generation, inventory and actor inspection, conserved ledgers, report replay and the existing isolated graphics inspector share one workspace. [Usage and CLI](SYSTEM-WORKBENCH.md). This work remains local while the inherited food release gate is held.

The [bounded procedural regression matrix](PROCEDURAL-SCENARIO-MATRIX.md) adds a reproducible 20-seed sample, independent rain/freight modes, action timing and interrupted replay cases, explicit earned-canister control, finite evidence and wall budgets. It reports gameplay shortages separately from simulation failures.

## Regional rainfall and dry spells

Fresh regional supply ledgers now use seeded rainfall fronts, long dry spells and recovery. Real reserves can run short, thirsty crews slow down, and farms receive only new collector overflow. Existing collector saves retain legacy rainfall. Compare both safely in the standalone workbench's Rainfall selector; switching it never changes a campaign. [Model, access and limits](REGIONAL-WEATHER.md). This is local implementation under the same release holds.

## Regional farms and community meals

Three local farms connect existing rain collectors and freight stores to real crops, carried food and meals. Start through **Journal → Regional food**, the **M** atlas or **Menu → Play & world → Regional farms**. New collector overflow supplies irrigation after drinking reserves are filled; old gardens and completed regional projects retain their progress. [Regional food](REGIONAL-FOOD.md) describes the recipe, local distribution scope, save protections and verification limits.

## Regional resource sites and freight

Three finite quarry/forestry sites now supply new freight stores over the existing roads, with actual 1.8 m/s carriers, cargo reservations, local road repair, construction and withdrawable raw building supplies. Start at Alder Quarry through **Journal → Regional freight + construction** or the **M** atlas. Completed collectors and old saves retain their progress. [Regional freight](REGIONAL-TRADE.md) describes the conserved loop, true travel times and verification limits.

## Zoom-out visibility

Fog now fades away as the camera pulls back and is completely clear from zoom 42 through 58. Close-view atmosphere returns smoothly. Render-only distant terrain covers the enlarged view while collision streaming, world size, movement and saves remain unchanged. See [camera coverage and verification limits](CAMERA-VISIBILITY.md). Rendered browser/device appearance is still unverified.

## Run

Node 22.23.0 is the verified development and test runtime for this release. Vite requires Node ^20.19.0 or >=22.12.0. The unchanged prolonged game checks passed on the official checksum-verified Node 22.23.0 binary. Node 24.19.0 intermittently aborted in a native V8 WebAssembly code-reclamation assertion; those failures are preserved and are not represented as fixed. See [runtime verification limits](STREAMED-FRONTIER.md#verification-limits).

```sh
npm ci
npm run dev
npm run typecheck
node scripts/cloud/test-safe.mjs
npm run build
```

Open the Vite URL in a WebGPU/WebGL2-capable browser. Production output is a self-contained Worker in `dist/server/` plus browser assets in `dist/client/`. Solo play runs in the browser; online expeditions require the declared Sites D1 binding and authenticated Site access. A plain local Vite server supports solo/review pages; the co-op transport has a separate real HTTP/SQLite test fixture. The private Sites manifest belongs to this specific project; remove its project_id when deliberately forking into a separate Site.



## Map, organized menu and recoverable restart

Press **M** or open **Menu → Play & world → World map** for the complete surface atlas. It includes sampled terrain, actual roads and rivers, settlements, regional landmarks, a player marker, north and a metre scale. Drag/pinch or use the zoom buttons; **Fit world** returns to the complete overview, **Locate me** centers your position, and the destination picker finds named places. When underground, the atlas marks your surface entrance explicitly. Arrow keys pan the focused map; +/− zoom, 0 fits, P locates. M/Escape/Close or browser Back dismiss the map without carrying held movement into play.

Menu has five sections: **Play & world**, **Field tools**, **Controls**, **Graphics & sound**, and **Advanced**. Original X/Y/B/A touch positions and independent movement/camera gestures are unchanged. Solo simulation pauses in the menu; the online room can continue.

**Menu → Play & world → Start fresh / recover progress** offers a confirmed same-seed restart and retained-run recovery. Cancel writes nothing. A confirmed restart creates an immutable local checkpoint, then reloads renderer, generation and physics together. The original recovery is never replaced by later restarts; each displaced run also appears in the recovery selector and can be exported. Other seeds, original-valley/regional save flavors, settings, legacy keys and online rooms remain separate. Choosing an existing seed still resumes it; it does not silently reset it. Leave online play before resetting a personal save, including if you host the room. A stale second tab cannot overwrite a newer restart/recovery. Invalid saved-session records stop at a recovery screen with exact-byte archive export.

The full atlas uses bounded 2D sampling, not full-world 3D residency. No view distance, fog, collision range, difficulty or resistance values were changed in this update. Numerical/model and offline DOM-contract checks cover the new controls and recovery flows; rendered desktop/mobile appearance remains unverified because browser access was blocked. See [map and session verification](MAP-MENU-RECOVERY.md).

## Streamed 10 km² frontier

Open **Menu → Play & world → Choose a frontier → Open 10 km² frontier · current seed**. This opens a separate regional save and leaves the original valley save untouched. The 3.162 km square streams 64 m terrain/structure/wilderness chunks, with collision-before-visible receipts, bounded residency, connected trails, six terrain regions and twelve exploration landmarks. Settings → Developer lab adds actual metre/clock telemetry, a disposable production-controller speed calibration, bounded chunk statistics and safe solo survey destinations. [Streamed frontier](STREAMED-FRONTIER.md) documents measured crossing times, save/authority guarantees, repeatable soak tests and explicit visual/device limits.

## Physical wilderness and finite gathering

All visible tree trunks and rocks now use a shared deterministic physical catalog in solo and co-op, including small trees and irregular stones. X / E gathers finite raw wood or stone; small loose stones disappear, while depleted trunks and large rocks stay solid. Staff contact gives physical feedback without awarding materials. Raw materials are separate from salvage and can fund regional rainwater collectors. Delivered freight can also enter this carried building stock through explicit withdrawal; it never regenerates wilderness sources. Cell/zone transitions preload collision and commit the matching visual projection on worker acknowledgment. [Wilderness details](WILDERNESS.md) includes old-save handling, shared authority, collision outlines and repeated isolated real-worker probes. Rendered browser appearance remains unverified.

## Player animation follow-through

The grounded player animation pass adds world-locked supports, gait-specific cadence, impact-sensitive landing, supported crawl, continuous staff handling and accepted-timeline guard bracing. The approved mantle remains intact. See [animation weight review](ANIMATION-WEIGHT-REVIEW.md) for reproducible numerical checks and the explicit manual visual checklist. Rendered appearance remains unverified.

## Overnight systems

- **Start with disposable live practice:** [Morning playtest](MORNING-PLAYTEST.md) opens with a real sentry, warning/guard/jump counterplay and resettable health inside the isolated lab. Real-frame capture and a bounded replay trace help inspect an attempt; neither auto-approves visual quality. [Live practice contracts](LIVE-SENTRY-PRACTICE.md) document exact campaign restoration and unchanged nine-case measurements.

- **Online expedition:** Settings → Host or join supports a host and up to three other signed-in explorers. Online jumps now use reliable intent receipts and server-owned gravity, landing, ceilings and low-strike evasion, followed by local Rapier prediction. Supplies, construction, workshop goods, jobs, water and enemies are shared; player positions, health and attack timelines are separate. A server-authoritative room save is independent from the solo checkpoint. Invite codes do not grant access to this owner-private Site. See [COOP.md](COOP.md) for transport, authority and verified limitations.
- **Natural river cave:** The existing cave mouth now offers the preserved Echo Vault or a separately generated river cave. Repair a source valve, pump or drain with actual salvage. Conservative water levels open or block a physical route; either dry bank can return to the valley. A separate paid outfall meters real discharge into the household loading depot; existing carriers must deliver it before household/job relief. See [CAVE-WATER.md](CAVE-WATER.md) and [CAVE-SUPPLY.md](CAVE-SUPPLY.md).
- **Resonant guard:** Press G or the separate Guard button for a timed, facing-locked interception of one actual sentry strike. It spends the same staff stamina and has explicit windup, recovery and cooldown. Early/rear/second contacts still hurt; online effects follow confirmed casts with latency. See [RESONANT-GUARD.md](RESONANT-GUARD.md).
- **Responsive sentries:** A separate generated quadruped family follows bounded pursuit, fixed warning/strike/recovery phases, solid clearance and persistent HP. Staff contact staggers it. See [ENCOUNTERS.md](ENCOUNTERS.md).
- **Workshop exchange:** Commission repair kits using real scrap and water-supported caretaker service, collect/recycle goods, and resolve bounded natural-wear incidents with reserved resources. History describes actual committed transactions. See [ECONOMY.md](ECONOMY.md).
- **Field ecology:** Settings → Field ecology and three map-marked garden beds expose finite planting, weather/soil-dependent growth, harvest, biomass crafting and consumed suit-repair gel. Irrigation spends a real 4 L canister; rain enters only soil. Shared online goods and actor-specific repair follow the same authoritative recipe. See [ECOLOGY.md](ECOLOGY.md).
- **Sound:** Footsteps, jumps, staff attacks, enemy warnings, repairs and water use bounded synthesized cues. Settings provides mute and volume; a real input gesture unlocks audio. See [AUDIO.md](AUDIO.md).
- **Visual review:** Settings → Developer lab links the isolated production-model viewer: 24 humanoid poses, 13 quadruped action poses, four cave views seven reducer-derived garden probes and six actual guard/sentry outcomes. Capture actual rendered contact sheets with camera/backend/source metadata. The lab can record real-worker replay frames and run repeated disposable world-model checks. Missing frames and unreviewed appearance remain explicit. See [VISUAL-VALIDATION.md](VISUAL-VALIDATION.md).

The source rollback tag `rollback/pre-overnight-2026-10-01` retains the original c872599 foundation. Added domains have bounded manifests and optional validated save fields; terrain/dungeon foundations and historical IDs stay pinned. The original 17-domain brief is an architecture target, not a claim that every domain is finished. The field-garden climate/ecology pack is bounded and conserves its own finite seeds, goods and soil water; it is not a general ecosystem. Large crowds and general simulation-tier transfers remain future work. Geographic expansion is now delivered as the separately versioned streamed regional frontier; new regional shelters do not claim additional town economies.

## Modular equipment · resonant staffs

Settings → Modular equipment workbench previews and compares seeded, compatible grip/shaft/head assemblies. The generated mesh, hand sockets, physical mass/inertia, reach, damage, stamina and committed combo timing come from one compiled recipe. Campaign refits recycle the previous assembly and spend finite salvage; the original survey staff remains free to restore. Lab practice uses an isolated loadout, with matched A/B combat-model reports and no campaign changes. The nine-scenario movement suite remains a survey-staff baseline. Existing saves and world generator manifests are preserved. See [MODULAR-EQUIPMENT.md](MODULAR-EQUIPMENT.md) for scope, persistence and verification limits.

## Developer lab and character/combat iteration

Settings → Developer lab opens a separate course with 18 bounded tuning sliders, optional practice aids, nine real-worker scenarios, 1/3/5 repeated runs, frame-interval percentiles with sample counts, an explicit manual visual checklist and JSON report export. It pauses and protects the campaign; returning restores the captured world and checks the physical pose before releasing control. No campaign save, reward or generation version changes.

The staff now uses a real three-stage preparation/active/recovery timeline, buffered follow-ups, stamina, one contact per target per stage and shared manual/auto rules. Distinct energy sweeps, weapon-grip IK, bounded impact feedback, turn/braking weight, launch-to-tuck and camera response accompany the gameplay changes. The encounter pack persists partial enemy HP, positions and phases; defeated sentries remain persistently cleared. Reduced motion disables shake and visual impact hold.

[DEV-LAB.md](DEV-LAB.md) provides course instructions, exact measurement semantics, cancellation/restore guarantees, combat rules and remaining validation boundaries. No phone benchmark or console-quality parity is claimed.

## Living agents and causal work (milestone 3)

Generation-2 valleys now have five or six persistent caretakers, carriers and builders. They follow generated roads and compiled doorway/hall routes, drink from real reserves, carry actual water, consume finite repair stock and work only in operational workplaces. Seeds vary actor assignments, initial needs, worn mechanisms and generated requests. Household water can be restored by canister delivery, a repaired intake or actual overflow from the modular network; source repair only completes a water job after a carrier physically delivers.

Interact with either settlement, a resident, a workshop beacon or the waterworks loading point. Journal → Living frontier also exposes the complete touch-friendly needs/job/agent board. Accept requests at the issuer's home flag before helping. Player contributions earn finite, exactly-once community renown; NPC completion resolves the same world need without a free player reward. Carriers resume after their named route threat is defeated, and repaired workplaces stay operational. The three old Mossbank commissions remain separate and unchanged.

Resident simulation continues in the vault at a bounded 4 Hz and survives reload. Menus/background pause it; there is no offline catch-up. These are path-proven kinematic residents, not individual dynamic Rapier bodies or a crowd simulation. The founding requests remain finite. The optional workshop exchange adds a separate finite manufactured-goods loop and up to eight feasible natural-wear incidents; it is not an unbounded economy. [CAUSAL-WORLD.md](CAUSAL-WORLD.md) describes exact planning bounds, water/material/reward ledgers, persistence, tests and remaining limits.

## Connected valley and vault (milestone 2)

New players start in generation 2. Settings → New world / choose seed creates or resumes a separate seeded world, with a complete session reload. Existing generation-1 saves retain their exact original terrain, dungeon IDs, quests and progress. The original browser save key is never overwritten; subsequent saves use per-generation/per-seed slots with previous-write backups. Export/import remains available.

A generated world is one bounded 160 × 160 m valley: a sampled hilly surface and carved river basin, two placed settlements, four compiled walkable workshops, a planned bridge, graded connecting roads, and a reserved waterworks foundation with an explicit river feeder. Terrain, collision, resource elevations, minimap and action targets consume one immutable ValleyPlan. Infrastructure and parcel access are reserved before decoration. The vault now has 7–12 varied rooms, branching connections, optional loops, variable corridor widths and three objective caches. Geometry and graph tests exclude seed-bearing identity from variation assertions.

Settings → Inspect valley & vault plans previews the actual terrain/road graph, semantic sites, building work interfaces, dungeon objectives, generation manifest and validation results. Seed previews leave the active world untouched. The generation remains bounded and synchronous; it does not implement infinite terrain, asynchronous generation workers, large-world origin rebasing or a spatial river-fluid solver. Terrain and major infrastructure remain resident; cell streaming still owns foliage and interactive meshes/colliders.

[CONNECTED-WORLD.md](CONNECTED-WORLD.md) records the data contracts, deterministic bounds, save behavior, tests and stage-3 integration points. Milestone 3 consumes these interfaces as described above. Existing commissions are still authored and preserved.

## Shared procedural workbench (milestone 1)

Settings → Procedural workbench, or Build → Inspect procedural plan, inspects the actual compiled waterworks assembly and a genuinely varied frontier-workshop recipe. Try different preview seeds, inspect semantic nodes/ports, constraints, costs, connections, version manifests and bounded JSON recipes. Previews do not alter the saved world.

In generation 1, the workshop northwest of Mossbank at (-31,-14) uses 2–4 real connected rooms with passable door openings, matching render/physics boxes and an exposed workplace interface. Its roof hides on approach. The shared registry/compiler now powers waterworks geometry, ports, connections, costs and build validation. Schema1–5 saves migrate explicitly to schema6 with pinned versions and the same progress.

See [PROCEDURAL-FRAMEWORK.md](PROCEDURAL-FRAMEWORK.md) for the language, limits, adapters, migration and downstream interfaces. Generation 1 retains authored terrain, roads and huts plus exactly two mirrored dungeon layouts. Generation 2 uses the regional plans above; the original three commissions remain authored alongside the separate generated causal requests. Old dungeon seed1/2 geometry is identical; tests now compare semantic geometry rather than seed-bearing IDs.

## Pinned stack

- TypeScript 7.0.2
- Vite 8.3.1
- Three.js and @types/three 0.186.0
- @dimforge/rapier3d-compat 0.20.0

All pins were verified against the official npm registry. package-lock.json is included.

## Play

- WASD/arrows: camera-relative movement
- Shift: maximum sprint; WASD alone runs at 5 m/s
- Hold C: crouch/crawl; press while running for a short momentum slide, release to stand when clearance allows
- Space: jump; holding does not repeatedly jump
- Q/R: orbit camera; right-drag also orbits
- Mouse wheel: zoom
- E: inspect, collect or interact
- F: close-range pulse to disperse sentries
- K: local save
- J: journal; M: full-world map; Escape or browser Back closes the panel
- Touch: drag the left gameplay half for an invisible floating analog stick. Thumb distance controls speed continuously: tiptoe, walk, jog, run, full sprint (up to 8 m/s). Lift to brake. Button taps use their own pointer IDs, so another finger can gather, crouch, pulse or open Settings while the movement thumb remains down. Menu entry intentionally stops movement; ordinary gameplay actions do not.
- Camera: one finger starting on the right world half orbits. Two fingers starting in that right world half pinch to zoom between 17 and 58 m. The left movement finger never becomes a pinch finger, and UI touches never join a camera gesture. After one pinch finger lifts, the remaining right finger resumes orbit without a jump. To zoom while moving requires the movement thumb plus two camera fingers; otherwise release the movement thumb and use two fingers on the right. Settings → Camera & movement always provides zoom/orbit buttons. Desktop wheel zoom remains available.
- Fixed touch action slots: X (upper left) Interact changes its label to Gather, Repair, Enter vault, Return or Mossbank; Y (upper right) Pulse; B (lower left) hold Crouch; A (lower right) Jump. All four positions stay reserved and visible, with unavailable actions dimmed. Labels change in place and never move another action. There is no competing floating touch prompt. Settings stays visible; Build appears near the yard. Suit health appears near danger or when damaged. Map, objectives and inventory are in Settings → Journal & map.
- Hold Crouch to crawl; pressing above 5.4 m/s begins a momentum slide of up to 0.68 s. Releasing ends the low-stance request and slide, then the capsule stands only with roof clearance. Crouch and Jump can be held independently while the movement thumb continues. Up/cancel/lost capture/leaving the button, blur, menus and lifecycle changes safely release input. Focused hold buttons also support held Space/Enter without toggling.
- Jump is a real Rapier-resolved vertical motion: 6.6 m/s takeoff, 18 m/s² gravity, about 1.16 m apex on flat ground, a 0.12 s press buffer and 0.1 s coyote allowance. Held input never repeats; a fresh press is required after landing. Walls, ceilings and raised platforms resolve in the worker. The body renders its actual feet height, the shadow stays on the ground, and the rig uses airborne/landing poses. The minimap remains planar. Menus freeze airborne height/momentum; teleport and zone replacement reset vertical state. Quick press/release messages are latched even inside one simulation tick.
- Touch combat: optional Auto pulse defaults on. The basic pulse fires only at a living, undefeated sentry within 3.5 m with a clear path through movement-collision obstacles. It uses the same 0.55 s cooldown and normal attack action as manual Pulse. Settings has a saved On/Off toggle. Y/Pulse keeps its fixed position and enables for reachable targets. Keyboard/mouse play remains manual; F pulses and Space jumps. Gathering, construction, commissions, movement and zone changes remain explicit. Menus, hidden pages, focus loss and transitions pause automatic combat and cooldown.
- Menus/backgrounding stop motion immediately and clear held pointers, keys and pending button taps. Safe-area and compact landscape layouts remain supported in CSS.


Recover three scrap modules and one power core to repair the pump, or gather three water canisters and deliver them to Mossbank (legacy generation-1 coordinates: pump (0,16), Mossbank (-16,-4); generation 2 uses the generated map). Interacting with Mossbank opens its touch-ready needs/jobs board; the original request and canister-delivery buttons remain available there. Completed world state and defeated sentries survive save/load. Sentries warn, lock their attack direction and strike; at zero health the suit returns the player to camp with their supplies and persistent discoveries. Find the cave northwest of Mossbank, stand near its mouth and Interact to enter. Tap the gold-threshold prompt inside to return. Panels and background tabs pause threat damage.

Settings exposes a forced WebGL2 path, low-poly, vivid flat-light/cel-inspired, PS1-like low resolution, and 8/16-bit-inspired pixel presentations. These pixel options change render resolution only, not simulation or actual console hardware accuracy.

## Snapped modular waterworks

Press Build (B) near the gridded yard south of Mossbank. Select any of 18 candidate cells (x −20 through −5, z 6/9/12 at 3 m spacing), choose a part and rotation, then explicitly Place. Build validates the footprint, current materials, 12 m reach, player clearance, reserved paths/salvage and the 12-module yard budget before spending. The board shows installed pieces and a selected-world-cell ring; invalid placement explains why. This is a bounded construction area, not arbitrary continent-wide building.

Seven data-driven parts are available: river pump, straight pipe, right corner, left corner, tee, reservoir and Mossbank outlet. Four rotations rotate both exact collision solids and typed directional ports. Blue IN and gold OUT ports must touch, face each other and have matching water types. The menu offers actual compatible joins, with explicit Connect/Disconnect. Each port supports one join and directed cycles are rejected. Rotating preserves a module's cost/storage and clears its incident joins so stale connections cannot carry water. All solid geometry is projected from the same definitions used by Rapier.

The original inexpensive route remains available: Pump at (−5,6), Straight at (−8,6), Reservoir at (−11,6), Outlet at (−14,6), all rotation 0, then connect each pair. Total: 1 core + 3 scrap. Other routes can use corners and tees across rows. One pump must draw from the east bank at x −5; one outlet serves Mossbank from x ≤ −14; one reservoir stores 20 L. Four salvage pickups at z 13 keep original quest payments and the basic route feasible; the Echo Vault holds a second core. Extra routing is bounded by earned salvage.

Supply follows the actual directed graph: pump-to-reservoir paths allow up to 2 L/s intake; reservoir-to-outlet paths deliver at most 1 L/s. Open branches and additional pipes never multiply water. Water is conserved as extracted = stored + delivered + deliberately drained. Disconnect the outlet to fill the tank; disconnect the intake to run it dry. The settlement only receives actual delivered litres. Dismantling requires a second click, removes incident joins and refunds exactly once; tank water drains rather than becoming inventory canisters.

Layouts, rotations, joins, inventories and water ledgers auto-save after every construction action. Export/import in Settings provides portable save files. Active flow checkpoints every five seconds. Menus, dungeon visits and hidden tabs pause water simulation with no offline catch-up. Schema-4 four-pad saves explicitly migrate to modules with the same semantic IDs, exact resources, links and litre accounting. A planar save made above a module resolves to a nearby free ground position on load to avoid embedding the capsule. Tree/rock generation excludes the expanded board; reserved paths and pickup footprints stay clear. This is a small directed network with a single conservative reservoir ledger, not a spatial pressure/fluid simulation or unbounded generator. The actual assembly now passes through the shared bounded semantic compiler described below.

## Settlement needs and commissions

Mossbank now has a live 24 L settlement reserve, receiving only real delivery from the modular waterworks outlet and consuming 0.5 L/s. Delivered litres are conserved as reserve + consumed + overflow. Its shortage/buffering/supplied state follows actual water availability; original relief flags do not silently feed it. There is no offline catch-up, and menus, background tabs and dungeon visits pause this simulation.

At the settlement flag, accept and report three sequential one-time commissions:

1. Commission the river route: deliver 20 new litres after acceptance; reward 10 renown / Waterkeeper title
2. Secure an emergency reserve: have 12 L in the settlement and 10 L in the machine tank; reward 15 renown / Trusted Architect title
3. Keep the settlement supplied: deliver 20 new litres and provide 30 seconds of service after acceptance; reward 25 renown / Mossbank Steward title

Claiming requires proximity to Mossbank and active network supply. Accept/claim is explicit, touch-ready and auto-saved. Completed IDs, baselines and renown persist; rebuilding, damage and replaying a completed commission cannot award again. This is a bounded three-commission progression with title rewards, not an open-ended economy. All jobs are feasible with the existing authored pickups and network. The HUD gives the active objective and live reserve; the board shows precise progress and the current need. Settlement-only reserve consumption is checkpointed as well as network flow.

## Architecture

- `src/world.ts`: pure immutable state, stable semantic object IDs, seeded decoration, bounded actions, strict runtime save validation, event log and alternate quest solutions. No Three/Rapier imports.
- `src/waterworks.ts`: pure rotated-module/socket graph grammar, bounded snapped placement, exact material accounting, clearance checks, lossless legacy migration and conservative reservoir ledger; runtime geometry and worker colliders project that state.
- `tests/waterworks.test.ts`: costs/refunds, invalid placement, connectivity, flow/conservation/time-step equivalence, migration, persistence and real capsule collision.
- `src/controls.ts`: renderer-independent floating-stick state, independent movement/orbit/pinch ownership, circular clamp, deadzone, feature detection, keyboard action mapping and lifecycle reset.
- `src/touch-buttons.ts`: delegated per-pointer touch tap and held-action handling, independent source aggregation, cancel/scroll safety and duplicate-click suppression, with native mouse/keyboard/assistive and select behavior preserved.
- `src/combat.ts`: shared close-range pulse target and solid-obstacle line-of-sight checks plus automatic-combat eligibility.
- `tests/touch-events.test.ts`: production canvas handlers and button bindings executed with native EventTarget and a DOM-contract shim; no browser click is synthesized for the secondary-finger regression.
- `tests/combat.test.ts`: range/alive/defeated/obstacle checks and production attack/frame snippets exercising cooldown, pause gates, manual fallback and exactly-once persistence.
- `src/settlement.ts`: live reserve/consumption ledger, bounded sequential commissions, acceptance baselines, one-time renown and runtime save validation.
- `tests/settlement.test.ts`: delivery/consumption conservation, frame-step equivalence, feasible full progression, duplicate-claim rejection, rebuilding/death persistence, old-save migration and corruption rejection.
- `src/streaming.ts`: deterministic 16-metre ownership cells, canonical shared-border IDs, world-qualified semantic IDs, hysteretic load/evict transitions and monotonically increasing lifecycle revisions.
- `src/dungeon.ts`: versioned seeded chamber/connector grammar, stable cache/sentinel IDs, perimeter walls and safe entrance/return contracts.
- `tests/dungeon.test.ts`: graph connectivity, deterministic IDs, migration, loot/no-duplication, exits/recall and real-Rapier capsule traversal of all chamber routes in both mirrored layouts.
- `src/physics.worker.ts`: Rapier WASM initialization, fixed world colliders plus revision-guarded streamed trunk and convex-rock colliders, capsule character controller, fixed 60 Hz steps, input/snapshot messages. All physics ownership is in this worker. Zone replacement frees the previous physics world and streamed colliders atomically. Monotonic zone epochs reject delayed snapshots, cell mutations, input and teleport commands from earlier worlds. The render loop remains still until the matching ready acknowledgment.
- `src/main.ts`: Three WebGPURenderer (WebGPU preferred, automatic WebGL2 fallback), procedural low-poly geometry, camera, input, UI, local persistence adapter, presentation presets and diagnostics.
- `tests/controls.test.ts`: floating origin/deadzone/analog clamp, pointer isolation, UI eligibility and lifecycle reset.
- `tests/streaming.test.ts`: negative/boundary ownership, neighbour border identity, traversal independence, eviction/reload, persistent pickup tombstones and persistent save compatibility.
- `tests/world.test.ts`: deterministic generation, conservation, distance rules, both solutions, persistence, malformed saves and bounded values.
- `tests/physics.test.ts`: real Rapier initialization, ground contact and capsule-wall collision over 180 fixed steps.
- `tests/worker.test.ts`: actual physics worker initialization, finite snapshots, hut/pump collision, teleport, stopping, cell-collider load/eviction, epoch-isolated zone replacement and rejection of stale reload/input/teleport messages through its message API.

The v2 humanoid profile has explicit hip, knee, ankle, shoulder and elbow pivots, +Z forward and hand/back tool sockets. Distance-driven gait, foot/hand target solving, bounded turning, acceleration lean, stopping recovery and gather/repair/pulse follow-through are procedural. Animation consumes collision-resolved worker velocity and real render displacement, so pushing a wall cannot keep the character walking in place. Walking, crawling, sliding and jumping have actual movement/collision behavior. Huts still have decorative, noninteractive doors: opening doors is not an implemented mechanic or animation. Mario 64 is an animation-quality direction, not a claim that this prototype matches its authored character motion.

The read-only `window.axiom` inspection interface exposes getState/getSave/getDiagnostics for future tests. Optional WebMCP `inspect_valley` is feature-detected; unsupported browsers do not need it.

## Persistence

Saves use browser-local storage, schema 6 and a pinned per-domain generation manifest, with a previous-write backup key. Valid schema-1 valley, schema-2 dungeon, schema-3 waterworks, schema-4 settlement and schema-5 modular saves migrate without resetting inventory, quest payments, seed, event log or tombstones. Pickups, combat, quest changes and zone transitions auto-save; movement still uses manual Save. Export/import JSON is available. Failed storage access produces a visible error and leaves export available. Imports validate finite bounds, resource conservation, IDs, duplicates and schema. This is not the intended final IndexedDB transactional adapter; cross-device/cloud save sync is not implemented. Use Export save for a durable personal backup. This first build accepts imports for its active seed only.

## Verified

- Strict TypeScript, noUncheckedIndexedAccess, exactOptionalPropertyTypes and noImplicitOverride
- 147 passing Node regressions, including actual Rapier 0.20 WASM collision, worker-message integration and shared compiler/recipe/migration checks
- Vite production compilation
- Official npm exact version availability

## Runtime verification limit

Real-browser visual/gameplay verification could not run in the supplied environment: cloud-browser loopback navigation was blocked and the supported supervised preview service was not installed. Therefore WebGPU and forced WebGL2 shader/render execution, mobile layout, touch input and actual gameplay in a browser remain unverified. A successful deployment does not remove this testing limitation. The user reported the first prototype worked well on both tested devices, including the S25. That is user testing, not a measured benchmark or a verified rendering-backend report. The touch layout, streaming, dungeon and modular waterworks still need physical-device confirmation; 60 FPS remains a measurement goal.

## Deliberate first-pass limits

Generation 2 is described above. The following generation-1 foundation remains available unchanged for old saves:

The playable area is 96×96 metres with collision boundaries and two small settlements. The river remains a shallow presentation surface. The modular waterworks now conserves a bounded litre ledger, not a spatial fluid solver. Legacy repair/delivery completion remains a separate historical flag; the new live supply display comes from connected modules and available reservoir water. The cave northwest of Mossbank enters the Echo Vault: a bounded five-room dungeon generated from a versioned seed grammar. The topology is connected with a seed-selected mirrored branch layout, not arbitrary/unbounded dungeon generation. Three sentinels guard three persistent caches (scrap, water, core). The gold threshold is always usable to leave without fighting or spending resources. Sentries have a simple proximity threat and one-hit pulse response. Terrain, huts, the river, small stones and major landmarks stay resident. Foliage and interactive entity meshes are generated on demand by ownership cell; evicted meshes dispose their geometry and private materials. Tree and stone colliders load/unload in the worker. Cell metadata/factories remain as a small bounded catalog. Shared materials remain pooled. Pickup/sentry changes project from the authoritative saved state on every reload, so eviction never resurrects them. The minimap shows the active zone: a valley overview or the full connected dungeon plan. This is a bounded first streaming slice, not unbounded terrain generation. Broader content packs, origin rebasing, ECS packed simulation, tier transfer, unbounded machine assembly, creature evolution and settlement economy remain future milestones.

The next physical-device gate is S25 touch/multi-touch, dungeon enter/exit/reload and browser backend verification of this revision, followed by measured resource/streaming budgets and deeper semantic-generation constraints. Canonical border IDs establish ownership only; streamed terrain, geometric seam sampling, asynchronous generation cancellation, origin rebasing and region-scale persistence are not implemented. Do not scale to a continent before the valley passes those gates.

## Assets

All game geometry and UI iconography are procedural in this repository. Optional Google Fonts load DM Sans and Space Grotesk with local sans-serif fallbacks. No third-party animation or model packs were downloaded. Three.js and Rapier licenses are retained with installed packages.


## V5 baseline (controls superseded by V6)

Pass 1: inventory of every keyboard action and prompt against touch bindings. Interact, Pulse, movement, Sprint, orbit, zoom, Build, Journal, Save, Settings, Close/Back, import/export, original relief and commission accept/claim all have touch paths. The former E/F prompt was a noninteractive div; it is now a real 48 px button dispatching the same gameplay action. Upper-left information now has a modestly more opaque dark backing. Buttons preserve native keyboard activation without sending duplicate pulses.

Pass 2: executable input/state regression tests and independent source review before publication. Coverage includes two independent thumbs, third-finger ownership, pointer cancellation, lifecycle/menu reset, hybrid-device detection, tap-handler coverage, settlement ledgers, sequential claims, exactly-once rewards and schema migration. See MOBILE-AUDIT.md for final coverage and limitations. Exact dependency pins and lockfile are unchanged.

The supplied environment still lacks its supported browser-preview service. Source and simulated input checks are not browser event-dispatch, rendered-layout or physical S25 tests. WebGPU/WebGL shader execution, actual multitouch ergonomics and frame rate remain unverified here.


## V6 movement, presentation and verification

- Camera, Save and branding are in Settings. The Camera sheet keeps a portion of the world visible while paused and has orbit, zoom, reset, Back to Settings and Back to world controls. Settings scrolls independently inside safe areas; gameplay touch gestures remain canvas-scoped.
- Settings has feature-detected fullscreen entry/exit, unavailable/error states, repeated-tap guarding and browser-exit synchronization. Entry is only requested from the button gesture, with navigation UI hidden where supported. Fullscreen does not disable operating-system home/back/edge gestures and is not kiosk mode. No orientation, keyboard or security lock is requested.
- The analog pipeline preserves magnitude from floating thumb input, camera rotation and worker input through a continuous 0–8 m/s curve. Digital diagonal input is capped; Shift reaches the same maximum. Acceleration, braking and reversals are bounded in a fixed-step motor. Menus, blur, page hide, resize and visibility changes clear input and cancel slide momentum.
- Standing collision uses a 0.75 m half-segment capsule plus 0.32 m radius. Low collision uses a 0.2 m half-segment plus the same radius. Before shrinking, a six-per-second stance transition ducks the visible rig while retaining standing clearance. Expansion is rejected under a roof; low traversal continues until clear. Tests include an overhead fixture, although the authored valley does not add new low tunnels in this revision.
- Historical V6 (now the legacy generation-1 path) is flat: the worker enforces its known y=0 support plane exactly and queries all obstacles through Rapier. This prevents floor-contact noise feeding false lateral velocity/braking into the motor. This is deliberately not a general uneven-terrain controller.
- Numeric Three.js transform checks cover planted soles/palms, shared gait stride, low-pose bounds including the hat/stowed staff and transition clearance. These measure geometry; they are not rendered visual-quality approval. Live browser input, fullscreen compatibility, actual rendering and S25 ergonomics still require device testing.
- Save schema remains 4. Jobs, rewards, waterworks, dungeon state and old-save migrations are unchanged. Dependency pins and lockfile are unchanged.

Fullscreen reference: [MDN Fullscreen API](https://developer.mozilla.org/en-US/docs/Web/API/Fullscreen_API) and [requestFullscreen](https://developer.mozilla.org/en-US/docs/Web/API/Element/requestFullscreen), checked 30 September 2026.

V6 final local aggregate: TypeScript, all 54 tests and the Vite production build passed. The independent pre-publication review is recorded in MOBILE-AUDIT.md.


## V7 independent touches, pinch and contextual mobile play

The v6 pointer-state tests missed the reported real-input problem: movement owned its pointer, but HUD actions still depended on a browser synthesizing a click for a second simultaneous finger. V7 activates button taps from their own pointer-up stream instead. A matching later touch click is suppressed; mouse clicks, native keyboard/assistive activation, native select controls and scroll cancellation remain available. Opening a panel resets all pending inputs before the panel is usable.

New event-level regression tests invoke the actual production bindings using Node's EventTarget and a small DOM-contract shim. They cover a held primary movement touch plus non-primary buttons without any native click, several simultaneous controls, duplicate compatibility clicks, mouse/keyboard fallback, cancellation, dragging, disabled/removed controls, menu reset, pinch limits and orbit recovery. They improve on pure state/math tests but do not claim real-browser event synthesis or device validation.

The mobile interface now shows controls only when useful and moves the map, inventory and full objectives into Journal & map. Pinch is deliberately camera-area-only to protect the invisible left stick. The basic pulse can be automated on touch; meaningful interactions and movement timing remain manual. Both automatic and manual pulse use the same nearby-target list with movement-obstacle occlusion, alive/defeated checks and shared cooldown. The preference persists separately; save schema remains 4 and existing saves, jobs, construction, dungeon progress and exact dependency pins are unchanged.

Browser/device verification remains unavailable through the supplied supported preview route. No alternate browser route or live production navigation was used to work around that limitation. Physical S25 multitouch, rendered portrait/landscape layout, GPU execution and fullscreen still need device confirmation. See MOBILE-AUDIT.md for the v7 audit and the compact device checklist.

V7 final local aggregate and independent read-only review: TypeScript, all 67 tests, Vite production build and diff whitespace checks passed. Additional adversarial event scenarios passed. Rendered-browser/device verification remains pending as stated above.

## V8 verification additions

- Real worker/Rapier jump takeoff, apex, floor/platform landing, coyote allowance, buffered presses, held-no-repeat, walls/ceilings, low stance, pause/resume and zone/teleport resets
- Numeric airborne and landing rig poses and ground-relative shadow placement contract
- Production held-button handlers under EventTarget/DOM shim: independent move/crouch/jump pointers, all release orders, key/pointer aggregation, quick presses, re-rendered labels, focus/cancellation and stale-repeat prevention
- Stable four-slot markup/grid mapping and production keyboard-to-worker input execution
- Rotated solid/port definitions, off-grid and forbidden footprints, single source/tank/sink bounds, actual bent routes, typed joins, cycle/duplicate rejection, conservative flow, exact refunds and schema-4 migration

All browser/device limitations above still apply. The next physical-device gate is to hold movement plus Crouch, tap Jump, release each finger in turn, then place/rotate/connect a non-default route and export/reload it.

## V10 release verification

All176 automated tests, strict TypeScript, Vite build and whitespace checks passed on the connected-world revision. Independent read-only runtime/session and forced terrain-repair review approved. Extra deterministic seed sweeps covered1,024 arbitrary uint32 seeds; sampled maximum road grade was0.202 against the0.3 limit. Dungeon tests found77 non-isomorphic graph invariants across128 seeds and traversed all passages with real Rapier across eight seeds. Browser/device limits above remain unchanged.

## V11 verification

See CAUSAL-WORLD.md for the engine-independent overlay, reproducible path-proof test, conservation and persistent episode semantics. Browser/device limitations remain as documented above.

V11 local aggregate: 193/193 tests, strict TypeScript, Vite production build and whitespace checks pass. New causal overlay hash: `1c9730fb`; foundation hashes and dependency pins remain unchanged. Exact-checkpoint independent review gates publication.

## Regional communities

The six stable regional outposts now accept finite wood and stone for useful resident-built rainwater storage. Journal, the M atlas and Play & world expose real material shortages, construction and resident water use. [Play, conservation and recovery details](REGIONAL-SUPPLY.md).


## Developer settings standard

The experimental Developer lab now has five focused pages, 21 real bounded controls, explicit draft/Apply/reset, playable station/sentry setup, direct disposable system scenarios and validated portable feedback. There is no XP system; conserved renown/material budgets remain fixed. Every feasible gameplay feature must ship its developer exposure and reproducible test path as described in [DEVELOPER-EXPOSURE.md](DEVELOPER-EXPOSURE.md). See [DEV-LAB.md](DEV-LAB.md) for use and isolation.
