# Frontier field audio

AXIOM's audio adapter generates short, understated field-science sounds from Web Audio oscillators and seeded, low-pass-filtered noise. There are no downloaded samples, music tracks, loops, external requests, renderer dependencies, or world-simulation RNG reads.

## Integration contract

Import `createGameAudio` from `src/audio.ts` and keep one adapter per game session. Construction is silent and does not create an `AudioContext`.

- Call `unlock()` directly inside a trusted pointer/key event. It is the only context-creation path and returns a promise indicating whether the browser accepted the resume. Rejected attempts may be retried by a later gesture. Never await unrelated work before calling it.
- Call `cue(name, { distance?, seed? })` on a confirmed gameplay event. Its boolean result indicates whether the whole sound was scheduled. Locked, paused, distant, duplicate, and over-budget cues are dropped rather than queued.
- `distance` is listener-to-source distance in world metres. Omit for the local player's actions. At 48 metres or farther, or for non-finite distance, the cue is silent. This is distance attenuation, not a 3D/HRTF spatial sound system.
- An optional numeric `seed` gives exactly reproducible sound variation. Without one, the adapter uses its own counter, advancing only for accepted sounds. Audio never changes a world seed or gameplay RNG sequence.
- `setEnabled(boolean)` controls mute. `setVolume(number)` clamps volume to 0–1. Defaults are enabled, volume 0.5; saving these preferences is the host's responsibility. Neither method creates a context. Zero volume also flushes voices and suspends processing.
- Call `suspend()` on menu entry, focus loss, level replacement, or game pause. It immediately stops/disconnects all live voices and requests context suspension. Call `resume()` when gameplay is active again; it cannot bypass the first gesture unlock. Queued sounds are never replayed.
- Document visibility changes and `pagehide`/`pageshow` are handled automatically. A hidden page never schedules new sounds. Returning to the foreground preserves any explicit game pause.
- Call `dispose()` when replacing the adapter or tearing down the game. It stops sources, disconnects nodes, removes lifecycle listeners, and closes the context. It is safe to call repeatedly.
- `diagnostics()` returns a plain snapshot: support/context state, mute/volume, unlock/pause/visibility/disposal state, active/maximum voices, accepted/dropped cues, created/finished voices, and error count/message.

`GameAudioOptions` allows a smaller voice budget and dependency injection of a context factory and lifecycle targets for tests. Normal game integration needs no injected objects. No user setting or game state is written by this module.

## Cue map

| Cue | Suggested event | Character |
| --- | --- | --- |
| `footstep` | Ground-contact gait edge while moving | Short woody tap |
| `jump` | Confirmed takeoff, once per jump | Soft rising tone and air |
| `land` | Air-to-ground transition | Rounded low impact |
| `staff-prep` | Attack enters preparation | Quiet upward charge |
| `staff-impact` | Confirmed staff hit | Low impact with brief overtone |
| `staff-whiff` | Active attack ends without contact | Filtered air sweep |
| `enemy-telegraph` | Enemy enters a new wind-up | Two restrained warning tones |
| `hurt` | Player takes actual damage | Low descending pulse |
| `gather` | Successful pickup | Soft two-note confirmation |
| `repair` | Successful repair | Short ascending chord |
| `water` | Nearby water interaction/occasional flow tick | Quiet trickle and droplet |

Emit action cues on state transitions, not every render frame. Steps should follow grounded gait contacts; water may use a slow, proximity-gated tick if the host wants a sparse environmental texture. Per-cue cooldowns are defensive limits, not instructions to play at their maximum rate. Do not turn these one-shots into a continuous soundtrack.

## Hard bounds and teardown

- Maximum 12 simultaneously allocated scheduled sources, including future layer starts; caller budgets cannot raise the ceiling
- Whole-cue admission; at most three sources per cue, with excess cues dropped before node allocation
- Maximum recipe source duration 0.8 seconds and delay 0.2 seconds; current authored sounds are substantially shorter
- Source amplitudes at most 0.16, master gain at most 0.4, short zero-to-zero attack/release envelopes, and a shared compressor
- Seeded noise buffers bounded to 153,600 mono samples, with no growing cache
- Eleven-entry cooldown map, bounded live-source set, no timers or frame loops
- Ended callbacks disconnect every per-voice node; pause, mute, backgrounding, failed partial scheduling, and disposal also release them
- Async resume completion rechecks lifecycle gates so a late browser resume cannot undo a pause
- Unsupported/blocked Web Audio fails quietly; diagnostics record failures without throwing into gameplay

## Verification

`node --experimental-strip-types --test tests/audio.test.ts` exercises recipe seed sweeps, amplitude/frequency/time bounds, deterministic noise, invalid-input limits, lazy unlock, failed/retried gestures, concurrent unlocks, actual scheduled envelopes, distance gain, natural cleanup, source-budget pressure, cooldowns, mute/zero-volume/pause, background/page lifecycle, async resume races, partial-source failures, disposal, and unavailable/disabled environments with a mocked Web Audio graph.

The mock verifies resource accounting and scheduling contracts. It does not establish acoustic quality, hardware loudness, mobile browser gesture behavior, or background behavior on a physical device. Those require listening and actual-device/browser checks alongside the host integration.

The resonant guard adds windup, confirmed interception and interruption cues to the end of the existing cue registry, preserving earlier deterministic cue indices. They are emitted by production timeline/contact events, not field opacity or a cosmetic predicted block. Online durable block IDs suppress duplicate replay sounds. These synthesized cues have model/budget tests; actual listening remains unverified.
