# Shared procedural framework, milestone 1

The kernel and version-1 packs described here remain pinned. Milestone2 now consumes them in generated connected worlds; see [CONNECTED-WORLD.md](CONNECTED-WORLD.md). The original flat foundation below applies only to retained generation-1 saves.

This revision converts real waterworks construction and one inhabited-size workshop recipe to a shared compiler. It does not implement the later regional terrain/road/dungeon or agent/job-generation milestones.

## Public boundary

`src/procedural.ts` imports no renderer, physics engine, DOM, or other content generator. `AxiomRegistry` stores immutable versioned JSON primitives and explicitly registered connection adapters. `Recipe` and its expression tree are serializable data. `compileRecipe(registry, recipe, context)` returns a deeply frozen `SemanticPlan`; consumers must check `plan.valid` before installing it.

A plan contains version/seed/owner identity, its axiom manifest, semantic nodes, world-space cuboid shapes, typed ports, accepted connections, exposed interfaces, constraint results, costs and choices. Each shape has `center: {x,y,z}`, `half: {x,y,z}`, material, and solidity. Three.js and Rapier consume the same shape dimensions and vertical position. Navigation/work systems should read ports, room metadata and connections rather than import rendering code.

Stable IDs are `axiom:<recipe-version>:<world-seed>:<encoded-owner>:<entity-kind>:<encoded-semantic-path>`. Generated content uses named owner/path/purpose samples, not a mutable global random stream. Adding an unrelated sample cannot move another feature. Node and connection namespaces are distinct; local shape/port keys are encoded independently, preventing path-separator identity collisions. Repeat instances use explicit semantic slot keys. Existing runtime-created water module IDs are retained exactly; they are never reassigned by plan sorting.

## Language and deterministic bounds

Typed `expr` builders produce plain JSON for instantiate, group, transform, repeat, choose, split, connect, attach, require and expose. Numeric shape expressions support bounded parameter lookup/addition/multiplication. Parameters declare min/max/default/integer constraints. Transforms are translations and exact quarter turns about +Y; units are metres and explicit port units. `split` divides a specified span into weighted centers separated by a declared gap; it does not infer child dimensions. `attach` validates an explicitly positioned attachment-port pair; it does not run an alignment solver.

Each recipe declares node, operation and depth budgets. Global ceilings are 512 nodes, 50,000 operations, depth32, 1,024 output shapes, 2,048 ports, 1,024 exposed interfaces, and 4,096 constraint records. Bounded repeats have at most64 slots; choice/split have at most32 branches. Numeric expressions have depth16 and at most16 operands. Validation checks consume the operation budget too. Oversized input/output or exhausted budgets produce a rejected plan; failed output serialization returns a small empty rejected plan rather than throwing or installing partial content.

Catalogs and recipes reject executable properties, functions, accessors, custom prototypes, unsafe object keys and oversized JSON data. No eval, imported JavaScript, arbitrary shader or text-language execution exists. This is a small in-memory grammar, not a node editor or content-pack upload feature.

Numbers use JavaScript finite binary64, bounded to ±1,000,000 for authoritative numeric inputs; seeds/hash sampling use explicit uint32 operations. Resource costs permit at most six decimal places and sum as integer millionths, making both totals and budget decisions independent of traversal order. Finer costs are rejected rather than rounded away. Canonical ordering is ASCII lexical, independent of runtime locale. This does not claim cross-platform bit-identical Rapier simulation.

## Enforced constraints

The compiler checks registered versions, parameter bounds, positive cuboid extents, typed port directions/protocols/units/capacities, unit facing vectors, matching transforms where required, single-use sockets, self joins, duplicate IDs, required connections, graph reachability/acyclicity, node counts and material budgets. Context bounds and reservations enforce planar XZ footprint containment/clearance.

`Reservation.maxSlope` is reserved context metadata and syntax-checked only. This milestone has flat foundations and no terrain-slope sampler or structural load solver. The regional milestone must add those validators before claiming slope/load guarantees. General solid-vs-solid collision avoidance is domain-specific: waterworks enforces cell/footprint occupancy, and the workshop recipe constructs and tests valid wall/opening layout. The kernel does not forbid intentional wall/floor intersections globally.

## Waterworks integration

`waterworksRegistry`, `waterworksRecipe(machine)` and `compileWaterworks(machine, seed)` expose the actual player assembly. Seven registered primitives retain schema5 dimensions, ports, costs and capacity. `moduleObstacles`, `portsFor`, `machineObstacles`, `machineCosts`, graph validation and the committing build path compile through the shared framework. Rendering reads those compiled shapes; physics receives their matching boxes. Existing proximity, protected-route, player-clearance and resource-conservation rules still apply before spending.

The network still has one 20L reservoir and a conservative ledger, not a pressure-based spatial fluid solver. Fluid ports declare L/s; storage declares L. There is no free recipe deployment or duplicated inventory in the inspector.

## Workshop integration

`compileWorkshop(seed, options)` returns the semantic plan plus rooms, doors, footprint, entry spawn and workplace position. The recipe varies width, depth, hall depth, doorway width/offset, 2–4-room program and wall finish using independent named samples. One front hall connects to 1–3 rear rooms. Walls are real split solids with 2.65m-high openings; the standing Rapier capsule can enter every room, reach the work point and leave.

The live workshop is centered at (-31,-14); `WORKSHOP_CLEARANCE` reserves its plot and entrance. Its roof hides as the player approaches, while its physics ceiling remains. The exposed `entry` spatial port and `workplace` work port use stable IDs. Workplace properties include activity and worker capacity; no agent, production or job generator is implemented by this pack.

Settings → Procedural workbench, or Build → Inspect procedural plan, opens the shared inspector. It shows seed/recipe selection, bounded JSON expression, top-down plan, node/parameter/port details, costs, exposed interfaces, connections, manifest and all constraint results. Seed changes preview only; the live world remains pinned. The existing modal path pauses simulation and clears touch/keyboard holds; Escape/Close dismiss, and keyboard focus remains inside the panel.

## Persistence and later milestones

World schema6 stores `generationManifest`: framework1, valley1, dungeon1, waterworks1, workshop1, recipe identities and a catalog-content hash. Valid schema1–5 saves explicitly migrate without resetting inventories, quests, jobs, module IDs/links, fluid ledgers, seed or collected/defeated tombstones. If a saved player position intersects the newly introduced workshop, only that position is moved to the verified exterior entrance. Load-time recovery (workshops, generation-2 valley buildings and both vault generations) uses a round 0.33 m footprint against the 0.32 m explorer capsule, so a pose the character controller legitimately left resting against a wall or furniture corner is kept; only genuine overlaps are moved. Unknown versions or content hashes are rejected.

The old valley's terrain, river, roads, six huts and two mirrored dungeon layouts remain version1. Workshop plot exclusions still consume the original eligible tree/stone size samples, so later random draws and geometry outside the new reservation remain unchanged. Tests compare actual geometry, not IDs containing the seed: old dungeon seeds1 and2 match; seeds1 and606 exercise its two real variants.

For milestone2, consume compiled spatial/work/fluid ports and reservation records; preserve vertical `center.y` when adapting shapes. Introduce new valley/dungeon domain versions explicitly rather than silently replacing saved foundations. Move static placement exclusions behind context reservations, generate terrain and infrastructure before dependent parcels, and retain old version1 content for old worlds or provide an explicit verified migration. The current workshop can compile at a different `origin`/`owner` with a supplied resource budget and reservations.

For milestone3, inspect exposed work/fluid interfaces and semantic node properties to derive needs/actions/jobs. Do not make building generation import job generation. Use stable target IDs and persistent changes above the pinned base plan. Current three commissions remain authored and unchanged; no generated-agent claims are made here.

## Verification boundary

Automated tests exercise deterministic compilation, independent streams/order, semantic geometry variation, all operators, invalid inputs/ports, resource precision, output amplification, budget exhaustion, actual waterworks integration, save migration, legacy valley draw preservation, doorway clearance and full-height Rapier traversal. Strict TypeScript, repository tests and production build are the local gates.

Real browser/device visual verification remains unavailable in this environment: the supported preview service was unavailable and prior navigation was restricted. No alternate route bypasses that restriction. The DOM-contract and real-Rapier tests do not establish WebGPU/WebGL2 execution, S25 ergonomics or frame-rate performance. Those remain explicit physical-device gates.
