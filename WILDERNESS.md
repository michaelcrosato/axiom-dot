# Physical wilderness

Trees and rocks now share one deterministic feature catalog across rendering, solo Rapier physics, co-op movement, staff contact and gathering. The catalog retains generation-1 random-draw order and generation-2 ValleyPlan anchors. It does not reseed existing worlds or alter their terrain, manifests, roads, buildings, quests or salvage ledgers.

## Play

- Every tree has a solid trunk, including smaller trees previously omitted by the size cutoff. Canopies remain passable
- Stones use the same scaled dodecahedron vertices as their visible meshes, rather than large invisible boxes. Small stones can be stepped over; larger slopes and faces stop or support the capsule
- X / E gathers one unit of deadwood from a tree, one loose small stone, or one chip from a larger rock. Small loose field stones disappear. Trees, large rocks and river-bank stones stay physical after their finite yield; cave-arch supports cannot be collected
- A small bark/chip marker and the disabled “Gathered” context label indicate a depleted standing source
- Journal shows carried raw wood and stone separately. In regional worlds, these finite materials fund the six outpost rainwater retrofits; allocated stock is subtracted from the carried total. They never become machine scrap, garden biomass or repeatable quest rewards
- Staff attacks contact the same solids during their committed active window, with a brief canopy response or impact pulse. They do not award materials or fell trees. Automatic touch combos continue to select sentries only

## Geometry and streaming

`wilderness.ts` owns world-qualified IDs, exact original render dimensions, immutable physical solids, and the removable/harvestable classification. `wilderness-geometry.ts` carries dodecahedron vertices, face planes and exact closest-surface/line queries. Tree colliders fit the visible 0.35 m square trunk and extend into sampled ground only, closing slope-root gaps without making foliage solid.

The initial 16 m ownership cells are installed in the physics world before spawn recovery and ready acknowledgment. Subsequent cells preload two cells ahead; eviction has one-cell hysteresis. Main renders a newly loaded/replaced group only after its exact epoch/revision receipt. Small-stone collection retains the old visual projection until the replacement collision receipt arrives. Older acknowledgments cannot resurrect either the old group or old solid. The same identity/depletion projection is reapplied after cell eviction, cave return, reload, lab restore and co-op snapshots.

Old saves can place an actor inside something that was previously decorative. The worker keeps a clear original capsule/checkpoint unchanged, tries an in-place safe crouch for a low ceiling, then resolves remaining overlap with a bounded deterministic ground search. Server migration recovery applies the same bounded policy to saved online actors only when newly solid wilderness overlaps their capsule. No client-selected relocation is accepted as a recovery command.

## Persistence and authority

Optional schema-6 `wilderness` state stores version, generation, seed, collected source IDs, raw wood and raw stone. Absent data means pristine sources; old saves remain valid. Validation requires unique known harvestable IDs and exact finite totals, rejecting forged resources, foreign worlds, unknown fields and duplicate yields. Existing machine, equipment, economy, ecology, water and quest ledgers are unchanged.

Gathering requires a living, grounded standing actor, no active staff/guard/grip action in gameplay, and a reachable actual solid surface within 2.25 m of the hand-height probe. Other solids block the path. Action requests contain a source ID only; authoritative worker/server feet elevation supplies the height check. In co-op, room transactions own the shared ledger and concurrent collection is awarded once. Staff feedback uses accepted server attack IDs and hit IDs, without local resource mutation.

Solo collision is exact Rapier convex geometry. The co-op bounded movement validator clips a capsule-expanded convex hull and uses hull-plane support/ceiling queries. This is conservative at polyhedron edges and is not a second full Rapier simulation. It retains all existing legacy hut/building solids. Shared exact line-of-sight queries prevent attacks or gathering through the empty corners of a loose bounding box.

## Inspection and checks

Settings → Developer lab → Run isolated solid probes launches a separate disposable production physics worker. The chosen 1/3/5 repeats cover small and large tree/rock fixtures from both generations. Each fixture records 205 real snapshots and measures capsule-to-convex clearance, grounding and whether the actor stops at contact or climbs over. Export contains the source revision and every observed result; cancellation remains explicitly incomplete. These probes never access campaign reducers, inventory or save storage and do not change the original nine-case movement course.

Settings → Show wilderness collision outlines reveals the actual resident trunk and rock hulls. The read-only `window.axiom.getWildernessSnapshot()` exposes the catalog, current raw-material ledger, confirmed/pending cell revisions and outline status. No writable debug action is exposed.

Automated coverage includes exact legacy RNG and Three.js hull parity, saved-generation/terrain anchor preservation, real worker walk/sprint/jump/crawl/slide/crate collision, slope grounding, initial-cell preload, stale epochs and revisions, old-save/teleport recovery, bridge crossings, finite/depleted persistence, extracted production cell rendering receipts, real HTTP/SQLite concurrent co-op claims, server sweeps/ceilings/LOS, and repeated lab probes.

Rendered browser appearance, physical-phone play and frame-rate performance remain unverified. The existing browser restriction was respected; numerical and source checks are not visual approval.

Rollback: `rollback/pre-wilderness-2026-10-01` → `2043566cbc334b8fbffed3fb45eebbd5d9376a3b`.
