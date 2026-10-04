# Map, menu and recoverable session restart

## Delivered behavior

- M toggles the whole-world atlas outside text fields. Menu → Play & world offers the same route on mobile. Escape, Close and browser Back dismiss the overlay. Switching panel tools retains a single same-URL history entry. Input is cleared at entry/exit; gameplay buttons and camera pointers remain independent beneath ordinary gameplay, and fixed X/Y/B/A positions are preserved.
- The atlas has pan, wheel/pinch/button zoom, fit-world, locate-player, a destination picker, marker labels, a real metre scale and north (+Z). It samples existing generation-1, generation-2 or regional terrain authority. Vector roads/rivers/buildings use the existing plans. Underworld coordinates are never misrepresented on the surface: the cave/vault entrance is shown and labeled.
- Base terrain uses 224×224 pixels in four-row yields. A zoomed 192×192 detail sample is debounced during gestures. Neither path requests terrain chunks or populates regional feature caches. All map timers, event handlers, pointer capture, canvases, observers and animation-frame work are disposed on close/replacement/pagehide, with remount on return.
- Menu groups Play & world, Field tools, Controls, Graphics & sound, and Advanced. Developer tools and historical rollback exports are kept out of the main play actions. Solo menus pause simulation; online maps explicitly say the shared world continues.

## Restart and recovery contract

Same-seed restart is a two-step capability. Preparing a confirmation and Cancel are read-only. On confirmation, the current in-memory run is serialized to an immutable per-world checkpoint. A single atomic localStorage record write commits the new current run and its backup. Existing raw slot bytes, legacy aliases, other seeds/flavors, settings and older compatible rollback checkpoints are retained. Quota failures before the commit leave the active run unchanged; a safely staged checkpoint may remain.

The original protected recovery is never replaced. Every later restart or recovery also archives the run it displaces. Recover exposes an explicit checkpoint selector and exact-byte export. Restoring requires its own confirmation, validates world identity and rechecks source bytes before committing. Repeated clicks reuse a once-only operation. Old confirmations fail closed after autosave, a different world selection, mutated current state or a newer restart/recovery.

A committed session change blocks outgoing saves, retires co-op connection generations, clears input, advances the physics epoch, stops workers/rendering and reloads the entire document. Pending imports and late online responses cannot overwrite it. Per-world reset revisions also reject stale writes from another already-open tab or a bfcache-restored page. Ordinary saves within the same reset revision still work.

Online active, connecting and boot-pending sessions cannot reset a solo world. A host's personal reset does not reset the shared room. Return to solo first. Original generation-1 foundations remain generation 1; connected valleys remain connected; regional saves remain regional. Selecting an existing new-seed destination resumes its save rather than resetting it.

If startup encounters an invalid session record or inaccessible storage, it does not make a writable default-world fallback. It shows a recovery screen, locks saves and offers an exact-byte local-save rescue archive. This archive is a repair package, not a single-world import file. It filters to AXIOM game-save keys and excludes authentication/session credentials.

## Verification boundary

Unit/model tests cover map projection and numeric geometry, all world flavors, bounded raster jobs, no chunk/feature compilation, exactly-once reset, safe storage failures, stale revisions and archive selection. Offline DOM doubles execute map controls, pointer gestures, cleanup and menu navigation; extracted production lifecycle handlers cover reset/Cancel/co-op guards. Existing production-worker regression suites still run on the verified official Node 22.23.0 runtime.

These are not rendered browser, touch-device or multiplayer internet visual checks. Browser localhost access was previously denied and was not retried, proxied or bypassed. The deployed Site was not browsed for QA. Node 24's previously observed native V8/WebAssembly issue is not claimed fixed; prohibited runtime diagnostic probes were not repeated. No actual user's live local saves were modified in tests.

No render/view distance, fog range, streaming radius, physics boundary, resistance or difficulty values were changed. The ambiguous distance/resistance request remains pending clarification.
