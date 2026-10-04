# Online co-op: authority, transport, and verification

## Product contract

- Opt-in expeditions for one host and up to three other signed-in players
- Hosting copies a valid campaign into a separate durable co-op save; it never writes a solo browser slot
- Shared world, collected resources, inventory, construction, equipment assembly, jobs, causal consequences, cave water, and enemy health
- Individual player positions, zones, suit health, facing, and staff combo timelines
- The host controls the expedition equipment and can close or resume the saved room
- Rooms are real HTTP server state, backed by Sites D1 SQLite; no BroadcastChannel, local-tab relay, or peer-to-peer demo
- Regular polling targets one exchange every 250 ms. Reliable jump edges flush sooner, with at least 125 ms between exchanges and never concurrent syncs. HTTP latency still applies. This is not a low-latency competitive multiplayer transport

## Site access is a separate boundary

The existing Site remains owner-private. Invite codes do not change its audience or bypass its login. Other accounts need explicit permission to open the Site before they can join. Do not describe friend access as enabled until the Site owner chooses a supported sharing option and it is verified.

Every room operation requires the platform-provided authenticated user ID. Public or anonymous writes are rejected. The app does not mint long-lived credentials, use a third-party multiplayer provider, or change account permissions. A per-player ephemeral session identifier prevents an older tab from continuing after the same signed-in user deliberately rejoins elsewhere; it is not a substitute for platform authentication.

## Architecture

- `src/coop-protocol.ts`: bounded inputs and public snapshots
- `src/coop.ts`: serial browser transport, reliable retry, snapshot delivery, connectivity states
- `src/coop-panel.ts`: host/join/resume/leave controls
- `server/coop-api.ts`: HTTP boundary, authentication, same-origin checks, request-size cap, lifecycle
- `server/coop-validation.ts`: explicit action and pose allowlist
- `server/coop-authority.ts`: world, player, movement, combo, and encounter authority
- `server/coop-vertical.ts`: pinned, bounded 60 Hz jumping, gravity, support, ceilings, stance and receipts
- `server/coop-store.ts`: prepared D1 statements and atomic compare-and-swap
- `db/schema.ts`, `drizzle/`: generated schema-only migrations

The supported Sites route is a Cloudflare-compatible Worker plus logical D1 binding `DB`. The manifest must not retain `static`, because Sites rejects static-only builds with runtime bindings or migrations. No Durable Object or WebSocket binding is assumed. The Worker bundles an explicit bounded asset table generated from dist/client. It serves exact public asset paths with content types, cache policy and ETags; it does not assume an ASSETS binding. Local built-Worker tests verify root, model-review and dependent asset responses. Native deployment and real signed-in hosted behavior remain separate checks.

## Reliable state and bounded work

Each successful sync advances the player's monotonically increasing sequence. Retrying that sequence is a no-op, even if the first response was lost. A sequence gap requires reconnection. Each room update reads its revision, computes a transition, validates the resulting world ledger, and conditionally writes `WHERE revision = previous`; conflicting writers retry against the latest state. This prevents concurrent pickups, resource spending, construction, and reward claims from double-applying.

All lifecycle timestamps are floored by committed room/player clocks, and production time is read again on each CAS retry. Older requests cannot rewind simulation, movement budgets, presence, snapshot time or rate-limit windows. Leave and close require the current browser lease, so a stale tab cannot pause or close its replacement.

Clients cannot send a world replacement after creation, damage amounts, kills, simulation time, or another player's position. Attack presses enter the existing server-side combo timeline. Range, facing, walls, stamina, phase timing, and target health determine actual hits. Dynamic encounter state is shared. Each occupied zone steps against the same prior encounter clock, and its enemies are merged once; extra players or occupied zones cannot multiply elapsed time.

Movement is speed-bounded by elapsed server time, world-bounded, and checked with a conservative full standing/crouched actor-volume sweep. Low pipes, walls, radius clearance and overhead beams are included; standing up is prevented beneath a low ceiling. Connected-world buildings, bridges, foundations, infrastructure, every visible wilderness tree trunk and rock, the pump, player machines and zone geometry come from shared catalogs. Both saved generations use the same deterministic wilderness identities and exact rock convex vertices as rendering and local physics. There is no per-packet movement bonus. Horizontal routes are sampled at bounded intervals for terrain support, 45-degree climbs, .35 m steps and .3 m ground snap.

Online jumping is now authoritative. A reliable `jump-press` edge supplies only a bounded intent identifier. The server owns feet height, vertical velocity, grounded state, coyote time, the short input buffer, landing, ceilings and raised support. It uses the pinned campaign launch speed (6.6 m/s), gravity (18 m/s²), terminal speed (30 m/s), .32 m body radius and standing/crouched body heights (2.16/1.06 m). Client y/grounded fields are retained for old-client compatibility but are ignored for authority. Forging height cannot create flight or evade damage. Properly timed real jumps can cross low solids and evade the low part of a sentry strike.

Vertical motion, encounters and staff combat are interleaved on the same 60 Hz room clock. A coarse HTTP poll cannot treat an entire strike window as if the player had remained at the jump apex. More players or occupied zones do not multiply time. One update accepts at most one second of simulation plus the previous fractional remainder; it does not perform offline catch-up.

This remains a bounded CPU motion model, not remote Rapier. Swept boxes are conservative around rounded capsule corners, and horizontal motion is sampled from speed-bounded requests rather than a full server velocity motor. Wilderness rock motion uses a tight capsule-expanded convex hull, including sloping support and ceilings; empty rock bounding-box corners and canopy space remain open. Exact convex line tests also protect staff contacts, guard sight and sentry navigation. Capsule expansion at polyhedron edges remains conservative; the server does not run remote Rapier. Old saved actors overlapping newly solid wilderness receive a one-time deterministic nearby-ground recovery using the local worker's bounded radial search; safe positions and motion are preserved, and client coordinates cannot select the recovery. Zone exits, emergency recall and lease reacquisition recheck their trusted destination even after the room migration marker is present. The production client still uses Rapier for presentation between authoritative corrections. Representative flat-ground, standing-ceiling and crouched-ceiling comparisons against the actual production Rapier worker pass within 4 cm; that is not a proof of equivalence for every shape or network condition.

### Jump receipt and reconciliation API

Call `client.jump()` once per fresh input edge. It returns an intent ID or null when input is unavailable. `client.pendingJumpIntent` remains set through an unrelated in-flight snapshot. The next authoritative motion echoes `lastJumpIntent` and `jumpStatus` (`launched`, `queued`, or `rejected`), including rejection when dead or the host is away. Exact request replay and repetition of the latest processed intent do not relaunch. The public motion contains `feetY`, `vy`, `grounded`, `crouched`, `jumpId`, `landingId`, and `jumpQueued`; peers carry the same authoritative motion. Use the snapshot revision to reject stale corrections.

Feet height is absolute at the snapshot's player coordinates. If retaining predicted horizontal coordinates, check local ground and ceiling compatibility; otherwise correct position with motion. The integration launches co-op jumps from the accepted server impulse and then lets local Rapier continue between snapshots. No raw held jump input independently authorizes a co-op hop.

Requests are same-origin JSON, at most 192 KiB, with at most eight actions each. Each signed-in identity has a persistent limit of 90 writes per ten-second window. Normal polling is about four per second; urgent jump edges may increase this, bounded to eight sync starts per second by the browser. Invite codes contain 80 random bits and expire after 24 hours. There is no global room browser. The owner can retain up to twenty co-op save slots. Co-op saves remain durable after closing a room; reopening a closed or expired room rotates its invite code.

## Disconnect and rollback

After eight seconds without the host, world progression and guest actions pause. There is no silent host migration. The host can reconnect to the saved room. Existing members may reclaim their own browser lease after reload; only the host can reopen a closed/expired save. Disconnected guest slots are reserved for one minute; explicit leaving frees a guest slot. Old browser sessions are rejected after rejoining. `setSuspended(true)` stops scheduling heartbeats when hidden or blurred, clears unsent movement/actions, and retains the exact in-flight request for safe retry after visibility returns. On transport failure, new actions pause, while the exact in-flight operation is safely retried with bounded backoff. Background/blur suspends browser polling, clears unsent input and retains only the exact pending operation; visible focus resumes safely. Existing authenticated guests can resume their own lease after the seed-safe page bootstrap; only the owner may reopen or rotate a saved room. Returning to solo restores the integrator's captured solo state; no co-op snapshot is saved through `storeSession`.

Airborne height and velocity freeze when the room is paused and resume without an automatic extra impulse. Buffered jump intent is cleared on lease reacquisition; death, recall and zone changes reset vertical state. Older saved room JSON lazily receives safe grounded motion from trusted world geometry; old cosmetic height is not imported. No D1 schema migration is required for these motion fields.

The local source and the previous hosted version remain the rollback path. D1 migration history is append-only after deployment; reverting frontend code must not delete the co-op tables or rewrite an applied migration.

## Tests

Run `node --experimental-strip-types --test tests/coop-http.test.ts tests/coop-movement.test.ts tests/coop-vertical.test.ts`.

These tests start a real loopback HTTP server with real SQLite using the generated SQL migration and four independent client identities. They cover the player cap; room/identity isolation; concurrent pickup and build deduplication; replay; close/resume; reconnect leases; private data omission; malformed inputs; raw-kill/time rejection; origin and body-size limits; packet-flood movement; rate limits; monotonic clocks under forced CAS conflict; one simulation clock across clients and zones; four-player shared combat; and retry after a successfully committed response is lost. Jump coverage includes four simultaneous flights, height spoofing, low-solid traversal, timed strike evasion, apex/landing, ceilings/crouch, slope/ledge support, death, pause/resume, zone reset, old-room compatibility and in-flight receipt ordering.

The test fixture supplies identities only inside tests. Production has no test-auth switch. These are real transport/protocol tests, not proof of internet latency, a four-person device playtest, or permission for other accounts to access the owner-private Site. Final deployment must separately verify a successful hosted Worker, D1 migrations, asset loading, and an authenticated owner room round trip.

## Integration checklist

1. Create a `CoopClient` and feed its snapshots into the current gameplay renderer
2. Capture solo state before entering; do not call campaign save/seed-import/lab mutations while co-op is active
3. Submit normal actions as `client.send(action)`, attack edges as `attack-press` / `attack-cancel`, fresh jump edges as `client.jump()`, and predicted pose through `client.move(pose)`
4. Do not independently apply local tick, resource, reward, damage, or kill mutations in co-op
5. Render the authoritative encounters and shared enemy HP, and render/interpolate peers in the same zone
6. Reconcile server position corrections; permit personal dungeon/cave transitions without moving other players
7. Restore the captured solo state on `onLeave`
8. Preserve the existing Site audience during publication and state its access limitation honestly

### Shared field ecology

Generation-2 rooms initialize the optional garden pack once, starting its own clock at zero. Present malformed packs are rejected instead of being reset. Climate/soil progression uses the shared alive-world clock, including when players occupy different zones. All five command shapes are exact allowlisted; clients send no growth, water volumes, goods counts or HP deltas. Commands carry a shared accepted-command revision, which simulation ticks do not increment. Losing CAS attempts and stale commands recheck current stock and cannot spend a canister, harvest a crop, mix goods or consume a gel twice. Shared gel repairs only the requesting living player's actual missing suit integrity, including underground; it cannot heal another player, exceed 100, resurrect, or be consumed at full health. Field planting, watering, harvest and mixing require actual valley-bed reach. The online panel continues refreshing while the world runs.

### Timed resonant guard

Guard adds a reliable bounded intent/cancel and an optional validated per-player room state. It shares the existing combo stamina and fixed server clock. Only one real eligible front sentry contact can be intercepted; invalid or late/side contacts keep their damage. Cost/cooldown survive cancellation, session replacement and room/zone lifecycle. No client protection/damage/clock/recipe claim is accepted. Old room records initialize an absent empty guard, while malformed present state is rejected. No D1 migration is added. Rendered fields project a confirmed cast and expire between polls; network transit remains unknown, and pixels never resolve protection. See RESONANT-GUARD.md.

### Finite shared wilderness resources

`gather-wilderness` accepts only a feature ID. The server requires a living, grounded, non-crouched actor with an idle staff and no active guard commitment. Reach and clear sight are measured from the accepted server feet height to the actual solid surface. Browser inventory amounts, height claims and duplicate IDs cannot award resources. The optional wilderness ledger remains absent in pristine older saves and validates finite harvested IDs against the saved generation and seed. Shared CAS commits grant one wood for a tree's deadwood or one stone for a harvestable rock exactly once, including simultaneous claims and retries. Gathering leaves trunks and larger rocks solid; depleted small field stones disappear from collision and rendering. These materials remain separate from salvage and machine recipes.

A real server-accepted active staff stage can add wilderness contact IDs to its existing combo hit receipts once per feature. These receipts drive physical feedback only; staff swings grant no materials. Wilderness is not an auto-attack target. `tests/wilderness-coop.test.ts` checks both generations through real HTTP/SQLite, blocked straight movement and valid routes around, fake-height rejection, rock support and corner clearance, concurrent gathering, depletion, authoritative staff receipts and old-room recovery.
