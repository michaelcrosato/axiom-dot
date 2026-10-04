# Regional communities and supplies

This pack adds a bounded, persistent supply loop to the six existing regional outposts. It does not reseed the terrain, relocate a shelter, add moving road caravans or claim a complete town economy.

## Play the loop

Open a **10 km² frontier**. **Journal → Regional communities** or **Menu → Play & world → Regional communities** lists the crews and projects. Start at Alder Waystation along the west trail. The **M** atlas shows an outpost’s current shortage and project status; its inspection button opens the same supplies panel. Inspecting remotely is read-only: delivery and construction require standing at the shelter’s E / X supply point.

1. Gather finite deadwood and stone with E / X. Every canonical source yields once
2. Deliver the outstanding materials at the shelter. Only carried stock needed for that project transfers
3. Start the retrofit when its real material bill is fully delivered and the footprint is clear
4. Close solo menus so the residents can work. Visible formwork occupies the same physical envelope as the completed storage
5. Once finished, bounded modeled rainfall fills the collector. Residents walk to it, fill drinking flasks, return and drink. Their water balance and hydration are visible in the supplies panel
6. Leave and return, save or reload. Delivered stock, construction work, stored water and resident progress persist

The three existing mobile action slots plus A jump remain fixed: X context, Y staff, B hold-crouch, A jump. No new touch HUD button is introduced. Camera, movement and the solo-only traversal restrictions are unchanged.

## Conservation and exhaustion

The wilderness ledger retains lifetime harvested wood and stone, including its canonical source IDs. The regional allocation ledger records each settlement’s delivered materials. Actual carried stock is **lifetime harvest minus all regional deliveries**. Materials remain owned by a settlement after construction; starting or finishing work never grants a resource payout. Repeated requests, stale revisions and concurrent room actors cannot allocate the same atom twice.

Project costs differ with the shelter’s existing environment. Local source availability is inspected lazily and is finite. Harvested trees and large rocks remain solid; small stones disappear only after the existing collision acknowledgment. Depleted sources do not regenerate. If a local material is exhausted, the panel reports the shortage and road-linked alternatives instead of inventing stock.

Water is the explicit renewable input. Existing version-1 supply saves retain a deterministic 30-second active-time rain cycle: 20 wet seconds and 10 dry seconds, offset by world seed and outpost index. Newly enabled version-2 ledgers use seeded regional rain fronts and multi-minute dry spells; [Regional weather](REGIONAL-WEATHER.md) explains timing, access and compatibility. Both models use the existing biome-specific input rates, remain separate from the garden weather system, and produce water only during accepted active simulation. It has finite tank capacity, resident flask capacity, consumption and overflow. The stored balance accounts for captured water as tank water, carried water, consumed water or overflow. Water is not converted into machine scrap, raw construction materials or player rewards.

## Clock, streaming and authority

Settlement state uses a bounded coarse simulation clock, independent of how many outposts are visible. In solo it receives the existing accepted simulation ticks; menus, backgrounding and a closed world do not create elapsed-time catchup. In co-op the server advances shared time once per room, retaining the existing one-second cap and absent-host pause. Rendering does not run a second simulation.

Only nearby residents are presented. Approaching a shelter from below cuts away its roof for a clear interior view; the unchanged roof collider remains in place, and the roof is visible again from above or away. Their deterministic work and drinking paths stay on the existing shelter pad and use its terrain support. Their figures are kinematic presentations, not independent Rapier rigid bodies. They do not travel arbitrarily through the regional wilderness.

The construction command reserves the physical footprint immediately. The server checks all current and retained valley peers and the saved survey crate before accepting it. The local scene adopts new structure presentation only after its owning terrain cell acknowledges the corresponding solid set. Completion changes the formwork surface and water state within the same solid envelope. Chunk eviction removes only presentation and physics residency, not settlement state. The existing 49 terrain-chunk limit remains in force.

## Save compatibility and recovery

`frontierSupply` is an optional versioned regional save field. Original and connected valley save flavors are not upgraded into a regional world. Existing regional worlds receive the new state without changing their generation manifest, seed, position, world identity or prior progress.

Before the first upgraded local save, the exact prior compatible raw save is retained separately from rolling backups. **Menu → Advanced → Older recovery checkpoints → Export pre-settlement-supply save** exports those original bytes. A malformed checkpoint or quota failure stops the outgoing save rather than overwriting recovery data. Existing restart history, imports, cross-tab revision protection and co-op solo-return checkpoints remain in use.

## Verification and scope

**Developer lab → Regional settlement loop** runs disposable deterministic worlds using real finite resource IDs. It never supplies the current campaign with materials or mutates its progress. Exported results distinguish model and persistence checks from controller/physics, rendered or network checks.

Ordinary automated tests use the existing official checksum-verified Node 22.23.0 runtime. The earlier Node 24 native WASM failures remain retained historical evidence; this pack does not diagnose or claim to repair that runtime issue.

The cloud browser’s localhost denial remains respected. No alternate transport or browser, proxy, or production Site navigation is used to bypass it. No assistant-rendered visual approval, physical-phone performance, RTX 4060 frame rate, touch ergonomics or real internet multiplayer latency is claimed.

### Recorded checks

- 980/980 project tests passed, including legacy controls, traversal, combat, streaming, menus and co-op suites
- Both browser and server TypeScript configurations passed; production browser and Worker builds passed
- The unchanged regional generator passed a 100-seed sweep over 1,056.9 km of sampled trail, with zero plan, grade or structure-clearance failures
- The compiled Worker served all 11 bundled assets byte-for-byte and passed authenticated SQLite-backed delivery/build, replay, conservation and cross-account access checks
- Three deterministic model runs each passed 15 checks. Seed 73129’s first retrofit completed after 15 simulation seconds; both residents drank by 43.75 seconds. At that moment their thirst was 40.25 versus 65.25 in an unbuilt control
- All six seed-73129 projects allocated 26 wood and 24 stone. All twelve residents drank by 68 simulation seconds; the regional supply payload was 4,660 bytes
- 354 sampled resident-route capsule positions remained clear. The actual generated-terrain controller test recorded 458 samples, a minimum project clearance of 0.02066 m and maximum support error of 0.00202 m through departure, unload, persisted reload and return
- Cold maximum-clock import checks across three seeds and start times, including severely thirsty crews, completed in 147–181 ms on this server, with saves below 5.3 KB. This is CPU test evidence, not a device benchmark

The first aggregate run retained 20 test failures: three fixture assertions needed the new pack/disposal dependency, and 17 extracted live-lab tests lacked the new report variable. Those fixtures were updated without relaxing their original assertions; the complete suite then passed. Independent review also found and prompted fixes for stale modal navigation, retroactive construction timestamps, forged hydration, uncertified-state laundering and coarse resident pose updates. Their regressions are retained.

Exact numeric records and input-file hashes are in `evidence/regional-supply-report.json`. The compiled build checks and ordinary test/typecheck/build logs sit beside it. Source hashes establish which files were measured; the build’s embedded source revision is recorded separately on final release.
