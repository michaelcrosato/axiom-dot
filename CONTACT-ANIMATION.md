# Player contact and isolated animation inspection

The player uses the production Rapier worker and the same procedural rig in both gameplay and inspection. No additional character model, image-only animation, or campaign simulation is loaded by the isolated inspector.

## Isolated review

Open `/visual-review.html?subject=animation`. Select an animation clip, then play/pause, move the timeline, step one 60 Hz frame backwards/forwards, reset, repeat, or change playback speed. Changing camera/equipment redraws the same immutable simulation frame. Physics is precomputed in a tiny disposable world with an explicit fixed clock; seeking never advances or changes a campaign. Existing humanoid, quadruped, cave, ecology, and guard fixed views remain available.

The five production-physics clips cover run/brake, wall/release, push, pull, and ledge catch/climb. Pose reports include simulation tick/time, input, actual desired/resolved motion, collision/contact evidence, movable body centres, joint transforms and hand-anchor error. Actual PNGs and contact sheets require a functioning WebGPU/WebGL2 renderer. Reports identify their source and do not certify rendered appearance, full-world performance, mobile controls, or network play. Numeric exports remain useful when the renderer is unavailable.

## Solo gameplay

In a connected valley, a survey crate and gold-edged loading ledge sit just west of camp, outside the waterworks construction grid. The same verified ledge probes can catch other suitably clear, solid ledges.

- X / E: grip a nearby reachable crate; tap again to release
- Move toward/away while gripping: bounded push/pull along the contacted face normal
- Jump toward a ledge and tap X / E: attempt a catch in a short deliberate window
- While hanging: a fresh Jump starts a preflighted, supported mantle; Crouch or X / E drops
- Walking into a solid surface: grounded collision resistance drives a small weight shift and only reachable, ray-confirmed palms

Grip and ledge movement are worker-owned. Both the player and crate sweep against real colliders; all crate support corners must remain on near-level ground. Climb checks every loaded palm, knee and boot against the same real support collider, and sweeps the compact body and torso/head envelopes through the complete mantle. The root stays at the same physical datum while the collider shortens, crosses the edge, and grows into the final standing pose. No hand target grants movement through geometry. Staff/guard actions are unavailable while hands are committed. Menus pause motion, damage releases the contact, and lab entry requires releasing the crate or completing the ledge move first.

The existing four action slots stay fixed. Jump/Crouch remain independent held controls. The X label changes in place for Grip, Release, Reach, and Let go.

## Persistence and shared-room limits

The optional versioned `traversal` save field contains only the survey crate position. Existing saves remain valid and retain all inventory, collected/defeated IDs, water, economy, ecology, causal history and progression. Before the first save containing the new field, the last compatible exact save bytes are retained in a separate immutable pre-contact checkpoint, exportable from Settings. Lab fixtures never update this field.

Grip, movable props and ledge movement are explicitly solo-only. Shared rooms continue using their existing server-authoritative jump/capsule rules; local collision feedback does not authorize new online movement, object motion, or peer animation. Online parity would require separate authoritative shared-object ownership, traversal state, replication and reconnect semantics and is not claimed here.

## Verification scope

Automated tests use actual Rapier WASM, production worker messages and Three.js world joint matrices. They verify bounded motion, collision/support, release, stale messages, disabled online interaction, repeatable inspector snapshots, save preservation, and integration with existing controls/lab behavior. They are numeric and source-level tests, not visual approval. The agent browser's local preview route was blocked; that denial was not retried or bypassed. Final rendered pixels and real-device ergonomics still require inspection using the PNG tools or a human browser.


## V25 supported mantle correction

The former upward lift followed by horizontal travel has been replaced with a 252-tick (4.2-second) shared worker/rig trajectory. The leading palm repositions first; the trailing palm follows while the leading side carries the load. The torso then comes over the edge, the leading knee plants, the trailing boot lands, and weight transfers to both boots before standing. The knee stays fixed while the pelvis follows the actual 0.45 m thigh arc. Each replant has explicit loaded/unloaded metadata; hands no longer disappear merely because the old vertical path moved the shoulders out of reach.

The rig uses stable lateral elbow poles and forward knee planes. Exact segment lengths are retained, and all intended hand and boot positions are reachable in the default clip. The final body pose matches ordinary idle. Capsule size changes preserve the `body.y − 1.09` render-root datum during traversal. Cancellation releases into the real compact motor, with ground-supported, swept height recovery. Re-pressing Crouch during that recovery lowers it again. Emergency release uses the existing fall/crouch pose rather than a newly authored slip animation.

Open `/visual-review.html?subject=animation&clip=ledge-climb`. The 320-frame inspection clip includes the approach, the full mantle and settled idle. The timeline reports the current phase and loaded supports. Its JSON exports retain the actual contact state, including the fixed knee and boot targets. PNG and contact-sheet exports still require a successful real renderer; no image has been fabricated as evidence.

V25 verification: all 682 tests, strict TypeScript and production build pass. The 27 added tests cover actual worker support order, constant loaded anchors, exact rig reach and segment lengths, frame-to-frame joint continuity, body/capsule clearance, rotated and differently elevated ledges, narrow lips, pause/resume, obstacle/support changes, and complete cancellation recovery. Independent code/physics/schema review found no remaining P1/P2 issues after fixes. Successful-climb measurements in the default fixture: maximum upward root speed 2.175 m/s, maximum elbow travel 3.729 cm per 60 Hz frame, zero unreachable hand/boot targets, and zero mesh vertices penetrating the ledge beyond the existing 2 cm contact skin in all three equipment variants.

These are numerical bounds, not a claim that the animation looks natural. The earlier browser access denial remains in force, and no alternate browser route was used. Rendered appearance and the user's assessment remain the visual acceptance gate.

Reproduce a full production worker/rig trace with `node --experimental-strip-types scripts/measure-ledge-mantle.mts /tmp/axiom-mantle-trace.json`. This export contains numeric matrices and contacts only, not rendered pixels.
