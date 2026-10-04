# Hearthmere starting town · experimental preview

## Scope and access

Hearthmere is an additive town at (-176, -144), outside the pinned generation-2 valley core, inside the existing 10 km² streamed frontier. A genuinely fresh preview session starts at its collision-safe square (-176, -136). Existing regional saves retain their positions and progress; Town → Visit the town square moves only the requesting explorer through the normal preload gate. Older original/connected-valley saves can open the same seed's separate regional save, without replacing the valley slot. Emergency recall intentionally remains at the original valley camp.

The town has 40 open-door household buildings and seven open-front businesses. Doorways are 2.2 m wide; lintels have 2.5 m minimum clearance. Streets, signage and the atlas connect the square to the existing Mossbank road. Original quest workers, object IDs, valley geometry, regional macro sites/roads, food/freight plans and campaign objectives are retained.

## Residents

Exactly 100 additional townspeople, separate from the five or six original valley quest workers. Seeded immutable identities include unique IDs, full names and visual combinations, roles, explicit varied households, home/work assignment, personality, interest and three dialogue lines. Household revision one adds reciprocal relationships, adult ages, individualized histories/goals and six-phase daily timetables. All residents, including seven keepers, follow continuous 480-second outdoor home/work/square cycles. See TOWN-HOUSEHOLDS.md for the current household mix and player/developer inspectors. North-row routes use the outer streets around storefronts. These are bounded schedules, not autonomous LLM agents or a needs-based economy. The version-2 crowd adds bounded soft spacing/yielding, swept player contacts, conservative building clearance and eased heading. See TOWN-CROWDS.md for the exact contract and limitations.

The production model samples at most 24 nearby activity/detail states at 10 Hz, others at 2 Hz; visible positions and articulated gait update every actual render frame. Only collision-confirmed residents within 90 m are shown. Six instanced geometry buckets project the roster; seed 73129 uses 1,716 parts and 25,156 triangles. No resident has a physics body or pathfinding loop. Roster/route caches are bounded and identities survive chunk eviction and reload. The schedule uses the existing shared causal clock; no offline catch-up or separate client gameplay clock is added.

## Businesses and real effects

- Trail & Tin Supplies: one finite arrival kit (3 scrap + 1 water); water canister for 1 scrap (12 stock).
- Ember Smithy: reconditioned core for 3 scrap (4 stock).
- Second Life Salvage: 2 scrap for 1 core (8 stock).
- The Copper Kettle: restore up to 20 suit HP for 1 water (12 stock).
- Lantern House Inn: restore up to 40 suit HP for 2 scrap (8 stock).
- Greenlight Apothecary: restore suit to 100 HP for 1 core (4 stock).
- Wayfarer Outfitter: the real existing staff assembly/recycling workbench, with its existing material costs, recipes and co-op host gate.

There is no new currency and no renown spending. HP services are immediate labelled effects, not a promise of a sleep simulation or inventory food item. Stock is finite per world and never refills on reload. Prices and outputs are pinned in a hashed catalog. An optional town ledger has at most 49 receipts; stock and resource balances are derived from those receipts. The world save equation includes proven outputs and debits. Health applies only to the purchasing actor. Commands carry only an allowlisted offer and expected town revision. Shared inventory/stock are committed atomically through the existing room CAS and transport sequence; stale revision and lost-response retries cannot duplicate a purchase.

## Compatibility and collision

Original regional feature eligibility, IDs, positions and yields still use the historical terrain sampler. Developed land and the connector are hidden from live resource projection/gathering, but previously harvested IDs still validate and retain their wood/stone. The town-aware height sampler is shared by terrain mesh, normals, height queries and authority. Existing regional macro plans remain unchanged. All town structures enter the same chunk collision/acknowledgement pipeline as existing structures, including initial 3×3 preload. The densest initial chunk has 91 structures, below the 128 transport cap.

Local Rapier resolves saved overlaps before readiness. The co-op migration is versioned per actor: only developed terrain floor poses are rebased, unchanged roof/platform heights elsewhere remain intact, and a new-solid overlap gets a clear square destination. Accepted airborne motion is preserved unless actual new solid overlap requires recovery. The initial loader projects residents before shader compilation without advancing gameplay.

## Developer exposure

Developer lab → World systems → Hearthmere opens a separate disposable model. It uses the same roster, schedule and purchase reducer, with an explicitly synthetic test budget of 20 scrap, 6 cores, 6 water and 30 HP. Campaign storage and inventory are not passed to the model.

Typed supported settings include population 7–100, detailed-near activity budget 8–48, routine speed 0–2×, appearance variety, gait amplitude, idle gestures and NPC spacing; see TOWN-CROWDS.md. Seed/population changes require explicit scenario reset. Draft defaults/discard, pause/step, shop reducer inspection, receipt/balance diagnostics, strict version-2 preset import and source/seed/settings/action feedback export are provided. The actual town can be visited separately for playable physics. Shared rooms disable the disposable model. Closing/navigation disposes its timers; imports only stage settings.

## Verification limits

Bounded numerical, DOM-contract, actual Rapier and local HTTP/SQLite tests are not rendered browser, GPU, touch, mobile or device certification. CPU update measurements and geometry counts are separately labelled. No browser QA or denied registry routes were used. The same 13 held food/clock test files remain excluded exactly as listed in EXPERIMENTAL-PREVIEW.md; this town work does not complete that separate review.

## Historical initial-town validation record

These measurements describe the first town publication, before the crowd-motion upgrade. New behavior and verification are documented in TOWN-CROWDS.md.

- 29 new town checks passed across five files.
- Final affected selection: 180/180 passed across 26 files.
- Wider allowed selection: 177 files, 1,247/1,248 passed before the last lifecycle placement fix; its single DOM extraction failure then passed in the final affected rerun. This is not claimed as a single all-green aggregate. Exact selections and held files are in evidence/starting-town-validation.json.
- Client and server TypeScript, production build, nine source/emitted regional chunks, source/emitted real Rapier town movement, emitted server purchase/retry and the existing startup build verifier passed.
- Initial town workload: nine chunks, 207 structure pieces, maximum 91 pieces in one chunk, 271 physics colliders in the source/emitted startup scenario. Resident projection: six instanced meshes and 11,200 triangles for 100 residents.
- The recorded CPU-only sample is in evidence/starting-town-cpu.json. Its 12,000 update samples have p95 0.0273 ms and mean 0.0156 ms on this host, with a 26.9 ms maximum outlier; these are not FPS or a device-performance certification.
