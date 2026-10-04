# Disposable live-sentry practice

This increment adds one interactive practice authority outside the nine measured `LAB_CASES`, integrated into the developer lab on the generation-worker checkpoint. It does not alter course physics, create campaign data or certify rendered quality. The isolated controller was first tested against `dd54e18a72854f0651a6070c41b61f5e60b79781`; the main integration builds on `f6d1fea5739bf8ccefad78e02f50fd556d82e33f`.

## Fixed arena and production contracts

- Stable case `live-sentry`, player `(8, 0, 5.5)` facing +Z, sentry `(8, 0, 8)`
- Flat floor, bound 18, exact existing `LAB_OBSTACLES`; existing wall center `(8, 1.5, 9.5)` remains available as cover
- One `createEncounters` enemy. `advanceEncounters` owns pursuit, warning, locked strike direction, one contact per attack, recovery, body-clearance proxy and home leash
- `stepGuard` and `resolveGuardDamage` use the actual enemy contact. No “airborne” immunity flag is introduced: production vertical separation decides whether a low strike connects
- Shared `requestComboAttack`/`stepCombo` own staff phases, stamina, buffering, range/arc/occlusion and one contact per attack ID. Only their freshly issued hit events reach `hitEncounter`
- Guard → encounter contact → production hit-stun → combo ordering matches solo. No physics or combat clock is driven by render time
- Sentry collision output describes the existing kinematic encounter radius. Do not add an invented solid Rapier enemy body or cosmetic recoil to its authoritative target

## Controller integration

`src/live-sentry-practice.ts` exports:

- `createLiveSentryPractice({seed, epoch, tuning?})`: fresh ready state. Seed is uint32; epoch is the physics zone epoch. Optional production equipment/combat tuning is sanitized and copied at create/reset
- `resumeLiveSentryPractice(state, frame)`: arm current authoritative pose without advancing any clock; allowed only from ready/paused
- `stepLiveSentryPractice(state, frame)`: exactly one fixed 1/60-second step
- `requestLiveSentryAttack(state, source?)`, `requestLiveSentryGuard(state, intentId)`, `cancelLiveSentryAction(state, 'jump'|'crouch')`
- `suspendLiveSentryPractice(state, 'menu'|'blur'|'hidden'|'resize')`: freeze clocks and retire buffered staff/guard interception while retaining paid stamina, stun, recovery lock and cooldown
- `disableLiveSentryPractice(state, 'suite'|'exit')`: permanent terminal state for this instance
- `resetLiveSentryPractice(state, {seed,epoch,tuning?})`: only a newer epoch; fresh ready practice data. Disabled instances cannot be reset; create a new instance instead
- `liveSentrySnapshot(state)`: copied render/inspection data, including case ID, seed/bodySeed, tick/worker step, HP, exact enemy, guard/combo, target and authority radius

Frame shape is `{epoch, step, x, z, feetY, facing, grounded, crouched, stance}`. Use the production worker reply, never interpolated Three.js transforms. The worker emits a snapshot for each simulated 60 Hz step; paused replies repeat the previous step. It does not reset its global step on a zone change, so arm the ready instance with the actually observed current step, not an assumed zero.

Result shape is `{state, accepted, reason, comboEvents, guardEvents, encounterEvents, contacts}`. Contact records include blocked status, applied damage, resulting HP and fixed tick. `encounterEvents` filters intercepted hurt just like the production solo adapter; `contacts` retains both intercepted and unblocked actual contact evidence.

1. Enter only after the existing isolated-lab campaign checkpoint is established. Change the lab physics zone to `LIVE_SENTRY_ARENA.player`, flat y=0, bound 18, `LAB_OBSTACLES`, sandbox=true, using a new epoch. Keep normal lab targets empty
2. Create the controller using that epoch and desired immutable equipment/tuning snapshot. Wait for an actual matching-epoch physics frame, then resume/arm it without a simulation step
3. While live practice owns the lab, branch away from normal `tickLab`, `stepCombat`, guard stepping and dummy hit mutation. Route attack/guard/cancel intents here. Project copied combo/guard into existing presentation only
4. Consume result events for audio, hitstop and UI without sending them back to a damage reducer. Damage is already committed. No campaign persist, reward, inventory, tombstone, import or reducer path belongs here
5. Create the production quadruped with snapshot `bodySeed`, then `update(snapshot.enemy)`. Use production guard presentation/audio from the returned guard state/events. Seed identity uses the same `hashSeed('creature:'+seed+':'+enemyId)` contract as campaign rendering
6. Menu/blur/hidden/resize must call suspend and pause the worker. Resuming must arm the latest observed frame. Duplicate/stale frames are inert. A missing step or malformed frame pauses without reconstructing unseen poses; surface its reason and require Resume/Reset
7. Death or enemy defeat freezes the round and rejects further input/resume. Explicit Reset starts new disposable health, enemy, stamina and cooldown state on a fresh zone epoch. Never auto-heal or reset on menu close
8. Disable before automated suite start, static course reset/capture, or lab exit. Discard the live instance before the original nine-case baseline path. The existing campaign capture/restore remains owner-only
9. Unlimited stamina, indestructible dummy and normal static-target auto-chain must not run here. Optional auto intention may call `requestLiveSentryAttack` through the same production gate; it may not directly modify state

No special per-frame renderer polling is needed. The same snapshot may be projected repeatedly without changing combat state. No pending worker reply from an older epoch can damage a freshly reset round.

## Optional bounded diagnostic trace

`src/live-sentry-trace.ts` wraps the same controller without UI or import support:

- `createLiveSentryTrace(options)` returns `{state, trace}`
- `appendLiveSentryTrace(recording, command)` applies the command once and returns `{state, trace, result}`. Do not additionally apply the direct controller function
- Commands: `resume` / `step` with `frame`; `attack` with `source`; `guard` with `intentId`; `cancel`, `suspend`, `disable` with their reason
- `exportLiveSentryTrace(recording)` returns only the finite diagnostic object. Do not export the recording container or a campaign checkpoint
- `replayLiveSentryTrace(trace)` returns the reconstructed prefix state, copied snapshot, and `matchesPrefixFinal`

The diagnostic stores bounded options and an initial snapshot, ordered compact commands, and one prefix-final snapshot. It retains no per-entry full state, unrelated worker fields, campaign data, timestamps, screenshots or performance samples. Stop recording at 3,600 entries or the 1 MiB encoded-export budget. A 64 KiB header reservation bounds options/two snapshots/metadata without serializing the whole prefix every tick. Invalid/non-JSON or oversized command data also terminates the retained prefix. Truncation reason and dropped-command count remain explicit; the live controller continues normally while the last replayable prefix snapshot stays frozen. Add the separately labeled current final snapshot and source revision in the owner’s export wrapper if desired. Explicit Reset must create a fresh recorder.

The replay consumes observed worker poses. It cannot establish that those inputs came from a particular device or certify physics performance, frame timing, online correctness or pixels. There is no UI trace import.

## Verification

- 13 controller tests: exact independent production correspondence; one-contact rule; guard success/failures; jump height and crouch vulnerabilities; actual wall checks; genuine combo defeat; death/reset locks; lifecycle/epoch/gap handling; isolation; copied equipment/view state; seed replay and numeric production quadruped pose
- Actual Node-driven production Rapier worker tests verify correctly timed jump versus late launch, solid-wall traversal rejection, paused duplicate steps, and immediate versus 40-frame batched delivery
- 4 trace tests verify compact JSON roundtrip replay, 3,600-entry truncation with continuing live state, invalid/unbounded command truncation, and encoded export budget
- Both TypeScript configs and the unchanged nine-case / 27-run production orchestration are checked separately
- No browser, live Site, alternate preview route, headless rendering or screenshot workaround was attempted. Numeric mesh and Node/Rapier results are not visual approval

### Checked staging results

- Both TypeScript configurations pass; full exact-base clone suite: 575 passed, 0 failed
- Related controller/guard/combo/encounter/lab verification: 71 passed, including unchanged 27-case production orchestration with immediate and batched delivery
- One `node --experimental-strip-types scripts/measure-live-sentry-trace.mjs` probe on Linux x64 / Node v24.19.0 recorded 3,600 commands (3,599 simulated ticks), 466,240 encoded bytes, and an exactly matching replay. Total wall 183.6 ms; CPU 151.3 ms user + 5.1 ms system. Append p50 0.025 ms, p95 0.058 ms, maximum 13.98 ms. Export took 16.6 ms; replay 42.4 ms
- Probe workload is grounded input outside sentry sensing, intended to bound trace append/copy/encoding allocation. The maximum single-call outlier remains visible; no browser frame budget, phone performance or rendered quality is established

## Integrated desktop route

Enter the isolated lab, reopen **Tune / report**, then choose **Start live sentry practice**. The banner reports practice suit/enemy health, phase, guard and stamina. Move to face the sentry; Q/R only orbit the camera. F uses the controller's current facing, G attempts one timed front interception, and Space uses actual worker jump height. The existing nearby wall is real cover.

**Reset live sentry** starts a new epoch and recording with fresh disposable health/cooldowns/stamina. **Resume** explicitly arms the next actual pose after an interruption. Menu closure resumes a menu pause; blur, resize, hidden or missing-step pauses remain explicit. Physics movement stays paused while the controller is waiting for Resume. A dead suit cannot move or jump but gravity may settle its body. Suit or sentry defeat requires Reset. **Stop · return to course**, a static station reset, the measured suite and lab exit disable the live instance. The original nine stations and their survey-staff measurement baseline remain unchanged.

Equipment and combat tuning are latched at reset. The workbench/tuning handlers refuse changes while a live instance exists; stop it before editing. Unlimited-stamina, invulnerable-static-dummy and auto-chain controls do not affect this authority. Main consumes controller events only for presentation, with empty static targets, so HP and stamina are charged once. Campaign reducer/save/reward paths remain untouched.

**Capture next 2 seconds** resumes the attempt and schedules actual canvas samples immediately after the real renderer call. Case ID, seed, epoch, tick, HP and combat phases accompany each raster. Pauses, missing steps and terminal outcomes cancel pending capture; missing/late/failed images remain explicit. These controls never supply a visual PASS. The existing PNG/evidence export buttons deliver the results.

**Export practice trace** retains the bounded replayable prefix plus separately labeled current state/build metadata and capped event counts. Reset begins a fresh recording; there is no trace-import UI. Main integration tests execute genuine controller/trace/Three and production Rapier code, including one timed guard, one three-hit defeat, all nine measured cases after live mode, immediate/batched delivery and exact airborne campaign restoration with zero writes. Non-rendering canvas adapters explicitly fail image capture and are not screenshot evidence.

Integrated source gate: both TypeScript configurations, 611 tests and the production build passed before exact-checkpoint independent review. Seventeen actual-main tests include Start/Resume/Capture focus and immediate Space input; explicit gameplay transitions focus the programmatically focusable canvas, while generic modal Close restores its opener and native controls keep Space/Enter behavior. No browser dispatch or rendered approval is implied.

Recovery hardening adds a fail-closed pre-overnight checkpoint check, an explicit save-paused message and exact-byte last-stored export. An invalid occupied checkpoint is retained untouched and blocks save writes, rather than allowing later autosaves to consume the compatible original. This leaves in-memory play available and provides both current-progress and last-stored downloads. The combined staged gate passes 617 tests; exact-checkpoint independent review still controls release.
