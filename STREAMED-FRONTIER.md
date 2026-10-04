# Streamed frontier · regional generator 1

## Enter it safely

Open **Settings → Choose a frontier → Open 10 km² frontier · current seed**. This opens or resumes a separate regional save. The existing original or connected valley stays in its original slot, terrain and IDs unchanged. A seed with a prior regional save resumes it. The seed form creates/opens regional worlds; the saved-world list still opens older worlds. Empty storage starts the regional frontier by default.

Regional saves use schema 6, the existing generation-2 core manifest, and an explicit `regional: {version: 1}` identity. Their keys are `axiom-save-region1-SEED`; the original `axiom-save-valley1-SEED` and `axiom-save-valley2-SEED` remain distinct. Switching first saves the outgoing world, and refuses to switch if saving fails. Backups and exact pre-upgrade exports are retained. Import files have an explicit 12 MB ceiling; device browser-storage quotas can still require an exported save for unusually large histories.

## Size and content

- One world unit is one metre
- Intended terrain area: **10,000,000 m²**, a square **3,162.277660 m per side**
- Bounds: ±1,581.138830 m on both horizontal axes
- Corner-to-corner diagonal: 4,472.135955 m
- The player's capsule remains inside the boundary wall; physical center-to-center journeys are slightly shorter than the geometric terrain width
- 64 m coordinate-addressed chunks, clipped at outer edges, with 2 m terrain samples

The existing 160 × 160 m valley is preserved exactly, including its bridge, settlements, workshops, construction yard, inhabitants, finite inventories, jobs, field ecology, Echo Vault and natural river cave. Its rim blends into seeded meadows, pine highlands, redstone uplands, heath and a continuous river corridor. Twelve named regional exploration destinations are connected by sixteen outer/core-exit trail segments and the existing valley bridge. They include roofed refuges, lookout cairns, ruins and shallow survey arches. Trail junctions remain open; structure clusters sit on level pads beside them.

Six of these existing outpost shelters now host a bounded regional supply loop: conserved wood/stone delivery, a one-time water retrofit and residents who work, collect and drink its stored rainfall. Their stable locations and structures are preserved. See [regional communities and supplies](REGIONAL-SUPPLY.md). The larger working economy and fully explorable underground systems remain in the starting valley; the new arches do not claim new dungeon interiors. There is no full regional town economy, planet-scale geology or ecosystem simulation.

## What actually streams

`regional-world.ts` compiles only one requested coordinate's terrain, road/water ribbons, structures and deterministic wilderness. A small macro plan contains roads/sites/biomes, not a complete region mesh or global prop catalog. Semantic resource IDs encode generator version, seed, owner chunk and candidate index.

`regional.worker.ts` generates requested chunks off the main thread. The client maintains one compile in flight and a bounded priority queue, accepts only matching addresses and bounded payloads, cancels obsolete work and rejects old epochs. If Worker construction itself is unavailable, an explicitly reported yielded main-thread fallback generates one chunk per event turn; it is not claimed to be background computation.

The runtime initially preloads the surrounding nine chunks, requests a radius-two neighborhood and retains up to radius three with a hard maximum of **49 terrain chunks**. Three.js creates terrain, clipped road/water meshes, structure meshes and instanced tree/rock batches. It disposes their geometries and per-instance GPU resources on acknowledged eviction. Regional solid outlines are generated only when requested. Core buildings also use the existing acknowledged ownership cells in regional mode. The small fixed valley gameplay model remains resident independently of rendering.

The zoom-out visibility update replaces the original fog-limited horizon with a bounded render-only terrain layer. Fog clears when pulled back; nearby gameplay detail remains collision-confirmed, while distant terrain is lower detail and is not simulated. See [camera coverage](CAMERA-VISIBILITY.md). WebGPU remains primary, with the pinned WebGL fallback. No new controls are added to the mobile HUD.

## Collision and lifecycle contracts

- Chunk terrain and solids are validated and allocated together before the matching load receipt
- Renderer replacement happens only after the corresponding epoch/revision receipt
- Rejected replacements preserve the prior physical and visible ownership; stale rejections cannot retire a newer replacement
- Unsafe unloads under or immediately ahead of a player are deferred
- A collision-readiness disk and velocity lead stop movement before missing terrain; this is a safe loading guard, not an invisible world-size wall
- Both sides sample identical global terrain vertices, colors and normals. Clipped ribbon borders and arbitrary triangle heights have numeric seam tests
- A shared inward-float32 perimeter constraint keeps the full capsule plus its 2 cm skin inside the geometric terrain bounds. Four corners and four edges withstand 30 seconds of full outward sprint, 30 seconds of crouch and six jumps each. Tangential motion remains collision-resolved by Rapier; four traversable edge runs measured 7.85–8.00 m/s without loading stops
- Three legacy → distant regional corner → starting region → legacy cycles restore the expected collider count exactly, without accumulation
- Native allocation or invalid-spawn failures preserve the previous live physics world and report a rejected world replacement
- Cold start, save restore, solo survey teleports and distant same-zone authoritative relocation preload their destination before release
- A newer destination during an asynchronous co-op relocation invalidates the earlier loading epoch
- Persistent back/forward-cache page pauses retain the streamer; final page disposal terminates it

The physics worker has independent caps of 128 active owner cells, 16,384 cell colliders and 4,096 revision-history keys. The region has 2,500 possible terrain owner coordinates; the bounded replay history can cover its actual chunks plus the original valley cells. No history is evicted in a way that could accept an old revision again.

## Persistent state and co-op

Generated content is immutable. Save data stores collected/defeated/gathered deltas and the original finite gameplay state, not resident meshes. Gathering grants one raw atom once. Small loose stones disappear after collision acknowledgment; trunks and large rocks remain solid after depletion. Staff contact remains feedback-only. Revisit, restart and co-op reconnect cannot regenerate a resource's credit.

Lazy canonical ID validation reconstructs only the referenced owner chunk. New, imported and received ledgers become certified immutable snapshots after full validation. Live local targeting reuses the validated snapshot instead of replaying every historical source. Immutable harvested-ID arrays also share a membership index, so a nearby feature check does not scan all past discoveries. A 120-source-chunk regression, larger than the 96-chunk generation cache, verifies repeated live queries cause zero historical recompilations. Server room polls reuse bounded certified ledgers only after comparing stored identity and contents; membership and authorization are never cached with them.

The finite survey crate can be carried beyond the old valley and saved throughout the regional world, including while the player visits underground zones. When its complete supporting terrain footprint is absent, the prop becomes dormant at its exact saved pose; it resumes real gravity only after collision is ready. Player/crate perimeter limits use their own shapes.

Four-player authority queries geometry around each player's actual location. Players in different remote regions do not share the first player's collision neighborhood. The bounded starting-valley encounter simulation retains its own geometry and finite state. Existing online player-contact/ledge restrictions remain unchanged.

## Metres and clock

**Settings → Developer lab → Streamed frontier** reports world extents, resident/queued/confirmed chunk counts, terrain vertices, current speed and accumulated actual movement distance/time. The map shows world extents and a 500 m scale bar. A full trail example distinguishes horizontal length from ground-following length. Solo survey teleport loads a chosen destination safely and excludes the jump from travel telemetry.

The calibration button uses a separate production Rapier worker. It measures six inputs on a real flat mesh with the same 2 m triangle spacing and exact 60 Hz steps, leaving the campaign unchanged. Default acceleration is 22 m/s², braking 30 m/s². No stamina is consumed by locomotion; the existing stamina pool pays for staff and guard actions.

Measured steady speeds from the repeatable release driver:

| Input | Speed | Time to 99% | Distance in 10 s from rest |
|---|---:|---:|---:|
| Walk, 36% thumb | 1.999960 m/s | 0.100 s | 19.92459 m |
| Jog, 58% thumb | 3.999887 m/s | 0.183 s | 39.66869 m |
| Run, 80% thumb | 5.999904 m/s | 0.283 s | 59.23009 m |
| Keyboard run | 4.999883 m/s | 0.233 s | 49.47245 m |
| Full thumb / Shift sprint | 7.999813 m/s | 0.367 s | 78.61033 m |

A geometric 3,162.277660 m straight side at nominal steady speed is approximately **26m21s walking, 13m11s jogging, 10m32s keyboard running, or 6m35s sprinting**, before acceleration, steering, terrain, obstacle and loading delays. Analog run at 6 m/s is about 8m47s. These estimates are not road-distance measurements.

Actual production-controller journeys used full-strength analog sprint (8 m/s target), slowing to 36% analog walk for waypoint approaches within 1.5 m. Locomotion stamina has no drain. Times include acceleration, reversal/turning, approaches and dynamic collision residency:

- Flat full playable east/west span with 1 m endpoint margins: about **3,161.334 m in 398.250 simulation seconds** outbound; **3,161.286 m in 400.867 seconds** returning
- Seed 42, Alder Waystation → Pinewatch Camp → Farwatch Cairn: **1,233.804 m in 163.467 simulation seconds** across generated terrain and real trees, rocks and shelters
- Both journeys stayed grounded in every measured sample, with zero missing-terrain stops
- Flat round trip visited 150 distinct chunk coordinates; generated trail visited 88. The measurement driver deliberately used at most nine resident terrain cells, stricter than the runtime's 49 cap. Generated route peak cell-collider count: 360. A separate 16 m-sampled catalog audit of that trail found peak 351 wilderness props, 8 structure pieces, 18,432 terrain triangles and 360 cell colliders in a radius-one neighborhood; these peaks are not all simultaneous and are not a GPU benchmark
- Worst sampled feet/ground discrepancy: under 1.4 cm flat; under 1 cm generated trail

The full 10 km² is generated by coordinate, but the real-controller soak sampled about 6.322 km of flat outbound/return travel plus 1.234 km of one generated trail. This is not an exhaustive physical walk over the entire area. Runtime diagnostics also expose current/peak prop and structure counts and renderer-tracked memory when reported. Physical-device RAM/GPU usage was not measured here. The JSON report is authoritative for exact current values and source hashes. These are simulation-clock measurements, not real-phone elapsed-time or performance benchmarks.

## Repeatable checks

Use Node 22.23.0, the verified runtime, for these unchanged project checks. No engine or protection-disabling flags are needed.

```
npm run typecheck
npm test
npm run build
node --experimental-strip-types scripts/measure-regional-world.mts
node --experimental-strip-types scripts/measure-regional-boundary.mts
node --experimental-strip-types tests/helpers/regional-generation-stress.ts
```

`evidence/regional-boundary-report.json` separately records all eight physical corner/edge checks, three complete cold-load recovery cycles, exact native counts and collision-buffer input bytes. An initial pre-fix 30-second boundary probe ended in a Node/V8 `jit_page.has_value()` fatal error in WebAssembly code reclamation/tiering. A clean isolated repeat did not reproduce that fatal, but exposed a real longer-duration perimeter constraint failure. A subsequent combined run produced another V8 allocation-unregistration assertion; its failed report is also retained. The perimeter and matching server constraints were corrected; the permanent prolonged tests now exercise strict complete-body bounds, jumps, crouching and tangential motion. Original failure and diagnosis artifacts are retained separately. The native failures strongly match an [upstream Node 24/V8 13.6 report](https://github.com/nodejs/node/issues/66366) and its linked [official V8 shared-wrapper reclamation fix](https://github.com/v8/v8/commit/9b8ca54d5a). This is an evidence-based match, not proof that the installed Node 24 runtime or every browser has been fixed. The subsequent unchanged ordinary game drivers passed on official Node 22.23.0: 13/13 physics/calibration/journey tests and 15/15 boundary/prop tests. The exact binary/archive checksums, commands and successful reports are recorded in `evidence/regional-supported-runtime-control.json`; the earlier diagnosis and failures remain historical evidence.

`evidence/regional-physics-report.json` records six calibrations, both journeys, the exact source/test dependency hashes before and after execution, assertions and scope. The generator stress tool samples 100 seeds, all route grades and solid clearance. The completed sweep found zero generation failures, grade violations or route/structure overlaps across 1,056.9 km of sampled trail; maximum grade was 0.269883 against the 0.3 limit.

Additional tests cover allocation rollback, invalid/stale packets, missing-terrain stop/resume, unload/revisit, exact clipped boundaries, strict resource IDs, immutable-ledger validation, separate save keys, four distant HTTP/SQLite players, replay/CAS conflict receipts, bounded queues and GPU resource disposal.

## Verification limits

Passing standard checks on the supported Node 22 control does not erase the failed Node 24 runs or certify another engine version. No runtime protection was disabled, no game assertion was relaxed to obtain those passes, and no Node 24 engine repair is claimed.

The cloud browser's localhost access was denied. That restriction was respected; neither another browser/transport nor the live Site was used to bypass it. No rendered screenshots, on-device touch ergonomics, S25/S26 performance, RTX 4060 FPS, or actual internet multiplayer latency are claimed as verified. The unchanged production visual inspector remains available for manual review. The release is backed by code, numerical, real Rapier and HTTP/SQLite tests and native deployment status.
