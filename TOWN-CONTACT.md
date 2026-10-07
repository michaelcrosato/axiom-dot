# Local town layout and contact extension

This local change is not published. It extends the solo Rapier contact controller and adds an explicitly versioned new-world town layout. Shared prop/traversal authority remains gated off.

## Player instructions

Menu → Controls explains the keyboard and touch bindings. Keyboard: WASD/arrows move, Space jumps, E uses the contextual action, C crouches/drops. Touch: left movement area and the fixed X action, A Jump and B Crouch buttons. There is no gamepad adapter or gamepad acceptance claim.

New regional worlds include three seeded rear work yards beyond the southern houses. Follow the central north/south lane through the gap in the homes, then the rear access markings. Their parcel names describe salvage sorting, market packing and trail loading. Each has a movable 1.10 m crate, a 0.30 m step and a 2.40 m loading ledge. Crates remain within their marked rear parcel: they cannot be hauled onto resident streets or into doors/services. Pushing against that limit stops real motion.

Approach a crate from the side, tap E/X, then move toward it to push or away to pull. Tap again to release. Back a pace before jumping toward its top; release horizontal movement once above it to land. Walking off uses the normal gravity/landing controller. The short step supports automatic step-up and step-down. For a supported hand-climb, grip the crate at close range and press Jump. Both hands, head clearance and both landing feet must be valid. From the top, stand about 0.45 m inside the edge, move outward and tap E/X to climb down to the supported floor. The 1.10 m yard crates support hand-climb/down. The taller legacy 1.30 m survey crate supports push/pull and jumping; release it before jumping. Its hand-climb is deliberately blocked because the current authored motion does not clear its edge. Off-center or obstructed attempts are refused; release and reposition.

Jump toward a tall ledge and tap E/X during the approach. Catch requires paired hand support and a clear full mantle path. Releasing the action button keeps the hang; this is a toggle interaction. Release Jump, then press it again to pull up. Tap action again or Crouch to drop. From the top, stand about 0.45 m inside an edge, move toward the edge and tap the “Climb down” action. The alignment window is narrow (6 cm around the supported trajectory); failed attempts do not snap the player into place. Lowering reverses the supported hand/knee/boot trajectory and ends hanging. Use action/Crouch to drop the remaining distance or a fresh Jump to climb again. Path obstruction or explicit interruption releases into the actual collision controller.

Props, ledge catch and lowering remain **solo only**. Shared rooms retain their existing server movement/jump rules. No new shared prop ownership, replication or retries are claimed.

## Developer course and evidence

Menu → Advanced → Developer lab. Enter the isolated lab first, reopen Tune/report, then choose **Reset & practice contact course**. The fixed course has a short step, crate, clear tall ledge, overhead-blocked ledge and backing wall. It uses the real worker/controller and normal controls. Existing staged movement tuning applies to the worker; Apply, defaults and preset handling stay in the existing lab registry. Geometry dimensions and contact timing remain fixed supported contracts, not cosmetic sliders.

Reopen the lab for the last worker contact diagnostic, reset and **Prepare contact evidence text**. The read-only text export contains source/build, seed, actual fixture, current settings and up to 3,600 worker snapshots; each frame records its own applied tuning and epoch. Reset clears the trace. It contains no room credentials or campaign snapshot. After the cap it retains the bounded prefix rather than claiming an ongoing recording. Return to campaign restores the existing captured campaign and physical pose; normal saves stay locked throughout practice. Reload returns to the last normal checkpoint.

## Ownership and compatibility

`ContactPhysics` owns achieved crate movement and forward/reverse mantle contacts. Every reverse step sweeps the compact capsule and torso/head envelopes and verifies loaded support on the same collider. Existing cancellation recovery and jump input edges remain. Streamed contact policy rejects player/crate proposals intersecting other authoritative actors/residents. This is an obstruction gate, not dynamic resident routing.

`TraversalState` v1 retains the exact legacy survey-crate contract. Optional v2 additionally saves three yard crate positions. Only explicit **new regional worlds** create v2. Existing saves/imports are not upgraded or given new occupied geometry. v2 import checks parcel bounds, floor height, known body identities/dimensions and static yard solid overlap. Movement uses the same parcel constraint; streaming dormancy remains. Resident IDs, household/home and shop indices, finite trade ledgers and public service coordinates remain unchanged. New-world revision 3 changes parcel coordinates and routes; old saves still resolve revision 2. New yards lie beyond the resident navigation/work/egress area.

Fresh regional slots use town layout revision 3: bending residential loops, varied frontage/setbacks, a market spine and garden cross-links. Existing occupied worlds remain on their saved geometry. See [TOWN-LAYOUT.md](TOWN-LAYOUT.md) for explicit identity, road routing, save-slot separation and developer recipe controls.

## Validation boundary

Final continuation evidence is under `evidence/town-organic`; `evidence/town-contact` preserves the earlier partial milestone. Exact results are recorded there; historical documents are not acceptance for this change. Numerical tests exercise source and emitted worker movement, low-crate ascent/descent and tall reverse-mantle rig meshes/anchors, interrupted descent, occupied landing, paired movement blocked by another actor, moved saves, malformed imports, parcel separation and production main course lifecycle. Existing permitted suites cover variable-FPS resident movement and co-op stale/retry handling. They do not establish online traversal parity.

Browser QA and registry routes remain blocked and were not retried. No pixels, device ergonomics, performance, aesthetic acceptance or actual gamepad support are certified. The 13 held regional test files and regional food coupling are untouched. No commit, push, PR, deployment, Site or publication action is part of this local task.
