# Connected regional plans, milestone 2

This revision implements one bounded generation-2 valley and a separate generation-2 dungeon. It preserves the original generation-1 foundation and its persistent IDs. The shared kernel and workshop/waterworks recipes remain version1.

## Authoritative data

`generateValley(seed)` in `src/valley.ts` returns deeply frozen JSON-compatible data. It includes a 160 × 160 m, 2 m grid surface; an indexed upward-wound triangle mesh; a meandering river basin; two settlement sites; four compiled workshop plans; roads, crossing, foundations, intake infrastructure and reservations; gameplay objects and decoration candidates; and explicit semantic travel, work and water-supply endpoints.

`valleyHeight` uses barycentric interpolation of the exact Float32 triangle heights. `valleySurfaceHeight` additionally accounts for infrastructure support. The Three renderer and Rapier worker consume the same vertex/index arrays. Buildings use the same elevated shapes for rendering and collision. Roads sample the committed surface; bridge geometry is a real support collider. The yard slab and module colliders share the pad elevation. Resource visuals, interaction targets, camera focus, shadow projection and combat height checks use world elevation.

The ordered dependency is sites and broad terrain fields → reserved foundations and road graph/crossing → terrain sampling and grade validation → compiled rooms and exposed interfaces → resources and decoration. Named samples derive from seed, version, owner, feature path and purpose. There is no mutable global random stream in the new generators. IDs include domain/version/seed plus semantic paths. Decoration is rejected against committed access and foundation reservations, river clearance, object clearance and local terrain slope.

The bounded generator validates connectivity, route grade, building support, identity/output limits and objective access. A deterministic bounded elevation-compression repair preserves horizontal choices if a rare route exceeds its grade limit. No wall-clock timeout chooses content. Recipe configuration manifests participate in the new content hash; legacy manifest `16ba1973` is unchanged.

The waterworks retains its tested local 18-cell recipe and conservative litre ledger. `buildOrigin` translates these local cells into the generated yard. Build proximity converts the player back to local coordinates; rendering and collision convert modules to world space. A visible planned river intake/feeder supplies the yard. This is a source interface for the existing bounded water ledger, not simulated terrain flow or pressure.

## Dungeon grammar

`generateDungeonPlan` grows a connected frontier graph in a bounded lattice, then chooses optional extra links. Seeds vary 7–12 chambers, room footprints, lattice spacing, branch structure, 0–3 loops and corridor widths. Objective placement uses graph distance and stable semantic IDs. Carving the connected rooms and passages precedes perimeter-wall generation. The entrance is never gated by an enemy, item or payment. Core, water and salvage objectives and three sentries are persistent objects.

Topology tests compare graph structure without seed text; geometry tests compare coordinates and dimensions. Reachability is checked at graph and carved-floor levels. Real Rapier tests traverse the actual generated wall/corridor plans, not a separate approximation.

## Runtime and persistence

Schema6 now permits generation1 with its exact original manifest or generation2 with the new valley/dungeon manifest. Unknown versions, mismatched manifest/generation pairs and unknown hashes are rejected. Legacy schema1–5 migration still targets generation1, never generation2. Resource validation totals come from the pinned valley and dungeon plans rather than fixed inventory caps. Collected/defeated tombstones remain authoritative after cell eviction, repeated generation and load.

`src/session.ts` stores saves under generation/seed-specific keys and retains a previous-write backup. The old `axiom-save-v1` and its backup are readable but never overwritten by the new adapter. A corrupt primary can recover from a matching backup; writing a repaired save does not copy corrupt primary bytes over the backup. Importing a different world explicitly confirms replacement of that destination slot. Re-entering the active seed is a no-op, so an older saved snapshot cannot overwrite unsaved current progress.

A world switch first saves the active state, writes and selects the destination only after successful serialization, clears input, stops the physics worker and render loop, then reloads the entire page session. This reconstructs all scene roots, materials, physics, cell factories/catalogs, interaction arrays, UI state and timers together. Same-world zone/restore continues to use epoch-tagged worker replacement. Failed destination writes keep the current active world; no partially generated plan is mixed into a running world.

The terrain worker preserves the old special flat-floor contact path only for legacy worlds and flat dungeon floors. Mesh worlds use one full Rapier movement sweep, actual support normals, a maximum climbing slope, y-aware spawn/teleport and unclamped negative feet heights. Jump buffering, coyote allowance, held crouch, ceiling checks, menus/background pause and stale-epoch rejection remain tested.

## Stage-3 boundary (now consumed by CAUSAL-WORLD.md)

Read `ValleyPlan.sites`, `routeGraph`, `buildings[].plan.exposed`, `waterworksSupply` and dungeon `graph/objectives`. Workplaces include stable owner/port IDs and capacity/activity metadata. Travel endpoints include both settlements, camp, waterworks, pump, cave and workshop entries. Building generation does not import jobs. `worldEndpoints`, `worldObjects`, `worldDungeon`, `machineWorldObstacles` and the plan-derived inventory ledger are the runtime adapters.

Current Mossbank commissions, reserve consumption, renown and historical relief choices remain authored. Highmeadow is a connected inspectable settlement with workshops; it does not pretend to have an independent live reserve or generated commission board yet. Stage3 now adds a separate causal household/agent/job overlay above these pinned plans, preserving historical progress. See CAUSAL-WORLD.md; this paragraph records the milestone-2 baseline.

## Verification and limits

The tests cover seed-corpus determinism and meaningful geometry/topology variation; exact shared terrain winding/interpolation; road grades, crossings, access and reservations; full-height elevated workshop traversal; real worker incline/bridge/jump/negative-height behavior; dungeon graph/floor reachability; save migration, manifests, resource conservation, separate slots, failed writes and tombstones; and production input/DOM-contract regressions.

Strict TypeScript, aggregate tests, Vite build, whitespace checks and independent read-only review are release gates. Actual browser rendering, WebGPU/WebGL2 execution, mobile layout, S25 multi-touch ergonomics and measured frame-time/memory behavior remain unverified in this environment. The supported preview route was unavailable and prior live-Site browser navigation was restricted; no alternate browser route was used.

There is no infinite terrain, origin rebasing, async generation pool, simulation-tier transfer, general load-bearing structure solver, economy or spatial fluid solver in this milestone. Do not describe the bounded valley as those systems.

Release gate, 1 October 2026: all176 tests, strict TypeScript, Vite production build and whitespace checks passed. Independent runtime/session review and the forced rare-repair review approved with no remaining blockers. The forced repair test found and corrected compressed feeder clearance; service pipes retain their 0.24 m stand-off and the riser matches both endpoints. New manifest hash: `887423ac`; original manifest remains `16ba1973`.
