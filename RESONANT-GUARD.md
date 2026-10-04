# Resonant guard: first defensive ability contract

Scope: one immutable, versioned ability recipe. This is not a general procedural-ability system. Existing equipment still drives staff attacks; guard shares their authoritative ComboState stamina and commitment. No additional resource, persistent campaign field, material powers, damage reflection, immunity flag, database table or migration is introduced.

## Rules

- Costs 22 stamina immediately, including misses and interrupted casts
- Windup 0.12 s, active 0.22 s, recovery 0.38 s
- Cooldown ends 1.15 s after the original 0.72 s commitment, even if interrupted
- Facing locks at the accepted edge; horizontal range 2.4 m, full front arc 120°, source height difference at most 0.85 m
- A guard intercepts only one actual eligible sentry contact during its active phase. The sentry has already passed its own authoritative reach, locked attack facing, vertical and wall checks. Its hitIds still consume the contact
- Intercepting does not damage or stagger the sentry. Two contacts in the same tick can still hurt: the first consumes the guard, the second deals normal damage
- Early/late timing, behind/side contacts, walls, range, airborne, crouched, dead and paused conditions do not receive protection
- Staff and guard cannot overlap their committed timelines. The existing combo stamina is charged once and regeneration remains delayed through the guard plus the normal combo regeneration delay
- Jump/crouch, an unblocked damaging contact, menu, zone, death, session replacement and host pause interrupt interception, without refunding stamina or clearing cooldown
- Zone/reset integration must preserve the existing combo stamina/regen delay rather than recreate a full meter. Server transitions use cancelCombo(...,'reset'), not createComboState()

## Main integration contract

Only these runtime files are staged: src/guard.ts, guard-resolution.ts, guard-view.ts, guard-fixtures.ts, audio-recipes.ts, coop.ts, coop-protocol.ts; server/coop-authority.ts, coop-api.ts, coop-validation.ts. No main.ts, controls.ts, style.css, visual-review.ts, visual-fixtures.ts, world.ts, campaign schema or migrations were edited.

1. Create transient guard = createGuardState(). Preserve or interrupt it across world/menu/lab lifecycle; do not refill shared combo stamina when canceling. Lab checkpoint should include guard and combo, restoring both when leaving the disposable lab
2. Construct GuardContext from the authoritative local physics reply: state.player x/z/hp, reply feetY/grounded/crouched, combatHeading, playing gate and combatObstacles(). Never use interpolated avatar transforms for damage
3. Solo input edge calls requestGuard(guard, combo, context, crypto.randomUUID(), undefined, combatTuning()). Accept BOTH result.state and result.combo, consume its guard events. No holding or auto-repeat casts
4. Recommended solo fixed physics step order: accept worker movement; stepGuardedWorldEncounters(state, guard, context) (it advances guard and enemy at 1/60, resolves contacts); accept state/guard; consume encounter events and guardEvents; then stepCombat()/stepCombo once and commit staff hits; then normal world tick. This matches server guard → encounter damage → combo. If preserving the previous combo-before-enemy ordering is necessary, call the guard wrapper immediately afterward, but that retains the previous solo/server simultaneous-hit ordering difference. Never call stepGuard separately in addition to the wrapper
5. The wrapper filters only intercepted damage from returned encounter events; normal hurt/stun feedback remains driven by unblocked damage events. The same resolveGuardDamage adapter handles both server and solo
6. Jump/crouch input must interruptGuard immediately. Opening a menu calls interruptGuard(guard,'menu') and, online when connected, coop.send({type:'guard-cancel'}). Solo menu clocks freeze; online room clocks keep running. Hide online fields when paused/disconnected; an in-flight authority request cannot be assumed canceled by a local menu
7. Desktop: independent G edge (ignore e.repeat/edit controls). Touch: an independently labeled Guard action away from the fixed X/Y/B/A slots; retain Jump and Crouch meanings and positions. A Settings ability choice is optional; do not relabel Jump as an ability
8. Online input calls coop.guard(); do not requestGuard locally, predict stamina, or claim a block. pendingGuardIntent stays until its matching authoritative receipt. Add current movement/facing with coop.move before the edge just as the jump input path does
9. On accepted snapshots replace guard with snapshot.guard, retaining the previous value for guardSnapshotEvents(previous,next). The durable lastBlock.id catches a contact between polls and emits no duplicate sound on identical retry snapshots. Initial snapshots intentionally make no old sounds
10. For visual-only time between snapshots use confirmedGuardView(snapshot.guard, ageSeconds). This projects a SERVER-ACCEPTED cast through its latched timeline, so the 0.22 s window is visible even though normal polls are 0.25 s apart; it also expires stale active fields. Never use the projected value for damage, stamina, requests or persisted room state. Internet transit is unknown, so label this as confirmed-cast timing with latency rather than a promise of present protection
11. createGuardView().root attaches once; update(renderGuard,{x,y,z},reducedMotion). It uses the immutable radius/arc for the visible sector boundary and only changes color/opacity between windup/active/spent/recovery. guardStatusText supplies ready/stamina/pending/phase/cooldown text. guardAudioCue maps authoritative timeline/block/interruption events onto bounded synthesized cues

## Online safety and durability

CoopAction adds only guard-press with a bounded intentId and guard-cancel. Unknown fields, damage/recipe/clock/protection/stamina claims are rejected by existing exact-key HTTP validation. Guard intents use the jump path's urgent flush with a 125 ms minimum request spacing; existing serial sequence/session/CAS rules remain in force. An outstanding guard edge cannot be queued twice. A lost successful reply reuses its exact original request. Matching receipts clear pending state; unrelated earlier replies do not. Confirmed guard state is strictly validated on the server and in incoming client snapshots. Older room records missing guard initialize one empty guard without replacing their combo stamina; malformed existing guard data fails closed rather than silently resetting cooldown. This additive room JSON upgrade needs no migration.

A join/resume replaces the session lease, interrupts any old active guard, retains cost/cooldown, and preserves monotonically numbered cast/block receipts. Leaving/closing interrupts active guard. Host absence interrupts protection and freezes simulation without offline catch-up. Stale sessions retain the existing 409 rejection. Old server snapshots without the optional runtime capability cannot enqueue a new guard command.

## Isolated review and lab

src/guard-fixtures.ts exports six GUARD_VISUAL_FIXTURES and guardReviewStates(), with captured production states for windup, active, intercepted, recovery, too-early damage and rear-facing damage. Each fixture uses real createEncounters/advanceEncounters, requestGuard/stepGuard, resolveGuardDamage and stepCombo calls. There are no fabricated hit claims and no campaign read or mutation.

A viewer can mount the production avatar, createQuadruped and createGuardView on a neutral floor. Player is at (0,0,0), enemy at (0,0,2), forward is +Z except rear case; use guardReviewCamera for fixed front/side/back/three-quarter framing. Include numeric frame evidence (tick, HP, shared stamina, guard phase/receipt/block, actual sentry phase/attackId). These values are evidence, not raster approval.

For the developer lab, add guardSystemChecks() to its disposable system checks or show these as a separately labeled ability suite. It checks a timed interception at 100 HP and 78 stamina, plus early/rear failure at 88 HP. Existing movement/physics cases remain untouched. Independent desktop/touch/browser capture, pause/zone/lab lifecycle UI verification and visual judgment belong to the final integrated build.

## Verification

- Pure reducer/presentation/fixture tests: tests/guard.test.ts
- Real TCP HTTP + SQLite authority/client tests: tests/guard-http.test.ts
- Existing bounded audio sweep updated from 11 to 14 cues. New cues append to AUDIO_CUES so old seeded cue timbres retain their indexes
- Typecheck and aggregate tests/build must be rerun after main/viewer integration
- No screenshot, hosted-build, physical mobile performance, paid-service, migration, commit or deployment claim is made by this staging work

## Integrated controls, display and isolation

The game binds G and an independent Guard button above the unchanged X/Y/B/A slots. Its native click and non-primary touch route uses the existing pointer ownership system. The solo physics callback resolves guard and sentry contact before stepping the staff combo, matching server order. Jump/crouch and menu/lifecycle reset interrupt the ability without refilling shared stamina or clearing its cooldown. The developer lab checkpoints/restores guard with the existing combo and gives measured courses a separate clean practice state. Two repeated disposable ability checks exercise actual interception and timing/rear failures without changing the campaign.

Online requests send current worker pose/facing and a reliable guard intent. They never locally spend stamina or claim a block. Main and peer fields project only an accepted cast; an unrelated or duplicate snapshot cannot rewind an expired visual window. The field is hidden locally during interruption, menus, disconnect or pause, but an in-flight request cannot be assumed canceled before server acknowledgment. Server damage remains authoritative. Per-frame rendering never advances the ability, its stamina or world time. The isolated production viewer captures six real guard/sentry states with HP, shared stamina, input tick, contact and receipt metadata.

Unblocked sentry contact now applies the same shared 0.22-second staff stun in solo and online resolution; a confirmed interception does not stun. This closes the previous online/solo reaction mismatch while retaining the authoritative enemy→staff order.
