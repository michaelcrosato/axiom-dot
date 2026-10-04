# Rendered visual review

## Evidence boundary

The visual-review tools are implemented and statically checked. **No browser image was rendered or visually inspected by the assistant during this pass.** Passing the capture unit tests or rig/physics assertions is not visual approval. The report starts at `not-reviewed`; capture never turns this into a pass.

Current environment check on 2026-10-01:

- The current Sites execution-profile rule selects portable: `SITES_MANAGED_LINUX_CONTAINER` is unset
- No `sites-preview` command is installed
- An explicitly requested portable Vite preview ran on its printed Local URL and returned HTTP 200 from a readiness request in the same retained network session
- The official cloud browser then rejected that exact Local URL with `net::ERR_BLOCKED_BY_CLIENT`
- The server was stopped. No proxy, alternate hostname/transport, direct Chromium automation, live-Site browser retry, or access-control change was attempted
- A user-owned machine cannot be used without authorized connected task access. A future supported browser route or user-exported actual image is needed for visual review

## Isolated review page

`visual-review.html` imports the production `createAvatar`, equipment compiler, shared animation state and materials. It offers 24 fixed probes: idle, four sprint phases, braking, reversal, launch/apex/landing, alternating crawl support, slide, each of three combo stages in anticipation/contact/recovery, gathering and repair.

Each view can use front, side, back or three-quarter framing; the baseline survey staff or two explicitly compiled light/heavy assemblies; clearance guides; and WebGPU preference or forced WebGL2. The close-up uses production light colors/intensity and tone mapping, with a smaller shadow-camera extent for inspection. It is a pose laboratory, not a gameplay recording.

### Creature and cave review

The Subject selector also offers the actual production `createQuadruped` and `createCaveView` renderers:

- Quadruped: 13 probes covering idle, four distance-driven pursuit gait quarters, three locked-heading preparation phases, three strike phases, recovery and stagger. The fixture keeps the production encounter state shape and records the generated body plan and enemy rules. It does not invent a separate recovery/stagger animation
- River cave: four views comparing flooded and low water at the same overview and narrows camera positions. The low-water state is produced from the real valve/pump/drain repair commands and bounded quarter-second reducer steps, not a manually lowered surface. It records all three compartment depths and the complete water state

Each subject is captured separately, preserving the maximum 36-frame capture budget. Cave geometry is loaded only when requested; the humanoid equipment controls are disabled for other subjects. Camera angles stay selectable, with framing appropriate to an actor close-up or full cave.

Numeric mesh min/max bounds are recorded alongside each real raster frame as a separate diagnostic. Actor geometry more than 2 cm below its feet plane triggers an explicit review warning. This is not a visual pass/fail rating. The cave's intentionally thick floor is excluded from actor ground-contact warnings.

Four additional non-rendering tests check valid quadruped encounter fixtures, actual production creature geometry/warning visibility, reproducible water conservation and route opening, and actual production cave surfaces matching the recorded depths. Those tests adapt import resolution for Node without changing model logic; they do not initialize a graphics renderer.

### Field ecology review

The Subject selector adds seven isolated views using the actual production `createEcologyView`, without changing the humanoid, quadruped or cave probes:

1. Empty garden, before planting or irrigation
2. Seeded garden after one accepted plant and one accepted 4 L watering command
3. First committed sprouted stage
4. First committed budding stage
5. First committed ripe stage
6. Harvested garden after the real harvest removes the crop and yields 2 biomass
7. Harvested garden during real rain, after a positive rainfall transfer enters the ledger

The disposable fixture explicitly supplies `{scrap:0,core:0,water:1}` and starts with the production pack's 12 finite seed packets. It plants the crop suited to the first garden's actual habitat. Only `createEcologyState`, `applyEcologyCommand` and quarter-second `advanceEcology` calls produce snapshots. No fixture edits growth, weather, moisture, inventory or history into a desired state. A global 2,400-step guard stops fixture preparation with an error if growth or rainfall fails to reach the required state. At seed 73129 the stage ticks are 0, 0, 62, 123, 188, 188 and 193; the successful fixture uses 193 quarter-second advances, one seed packet and one canister.

Each frame's JSON evidence includes the complete ecology state, remaining disposable inventory, initial command context/supplies, accepted command list with ticks and revisions, elapsed step count, production presentation/weather projection, and all six water-ledger inputs/outputs in integer mL plus current soil and the zero conservation residual. Metadata distinguishes the capture's frame-index clock from the ecology simulation tick.

All seven states use the same first garden and fixed camera for a selected front, side, back or three-quarter angle. The actual production renderer remains intact. A separate inspection-only 12.6 m support patch samples `worldValley` and `valleySurfaceHeight`; its vertices align with the production bed's 22 mm soil offset. The patch does not reconstruct native scenery or claim to show the full campaign valley. A 12 m camera far plane keeps the other beds outside this close-up. The generic flat floor and humanoid clearance guides are hidden. Numeric mesh envelopes include the whole production ecology root, so those bounds are not the selected bed's camera crop or actor floor-penetration evidence.

The production renderer's instanced bounding boxes are refreshed before numeric evidence is recorded. Rain visibility follows the committed weather, and harvest removes the actual fruit instances. The viewer does not run an ecology timer. Renderer sync, repeated selection and capture never advance the state.

Six non-rendering ecology-review tests cover deterministic and independently replayable snapshots, bounded alternate seeds, finite goods and exact water accounting, detached evidence metadata, actual production mesh transforms/colors/rain across forward and reverse selection, terrain vertex support, and all four cameras' numerical framing. These tests instantiate Three mesh data and camera math; they never initialize a graphics renderer or inspect pixels. Camera-envelope assertions do not certify lighting, occlusion, shading, readability or appearance.

Validation for this extension: client/server TypeScript and the focused 17-test visual/presentation set pass. No build was run by this worker; the integration owner controls the build window. No browser attempt was repeated after the recorded access denial, no screenshot exists from this pass, and visual approval remains `not-reviewed`.

### Resonant guard review

The Subject selector adds six views from `GUARD_VISUAL_FIXTURES` and `guardReviewStates()`. A separately owned production `createAvatar`, `createQuadruped` and `createGuardView` group sits on the neutral inspection floor. The player stays at `(0,0,0)` in the production grounded idle stance with the baseline survey staff; the sentry follows its actual fixture position `(0,0,2)`, heading, phase, remaining attack time and consumed-contact IDs. The avatar and field use the locked production guard facing. No fabricated guard animation, hit claim, damage immunity or cosmetic substitute for a failed block is introduced.

The snapshots are:

1. Windup, tick 33: 100 HP, 78 shared stamina, actual sentry preparation
2. Active unspent sector, tick 40: 100 HP, 78 shared stamina, actual sentry preparation
3. One intercepted contact, tick 45: 100 HP, 78 shared stamina, spent active guard, block receipt 1, actual sentry strike and consumed contact
4. Recovery, tick 53: 100 HP, 78 shared stamina, durable block receipt 1, actual sentry strike still finishing
5. Too-early failure, tick 45: 88 HP, 78 shared stamina, expired idle guard, actual 12-damage sentry contact
6. Rear-facing failure, tick 45: 88 HP, 78 shared stamina, guard interrupted to idle, actual 12-damage sentry contact behind the locked facing

The last two snapshots correctly hide the field because their real guard state is idle. They do not redraw an active boundary to imply protection at the damaging contact. The intercepted snapshot shows the production spent boundary without its active fill. Production field geometry keeps the exact 2.4 m radius and 120° front arc; the reviewer does not rescale the actors or field for framing. Front, side, back and three-quarter camera positions, target, 0.01 m near plane and 18 m far plane come directly from `guardReviewCamera`.

The on-page numeric readout shows tick, HP, shared stamina, exact guard phase, cast receipt, durable block receipt, actual sentry phase/attack ID and current contact outcome. Each captured JSON entry adds a detached full production frame containing combo, guard, enemy, encounter events and guard events, plus the original tick/seconds, press tick, fixed-step interval, bounded run length, HP before/after, receipt and per-contact applied damage. A blocked frame retains the original sentry's 12-damage contact event and separately records the real interception and zero applied damage. Capture's 0–5 frame indexes remain explicitly distinct from simulation ticks; the viewer never advances combat when choosing a view or capturing it. Metadata records the immutable guard recipe, actual generated sentry plan and initial positions. No campaign is read or written.

Guard mesh evidence reports visible production vertices for each actor, the field when present, and the combined bounds. Hidden failed/expired fields are excluded. All 24 fixture/camera combinations numerically contain every visible avatar, sentry, attack-warning and guard vertex. As elsewhere, these calculations are not evidence of lighting, occlusion, readability, shading, device performance or visual quality.

`tests/visual-guard-review.test.ts` adds six non-rendering tests: independent replay of all 273 production snapshots across the three runs; exact detached resource/receipt/contact evidence; production transforms and repeated forward/reverse selection without state mutation; exact field geometry; all four cameras' visible-vertex bounds; and existing-subject/capture integration checks. The test import adapter skips CSS and resolves legacy TypeScript extensionless imports only in Node. It does not initialize a DOM, graphics renderer, browser, preview server or alternate access route.

Validation on 2026-10-01: `npm run typecheck` passes for client and server. The focused set of `visual-guard-review`, `visual-ecology-review`, `visual-world-review`, `visual-capture` and `guard` tests passes **35/35**. This worker changed only `src/visual-review.ts`, `tests/visual-guard-review.test.ts` and this document. No build, commit or publication was performed; the integration owner retains the build window. The prior browser denial remains respected: no retry, screenshot, pixel inspection or visual-approval claim was made. The review remains `not-reviewed` pending a supported rendered inspection.

Capture all poses or views:

1. Choose equipment, camera, backend and guides
2. Capture all poses. The sheet contains raster copies taken immediately after the actual Three renderer call
3. Check the count of captured, suspect, failed and missed frames. A uniform/blank-like framebuffer is flagged for attention, never accepted silently
4. Inspect full-size silhouettes, hands, staff grips, foot/floor contact and clearance. Use the in-game lab for continuous motion and actual physics
5. Export PNG and report JSON. Add your own review rating and notes to the report if useful

No campaign world, local save slot or progression is loaded, changed or written by this page. No image or report is uploaded. PNG export is user-initiated and local. Source metadata is recorded in JSON, but no frame timings are fabricated.

### Build integration

The owner must include both `index.html` and `visual-review.html` as Vite build inputs and link the latter from the developer lab. A normal single-entry Vite build will not publish an unreferenced HTML entry automatically.

Set the optional public build variable `VITE_AXIOM_SOURCE_REVISION` to the exact source commit at build time for report traceability. If absent, the report explicitly says `not-recorded`; it does not infer a revision.

## Live lab capture API

`src/visual-capture.ts` exposes `createVisualCapture(canvas, options)`:

- `arm({scenario, ticks, maxTickLateness?})` starts a bounded capture of up to 36 unique nonnegative worker ticks and takes metadata. Starting a new plan replaces the previous in-memory set
- `afterRender({scenario,tick,label?,details?})` must be called synchronously immediately after successful `renderer.render(scene,camera)`. Do not postpone to the next animation frame, because a non-preserved framebuffer may have cleared
- `cancel(reason)` records remaining scheduled ticks as missed and keeps all existing images
- `report()` returns a detached evidence manifest. `contactSheet()` returns a real 2D raster canvas. `download('png'|'json')` exports local files
- `active` indicates whether scheduled work remains

`src/visual-fixtures.ts` exports `LAB_CAPTURE_TICKS`, fixed pose/view probes, reducer-derived ecology snapshots/evidence/terrain/camera helpers and `labReplayFixture(id)`. The replay export contains the existing production lab inputs at 60 Hz and the 60-tick warmup, not a second gameplay simulator.

For the current lab flow, `tickLab` assigns `labTicks` from the worker snapshot and increments it after consuming that sample. The corresponding displayed physics snapshot is `labTicks - 1`. Only call `afterRender` while that same case is running, with warmup complete, physics ready, the menu closed and the window active. On case reset, backgrounding, interruption or exit, cancel pending capture. The owner can choose a fresh plan per scenario or a single explicit selected-case run. Preserve a completed set while the user inspects it.

A rendered frame has only one actual tick. When a worker backlog skips several requested samples, older samples are marked missed; they never receive duplicate copies of a later frame. `maxTickLateness` may be 0–6 ticks and every accepted image still records both requested and actual tick. Exact-pose review uses zero lateness.

## Checks completed

- TypeScript compilation of the new modules
- Five non-rendering tests for bounded plans, wrong-case/stale tick rejection, backlog accounting, interrupted/failed/uniform captures, report immutability, fixed pose identities, reproducible input fixtures and all 24 poses compiling with all three loadouts above their feet plane
- Isolated Vite build of the review entry (see integration validation log for the latest result)

Still needed: actual desktop screenshots and inspection; a real continuous gameplay review; WebGPU/WebGL2 comparison; mobile touch/landscape/portrait review on target devices. These remain separate from model/physics correctness.
