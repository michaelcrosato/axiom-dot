# Living agents and causal work, milestone 3

This is a bounded causal simulation above the pinned connected valley. It is not the complete long-term engine in the original framework brief. The shared compiler, terrain, dungeon, waterworks and workshop manifests and dependency pins are unchanged.

## Authoritative plan and identities

`src/causal.ts` imports no renderer, DOM or physics engine. `causalPlan(seed)` consumes the actual generated settlement sites, roads, workshop entry/work ports, hall/door geometry and surviving sentry locations. Named seed samples determine initial household water, worn mechanisms, repair costs, caretaker assignments, names and whether Highmeadow has a builder. Five or six persistent residents have semantic home/role IDs: two caretakers, two carriers and one or two builders. Each settlement has one assigned workplace; its other workshop is an optional spare.

`CAUSAL_VERSION`, `CAUSAL_MANIFEST` and its saved content hash pin the overlay independently of the unchanged foundation hashes. Plans are deeply frozen. Jobs and residents retain IDs through changing route availability, cell eviction, vault visits, save/load and seed-slot switches.

## Needs, capabilities and bounded planning

The simulation advances in quarter-second steps, at most four per tick call. Residents track thirst, fatigue, cargo, task, position and progress on a stable waypoint route. Caretakers drink, rest and perform service only at their assigned operational workplace, consuming actual household water. Builders choose reachable assigned damaged mechanisms and consume a finite shared settlement kit stock after eight seconds of work. Carriers fetch a real load from the waterworks depot and deliver it to their own town. They do not create canisters, scrap or cores.

Carrying capacity is derived from the generated round-trip road distance and the household work-water rate, with a two-litre margin, bounded to 3–12 L. This matters: a fixed 3 L load could not sustain the longer Highmeadow route. Source, fatigue, water and route preconditions are checked again at execution; two builders cannot spend the same kit stock or repair twice. The stable actor order resolves simultaneous actions. Breadth-first route search visits no more than the bounded node count; a movement slice visits at most 32 waypoints.

Unarmed residents avoid surviving sentries within 16 m of a required route. This is a conservative civilian caution distance, distinct from the player's combat range. Clearance requests are only generated for threats intersecting an actor's actual home/source/work path. Killing an unrelated vault sentry does not satisfy one. Defeated sentries remain tombstoned; clearing the named threat lets the same residents resume their routes.

## Physical path contract

Residents are kinematic path followers with no individual Rapier bodies and no agent-agent collision or crowd avoidance. The shared road paths and workshop doorway/hall paths are tested with a real full-height Rapier capsule. Workshop access uses its compiled entrance, hall and work approach, rather than a straight line through walls. Legal modular construction cannot block these reserved paths.

The repeatable route test traverses all 13 edges in both directions over six seeds (156 traversals), with the exact terrain mesh, solid buildings, foundations, bridge, actual tree colliders and a conservative union of every legal module footprint. Independent review additionally sampled 123,715 path points over 46 seeds without static obstruction. This establishes path traversability, not full dynamic multi-agent physics or perfect foot placement.

## Water and material ledgers

Household water is separate from the historical Mossbank commission reserve. Its conservation identity is:

    generated initial water + extracted intake water + captured modular overflow
      + player canister litres
      = depot + carrier cargo + household reserves + consumed litres

A canister transfers exactly 4 L and consumes one actual collected item. Delivery is refused unless the household has 4 L of free capacity; there is no hidden loss or return-canister duplication. The depot holds at most 20 L, each home at most 20 L, and carriers retain cargo until it fits.

Repairing the original pump activates the household intake, or the player can repair its loading point for 3 scrap + 1 core after choosing the old canister-relief solution. It extracts 0.5 L/s from the existing river supply into free depot capacity. This is a conservative store/source approximation, not spatial river flow or pressure.

Alternatively, the existing modular outlet continues to serve its original Mossbank reserve. Only actual new overflow from that reserve can enter the household depot. The overlay records seen overflow, captured litres and discarded litres; overflow arriving at a full depot is discarded, never queued as an unbounded future source. Old saves establish an overflow baseline, so historical spill cannot be recovered retroactively. No delivered litre is simultaneously consumed by both reserves.

NPC kits have a finite generated initial scrap total. Player-paid workshop and intake repairs have a separate spent ledger reconciled with collected inventory, installed module costs and the original quest payment. Repair consumes resources once and cannot be dismantled/refunded. NPC resources never become player inventory.

## Generated jobs and causal credit

The generator reads unmet predicates and capable actors. It produces requests for an actual low household reserve, an assigned damaged workplace, or a surviving threat interrupting required access. Seeds change the number, targets, costs, actors, routes and underlying need. The original three Mossbank commissions remain a separate authored progression.

Each generated record stores a stable causal episode ID, issuer, settlement and target IDs, cause, preconditions, capabilities, route, completion predicate, reward reservation, creation/completion times, failure reason and contribution evidence. These are founding incidents: at most one relief episode per initially under-supplied settlement, one repair per assigned naturally worn workplace and one clearance per relevant threat. They do not expire (`expiresAt: null`) and do not regenerate from player-induced dismantling or later consumption. There is no unbounded recurring job economy or general event director.

Water completion checks a real 6 L household reserve, not a prescribed click sequence. Direct delivery, permanent intake repair and connected modular overflow can satisfy the same need. Merely repairing a source does not complete the request; a carrier must make the actual journey and deliver. Source goals reference durable supply predicates, not disposable module IDs, so rebuilding a network cannot orphan a request.

Accept before contributing and claim at the issuer's home flag. A player contribution records a real delivery, paid intake/workplace repair, first network activation or defeat of the named threat. NPC/world completion resolves the same predicate without an unearned player reward. The first working-network marker prevents disconnect/reconnect credit. Each issuer settlement reserves rewards from a 32-renown budget. Resolved work releases its reservation; a claimed reward moves it to spent renown exactly once. Terminal episode records are retained, independently of the 20-line display event log.

Feasibility uses executable payment paths: NPC and player scrap cannot be combined into one repair; another town's cargo is unavailable. Loose depot water does not make a finite-stock job feasible before a real carrier load exists. Blocked requests explain their unmet supply condition and are rechecked. This is a bounded capability-action planner, not a general symbolic planning language.

## Runtime, inspection and persistence

Both settlement flags open the Living frontier board; Journal permits remote inspection. The existing Interact slot can inspect a nearby resident, workplace or loading point. Commands remain proximity/resource gated in the reducer. The board shows causes, status, required actions, actual routes, reserved/paid/released rewards and resident needs. Role-colored figures, carried-water containers and repaired workplace/loading beacons project the persisted state. Rendering never changes simulation state. Original commissions remain one button away.

The causal simulation continues at its bounded 4 Hz in the dungeon, with the same IDs, route progress and inventory ledger. The older waterworks/commission subsystem retains its existing dungeon pause. Menus, background tabs, focus loss and zone transitions pause ticks. No wall clock, save timestamp or elapsed offline time generates catch-up.

Schema 6 retains explicit schemas 1–5 migrations. Generation-1 saves have no overlay and remain unchanged. A generation-2 save lacking the optional overlay receives it once on load, preserving its foundations, inventory, original commissions and tombstones. The old quest resource ledger distinguishes a repaired pump from canister relief. Malformed/unknown overlay versions and hashes, invalid identities/routes/tasks, non-finite numbers, impossible founding episodes and inconsistent water/material/reward accounting are rejected. Existing generation/seed slots and previous-write backups remain authoritative.

## Verification and boundaries

Tests cover seed variation without ID text, deterministic replay, bounded long runs, exactly-once reward claims, finite NPC/player payments, all three water solutions, actual carrier delivery and route resumption, NPC resolution, anti-reconnect credit, discarded overflow, save corruption/migration, dungeon continuation, fixed input regressions, DOM board contracts and read-only Three scene projections. Real Rapier independently proves the generated access paths.

Browser rendering, WebGPU/WebGL2 execution, physical S25 multi-touch, portrait/landscape visual approval, measured frame-time and memory profiling remain unverified. The supported preview route was unavailable and prior live Site navigation was restricted; no alternate route bypassed those limits. The four fixed action slots, held crouch/jump, analog movement, independent touches, pinch, auto-pulse and fullscreen controls are preserved.

Local release checkpoint, 1 October 2026: all 193 tests, strict TypeScript, Vite production build and whitespace checks passed. Overlay hash `1c9730fb`; legacy foundation `16ba1973`, connected foundation `887423ac`. Independent exact-checkpoint review is required before publication. The build retains the known large-chunk advisory; it is not a measured runtime-performance result.

## Optional recurring water-relief pack

The original founding episodes above remain unchanged. The additive
`causal.waterRequests` pack now supports a separately hashed, finite recurring
household-water loop with observed relief, resident consumption, relapse, physical
contribution, completion/claim deadlines, and the same original issuer budgets.
See `WATER-REQUESTS.md` for the exact contract, compact receipt schema, authority,
UI integration, conservation tests and unchanged import-size limit.

## Rest hysteresis (audit fix)

A resident who starts resting because fatigue exceeded 70 now keeps resting at home until fatigue is 30 or lower. Previously rest ended at 70 and the commute pushed fatigue back over the threshold on arrival, so after roughly 20 active minutes a caretaker spent more than 80% of its time walking between home and workplace and workshop service fell from about 540 to about 9 units per 10 minutes. The state schema, manifest and hash are unchanged; saved states load as before, but replays of existing states diverge from the previous build once a resident first tires. Regression: `tests/causal-long-run.test.ts`.
