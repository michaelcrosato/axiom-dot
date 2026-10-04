# Bounded deterministic generation Worker

## What changed

Connected valley compilation (including its four workshop plans) and vault compilation can run in one owned module Worker. Regional and standalone-workshop inspectors use the same bounded service. This is a generation responsiveness increment, not a simulation Worker, streaming system, authority change, or general performance claim.

The existing synchronous `worldValley`, `worldDungeon`, `worldWorkshop`, state creation, save parsing/validation, and server authority remain available and unchanged. Manifest definitions moved verbatim into `generation-manifest.ts`, re-exported from their previous module. Generated plan JSON remains byte-identical. No plans or recipes from saved files enter a cache.

## Owner integration contract

The integrated main module now performs the bounded startup warm-up after creating the loading DOM and before unchanged state/save initialization. It owns inspector disposal across navigation, Close and pagehide, and remounts a visible inspector on pageshow. No persistence, authority or source-manifest selection is delegated to the worker.

- `prepareWorldGeneration({generation:1|2,seed}, signal?, timeoutMs?)` resolves `{plan,backend,fallback,timings}`. `backend` is `worker`, `synchronous`, or `cache`; fallback is null or `unavailable`, `setup`, `error`, `timeout`, `protocol`. Timing fields are `totalMs`, `compileMs`, `validationMs`, and `bootMs`. `bootMs` records boot waiting attributable to that request (zero for an already-ready Worker); it is already included in `totalMs`.
- `previewGeneration({kind:'connected'|'legacy'|'workshop',seed}, signal?)` never populates world caches. The connected result contains valley and vault, the legacy result vault and standalone workshop, and the workshop result the standalone workshop.
- `disposeGeneration()` terminates the owned Worker and cancels all jobs; later calls can construct a new service.
- `startupGenerationHints(localStorage?,sessionStorage?)` returns default connected 73129 first and at most three other connected identities. It reads only bounded known active/legacy/default primary/backup and solo-return/co-op records. It never enumerates storage, validates a save, selects a world, consumes a transport record, or writes anything. Co-op world hints take priority over solo/active hints, but are still only speculative identity hints.
- After the loading DOM exists and before the existing first `createConnectedState`/`loadSession`/`parseSave` call, set one aggregate speculative deadline of 1500 ms. Sequentially prepare hints while time remains, passing the remaining time as `timeoutMs`. Keep results for truthful diagnostics; stop additional hints when the deadline is exhausted. Continue the existing synchronous loading/validation sequence. A timeout bounds waiting, not CPU preemption of the finite synchronous fallback or the unchanged loader.
- Keep every original state/save validation call. Speculative hint failure must not accept a save or alter the selection. Corrupt slots, unprepared saved-world enumeration, or other cold paths may still compile synchronously. The existing loader remains the source of truth.
- Existing caches hold four valleys and four dungeon identities; four sequential startup hints fit a fresh startup cache. Do not run speculative preparation concurrently with live state loading. Default 73129 is retained because current main constructs it before selecting saved progress. Intentional generation-1 preparation remains synchronous unless a caller explicitly requests a legacy preview.
- Both `mountRegionWorkbench` and `mountWorkbench` now return a disposer. Keep one owner handle and dispose it on panel close/replacement, successful navigation, lab entry, and session teardown. Their own close buttons, seed edits, domain changes, remount identity guards, and stale handlers already cancel or ignore results. Owner disposal also stops computation immediately when a panel is replaced externally.

## Trust, budgets, and cancellation

The production cache installer is private to `generation.ts`. Its client privately constructs the exact same-source Worker URL. The Worker accepts only a protocol envelope containing a bounded unsigned seed and one fixed kind. It imports low-level compilers, never the client or world-cache module. No renderer, save, storage, network, authority, recipe registry supplied by callers, or simulation state is sent to it.

Ready/results must match the protocol/source revision, both canonical generation manifests, and the outstanding job identity. The response is plain finite acyclic data with at most 160,000 visited values, 1,000,000 UTF-16 string units, depth 24, and arrays of at most 40,000 entries, plus domain-specific terrain/building/dungeon/compiler limits. Validation does not recompile on the main thread. The canonical main-module manifest reference is restored after cloning, and accepted worker data is recursively frozen. Shape validation alone is not proof that an arbitrary external plan is deterministic; the owned channel is the trust boundary. There is intentionally no public plan-import/cache-insertion API.

One active request and one latest pending request are retained; superseded queued requests reject as AbortError. Abort terminates active worker work and does not invoke fallback or insert plans. Dispose rejects all pending work, invalidates any awaiting cache preparation, and terminates the Worker. Per-request waiting is clamped to 1–5000 ms, including queue time. An expired pending queue job rejects with `Generation queue deadline exceeded` without compiling or disabling the active Worker; an active-job deadline terminates the Worker and returns the explicitly reported timeout fallback. Setup/error/protocol/timeout/unavailable failures are reported and latched for the service lifetime: later requests use explicitly reported synchronous fallback rather than repeatedly waiting for broken Worker startup. Intentional small legacy preparation reports synchronous with no failure reason.

The Worker retains no compiled-plan cache. World cache capacities are unchanged. Inspector results are retained only by their current view/caller. Full geometry arrays remain ordinary arrays to preserve exact plan bytes; this increment does not add transferable typed-buffer representations.

## Evidence

Baseline hashes were generated from frozen source revision `aec8b2b88772926107b85719678de800706def39` for seeds 0, 1, 606, 73129, and 4294967295. `tests/fixtures/generation-byte-hashes.json` pins valley, current vault, legacy vault, and standalone workshop JSON bytes. Tests compare real Worker output both to the synchronous compiler and those baseline SHA-256 hashes.

Commands:

- `npm run typecheck`
- `node --experimental-strip-types --test tests/generation-worker.test.ts tests/generation-previews.test.ts`
- `npm test`
- `npm run build`
- `node --experimental-strip-types scripts/measure-generation-boundary.mjs`

The benchmark distinguishes cold isolated-process compilation, Node Worker boot, raw structured-clone roundtrip, re-freeze, and the production client including bounded validation. It samples parent event-loop gaps through completion; it does not infer responsiveness from compute time alone.

Representative Node measurement on this host, 2026-10-01:

| Work | Observed time |
| --- | ---: |
| Cold synchronous connected valley + vault | 49–63 ms |
| Cold synchronous legacy vault + workshop (earlier pass) | 6–9 ms |
| Production client's first connected result | 155 ms total |
| First Worker boot (included in total) | 90 ms |
| First Worker compilation | 45 ms |
| First bounded validation/re-freeze | 10 ms |
| Warm production connected results | 37–51 ms total |
| Parent timer maximum gaps during production requests | 7–16 ms |
| Connected result JSON | 0.55–0.61 MB |

Cold Worker startup is slower end-to-end in this Node measurement. The benefit is moving a tens-of-milliseconds connected compilation stall off the main thread while retaining a bounded clone/validation cost. Node startup/type-stripping and this host are not browser or phone benchmarks. The client build adds an approximately 48.9 KB generation Worker; the server build contains no `new Worker` constructor. Existing 500 KB chunk warnings remain.

No browser, live Site, alternate browser route, headless session, or screenshot was run. DOM tests execute actual production handlers without pixels; they are not visual approval. Owner-side startup/navigation integration still needs its own handler regression tests after adoption.

## Integrated lifetime checks

`generation-boot.ts` bounds speculative preparation to four hints and one1500 ms waiting deadline, records metadata without retaining extra plan payloads, and stops on cancellation. Main Settings diagnostics and `getDiagnostics().generationPreparation` report actual worker/cache/synchronous outcomes and measured preparation time. These are startup measurements, not FPS claims.

The production main navigation/Close/pagehide/pageshow handlers are exercised with a real owned Node Worker and non-rendering DOM/canvas adapter. Replaced regional requests cannot repaint a workshop, forbidden lab/online navigation does not dispose the still-visible inspector, pagehide releases worker work, and pageshow remounts an open inspector. Actual lab Close still preserves the stale-import regression's exact campaign bytes.
