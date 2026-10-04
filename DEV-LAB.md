# Developer lab controls update

Menu → Advanced tools → Developer lab now groups Practice, Tune, World systems, Inspect and Reports. Start with a station or the live sentry, use bounded sliders/numbers, Apply a draft, then Reset & practice. Half/double sentry damage and low-gravity drafts make comparison quick. Player staff damage and stamina cost are wired to the actual combat path. There are 21 bounded controls, plus existing equipment and world-scenario configuration.

The Reports tab exports a strict portable preset or a diagnostic report with applied setup, build, seed, intended versus actual scenario and available evidence. Copy has a selectable-text fallback. Imports only stage a draft and never open or overwrite a world. Renown/materials have no arbitrary multiplier, and there is no XP system. Regional world cards open disposable model tests rather than a playable terrain sandbox. Browser rendering and physical-device ergonomics remain unverified.

See [Developer exposure standard](DEVELOPER-EXPOSURE.md) for the mandatory future-feature checklist, coverage and limits. The historical implementation notes below describe the underlying isolation and measurement contracts; the new explicit draft/Apply workflow supersedes immediate slider application and v1 device presets.

# Developer lab and character/combat pass

The baseline release adds a bounded, playable developer course to Settings → Developer lab. It does not change world schema 6, either generation manifest, the causal manifest, the dependency pins or campaign rewards. Animation quality is an iteration target; no console/platformer parity or physical-phone approval is claimed.

## Use on your own device

1. Open Settings → Developer lab → Enter isolated lab. Entry is disabled during a zone transition. The current world and pose are captured before the course opens.
2. Choose a station and Reset & practice. The same four action slots remain in place. Y/F attacks; B/C crouches/slides; A/Space jumps. A practice-only auto-chain option, infinite stamina and indestructible dummy are available under Sandbox-only aids.
3. Adjust the bounded sliders while paused, then return to the course to feel the result. Reset defaults restores the release baseline. Save device preset writes only the lab preset, explicitly; Load is explicit too. Lab values never apply to campaign physics/combat.
4. Run one, three or five copies of the full nine-scenario suite. Each case rebuilds the same Rapier world and resets pose, inputs, combo, targets and camera. One second / 60 simulation steps of warmup is excluded per case. The physics worker owns the input script, so render stalls or queued worker messages cannot extend a movement segment.
5. Review the actual checks, then do the separate visual checklist. Export JSON preserves the workload, settings, capabilities, measured checks, frame statistics and your own visual ratings. Returning to Settings later retains the current report in memory.
6. Return to campaign restores the original seed/zone, exact campaign state, actor progress, inventory, combat state, camera, character pose and vertical momentum. Control is held until a new worker capture confirms the restored physical position/stance/momentum. The report records campaign-byte invariance separately from the acknowledged physics comparison.

Closing an entry prompt, navigating away, focus loss or backgrounding cancels its capture token. Late replies cannot open the lab. Leaving during a pending lab reset is safe: monotonically increasing zone epochs discard stale snapshots. During a run, menus, blur, page hiding, resize or leaving interrupt measurement, cancel the worker playback and retain only completed case evidence. Returning to practice cannot resume an abandoned script. Partial/absent checks are not invented as passes.

## What is measured

Nine actual runtime cases: accelerate/brake; reverse direction; ballistic jump/landing; jump into a solid ceiling; momentum slide into a low passage and blocked standing; complete 1–2–3 combo against a 100 HP dummy; out-of-range whiffs; solid-wall rejection; and deliberate early cancel/stun injection.

The checks consume real fixed-step worker snapshots and accepted combat events. They include numeric expectations and observed values. Changed tuning can legitimately fail a release-baseline criterion, especially traversal timing. An automatic `PASS` concerns its explicit numerical assertion, not visual quality.

Separate disposable-model checks execute deterministic valley/dungeon planning, different-seed terrain variation, validated save round trips, exactly-once collection and causal replay. They never run actions on the current campaign. Seed repeatability includes the normal production plan cache; the broader clean-generation test suite remains separate.

Frame statistics use uncapped elapsed time between actual render callbacks after warmup: p50/p95/p99/max in milliseconds, sample count and count above 33.3 ms. Empty samples produce `null`, not a guessed FPS. This is a small isolated-arena CPU/render-callback workload. It is not GPU query timing, memory profiling, full-valley performance, a phone result, or a guarantee of 60 FPS. Backend, viewport, pixel ratio, presentation and touch capability are recorded for comparison. A non-rendering Node test never populates a device report.

Manual review remains “Not reviewed” until the user explicitly rates it. Each station says what to watch: planted feet, weight shift, turn/brake response, launch/tuck/landing, ceiling/staff envelope, slide-to-crawl, readability of windup/contact/recovery and interruption. Try portrait and landscape; movement plus independent action and camera touches still need real-device inspection.

## Campaign isolation

The campaign State object is retained, and its reducer ticks, interaction/build/causal mutations, seed switching, imports and storage writer are gated throughout lab use. Lab targets and aids live outside campaign data. Enter/exit do not overwrite a campaign save or award materials, renown, jobs or tombstones. A page reload during the lab returns to the last normal campaign save, as disclosed in the UI; it cannot recover unsaved in-memory movement from a closed page.

Rapier checkpoints include feet position, vertical momentum, stance, grounded state and movement timers. Restoring a low pose primes collision queries before any attempt to stand, preventing the initial broad-phase gap from placing the capsule inside a roof. Input edges are cleared through menus to avoid stuck fingers or a queued surprise jump. Obsolete worker epochs cannot alter the restored campaign. The finite-state capture/restore protocol is not a general save format.

## Staff combat

The survey staff projects a short-range front-sector energy strike beyond its physical shaft. Three authored actions have different anticipation, active and recovery intervals:

- Opening sweep: 0.16 / 0.12 / 0.26 s, 24 damage, 14 stamina, 2.85 m reach
- Reverse sweep: 0.20 / 0.14 / 0.28 s, 32 damage, 17 stamina, 3.00 m reach
- Driving finisher: 0.30 / 0.16 / 0.42 s, 48 damage, 25 stamina, 3.40 m reach

The default late buffer is 0.30 s and idle stamina regenerates at 24/s after the 0.65 s delay. Only one follow-up can be buffered; cost is charged at the actual stage start. Every attack completes recovery before chaining. Missing still costs stamina. An active attack latches its timing, so changing a lab slider cannot skip committed recovery. Manual and auto attack enter exactly the same request/resolve path. Auto is optional for touch campaign play; desktop remains manual. Practice can opt into it separately.

Gameplay aim is fixed-step state, independent of the renderer. Active hits test authoritative player/target positions, vertical separation, full front arc and the same solid obstacle boxes used for traversal. Targets receive at most one contact per attack ID. A full default combo does 104 damage to a fresh 100 HP sentry. Partial sentry HP is transient and resets on load/zone reconstruction; only defeat invokes the existing guarded world reducer and its persistent causal/tombstone consequences. No schema migration or enemy loot change is needed.

Jump and the first authoritative crouch-transition sample may cancel early windup or late recovery. An accepted cancellation retains a lock through the old recovery deadline; an active-phase interruption cannot turn stance into death and bypass that deadline. Low/airborne posture suppresses target eligibility without rewriting the player’s HP. The deliberate lab stun clears the queue; this release does not claim a new campaign enemy attack/stun AI.

Visual impact hold freezes only the rendered pose, never physics, combat time, menus or input. Camera shake and hold are bounded and disabled by Reduced motion. Sentry/dummy recoil is a cosmetic displacement envelope, not a new dynamic rigid-body knockback system. The glowing active sector uses the combat definition’s exact range and arc. Two-bone dominant-hand IK retains a real grip on the staff during its torso-relative sweep.

## Character motion

The distance-driven planted gait and low-clearance rig are retained. Added controls cover speed, acceleration, braking, direction reversal, air control, yaw response, slide duration/drag, launch velocity and gravity. The rig adds braking compression/braced feet, velocity-independent turn lean, launch extension into airborne tuck, distinct weighted staff preparation/contact/recovery and collision-aligned low traversal. Camera follow and bounded velocity lead smooth abrupt changes. Root/collider translation remains worker-owned; posing never moves gameplay collision.

## Verification boundary

Automated coverage includes the production runtime handlers, three exact reset repeats of all nine real-Rapier scenarios, delayed-ready and 40-snapshot backlog equivalence, playback cancellation/manual resumption, airborne and low-ceiling restore, epoch rejection, capture cancellation/stale replies, save-write isolation, campaign state restoration, combo lifecycle/stamina/mash/cancel/stun/occlusion, numeric grip/sector/envelope checks, and the complete previous generation/causal/input/save suite.

Browser rendering, WebGPU/WebGL2 execution, visual approval, actual touch ergonomics and measured device performance remain unverified in this environment. The previously restricted live Site navigation was not retried through an alternative route. The in-game lab provides real-device measurements when the user runs it; no fabricated benchmark is bundled.

## Modular equipment follow-on

The lab now offers a separate seeded practice loadout and matched A/B combat-model comparison through its Equipment workbench. Practice equipment never changes campaign materials. The full nine-scenario suite explicitly resets the practice loadout to the unchanged survey-staff baseline and records that identity in its capabilities. See [MODULAR-EQUIPMENT.md](MODULAR-EQUIPMENT.md); model comparisons do not populate frame/device measurements.

## Wilderness collision probes

The separate “Run isolated solid probes” button starts a disposable production physics worker, using the selected 1/3/5 repeat count across small/large trees and stones from both saved generations. It records actual capsule clearance, grounding and lateral traversal, without changing campaign state or the original nine-case course. The JSON export carries the source revision; cancelled/error runs stay incomplete. “Show wilderness solid outlines” reveals the matching trunk and convex-stone hulls in the valley. See [WILDERNESS.md](WILDERNESS.md). These numerical probes do not grant browser or physical-device visual approval.

## Streamed regional frontier

Regional saves add a Settings-only chunk/speed report, a separate real-worker walk/jog/run/sprint calibration, a source-backed report export and safe solo survey destinations. See [STREAMED-FRONTIER.md](STREAMED-FRONTIER.md) for scale, actual measured journeys, persistence and verification limits. The campaign remains unchanged by calibration; survey travel changes its player position and is excluded from walking telemetry.
