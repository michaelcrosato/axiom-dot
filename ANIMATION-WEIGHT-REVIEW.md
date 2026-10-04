# Player animation weight and support review

This revision applies the supported movement approach to ordinary locomotion, low traversal, jump/landing, staff combat, guard and work gestures. The approved 4.2-second mantle's authority path and support choreography are unchanged.

## Concrete corrections

- Planted feet and crawl palms retain serialized world-space anchors across acceleration, braking and turns. A foot releases into a lifted recovery before overreach or excessive twist. Changes of stride no longer drag a labeled planted limb.
- Walk/run/sprint/crawl use separate contact duty and stride. At 2 m/s walking cadence is about 3.23 steps/s, at 6 m/s running 4.5, and at 8 m/s sprinting 5. The former 6 m/s timing produced 9 steps/s. Ground-relative swing recovery has continuous contact velocity. Footstep sound cues follow support acquisition instead of retaining an independent distance clock.
- Push/pull keeps its moving foot supports, a shorter toe-safe stance and backward gait when pulling. Previously the hand-contact overlay replaced the moving legs with a fixed root-relative stagger.
- Jump keeps horizontal momentum instead of manufacturing a braking impulse. Falling off a ledge does not trigger the jump launch gesture. Descending legs extend toward their upcoming support before impact. Solo landing compression uses measured impact speed; grounded display height meets the authoritative support instead of lerping above it.
- Crawl knees use outward/upward poles, preventing a rear planted ankle from driving the knee and shin through the floor. Palms reach down during the stance transition and lock only once the low stance can support them.
- Staff attacks acquire/release the support hand continuously, keep loaded hands on real grip sockets, and transmit a little rotation and compression through the pelvis while preserving ankle targets. The generated staff's prior approximately 62 cm entry/exit jump and the survey staff's approximately 70 cm support-hand switch are removed.
- Generated staff travel stowing is continuous through the old speed threshold: the dominant hand carries the shaft, docks it, then releases. Combat retrieves a stowed shaft before moving it and docks it before releasing it during recovery.
- Guard has a grounded body/staff brace on the accepted guard timeline, including a short block response. Online display time expires that response between snapshots without advancing authority or predicting a block.
- Gather/repair gestures now prepare, reach, retain a short working beat and return. Repair adds a small bounded working stroke. They remain generic gestures: gameplay does not yet provide a specific work-surface anchor to these clips.

The physical motor, collider movement, jump timing, contact permissions, attack hit windows, guard interception rules, resource ledgers, save schema, generation pins and approved mantle support path are unchanged.

## Reproducible numerical evidence

Run `npm test`, `npm run typecheck`, and `npm run build`.

Run `node --experimental-strip-types scripts/measure-animation-weight.mts /tmp/axiom-animation-weight.json` for the compact report. Add `--trace` to retain each worker snapshot and the corresponding actual rig transforms. These are numerical records, not rendered frames.

The nine isolated 60 Hz worker clips contain 1,900 frames: run/brake, wall contact, push, pull, mantle, walk/accelerate/turn/stop, jump/land, crouch/crawl/stand and run/slide/recover. Tests use the real Rapier worker, production animation reducer and production avatar. Retained support positions, limb lengths, IK reach, floor/ceiling envelopes, full equipment geometry, frame transitions and mantle entry/exit are checked. Combat tests additionally replay the actual complete 60 Hz three-stage timeline for the survey staff and all eight generated assemblies, and cross travel-speed thresholds during partial prep/recovery/guard.

## Manual visual checklist

Open `visual-review.html?subject=animation` to play, scrub and frame-step those clips. Use the humanoid subject for the existing work/combat poses, the guard subject for actual accepted guard/sentry outcomes, and the in-game disposable Developer lab for continuous combat and interrupted/repeated controls.

1. Front, side and rear three-quarter views: planted soles stay fixed, hips pass over the supports, and the unloaded foot recovers without a knee flip
2. Acceleration and stops: cadence changes smoothly, braking absorbs momentum, and the last support does not drift during settling
3. Turns and reverse pulling: unloaded feet reorient, planted feet do not swivel under the body, and crate effort matches actual movement
4. Jump: launch extends, flight keeps horizontal momentum, descent prepares the legs, and a harder impact compresses more without a floating landing
5. Crawl/slide: knees, palms, boots, head and packed staff clear the ground/ceiling; standing releases the palms smoothly
6. Staff: watch the dominant hand throughout pickup and stow, support-hand acquisition, preparatory torque, active beat, follow-through and recovery; repeat while crossing walking/running speed
7. Guard: body and staff prepare before protection, brace on a real block and settle through recovery; interruption never grants extra protection
8. Work: preparation, reach, working beat and return are readable without foot drift; do not interpret generic hands as verified object contact
9. Recheck the approved mantle's last supported stand into ordinary idle, plus canceled/obstructed movement and gear changes

Browser execution was blocked in this environment. No screenshots or rendered appearance were reviewed, and none of these tests constitutes visual approval. Flat inspection fixtures do not certify arbitrary terrain contacts, live internet play, touch ergonomics or device performance. Immediate gameplay jumps intentionally retain their existing launch timing rather than adding a pre-jump delay. Oblique/close wall bracing and all interrupted low-stance/stow transitions still need the manual views above.
