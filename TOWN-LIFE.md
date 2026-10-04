# Hearthmere living town · V9

A deterministic, original life-simulation layer for all 100 existing residents. It preserves every resident ID, name, appearance, household, adult family relationship, backstory and longer-term ambition. This is a playable first version, not a full recreation of another life simulator.

## Try it

- Visit Hearthmere using **Town → Visit the town square**. The **Town life** quest button, the directory’s **Needs, desires & town life** button, and E at an open-air service point open the living-town inspector.
- Walk through the square, the two shared gardens, the water station and Market Street. Residents actually travel to reserved slots, perform an activity for a duration, then choose again. The new ground pads, garden beds, water trough, benches and service signs mark the facilities. Their small status markers are green for available capacity, gold for fully reserved, and red for an unavailable service.
- Approach a resident and press E/Talk. Their current day, town, hopes and follow-up answers now refer to their actual activity, motive, mood, goals, relationships and shortages. **How can I help around town?** opens that resident’s live inspector. **Take a moment…** is an explicit encouragement action when available; ordinary supportive conversation choices retain their previous dialogue-memory behavior.
- The in-world quest area surfaces current service outages, pantry/water/material scarcity and urgent or social needs, with a relevant path into the inspector. These are read-only diagnoses of actual state.
- The inspector includes all six needs, differentiated trait weights, current goal and progress, current and last activity, travel/queue/occupancy, decision reasons, family/friendship/friction, resources, source balances, service conditions, and the bounded town journal. Its schematic map is not an additional rendered-world screenshot.

## Resident decisions

Needs are nourishment, energy, hygiene, comfort, connection and fulfillment, each bounded 0–100. Base depletion per active simulation second is respectively 0.072, 0.063, 0.052, 0.045, 0.055 and 0.048, multiplied by the resident’s deterministic traits and the applied need-rate setting. Traits, preferred daily timetable, professional specialization, current deficits, stress, active desire, existing company/affinity, travel cost and queues all affect utility.

Residents eat, rest, wash, socialize, pursue a personal interest, garden/harvest, draw water, cook, recover materials, maintain a service or receive restorative care. Activities last 14–30 seconds at defaults. Recovery occurs over occupied action time, never merely from choosing an activity or arriving in its neighborhood. Input batches are charged at action start and production yields are latched to the same batch. An interrupted activity does not refund consumed inputs or grant its unfinished output.

Critical needs can interrupt lesser plans, but useful prerequisite labor is allowed to finish when an urgent alternative has no supplies. A minimum commitment and one prioritized urgent drive avoid starvation/rest/wash cancellation loops. Queues are FIFO; unavailable services release occupants/reservations; failed resource checks replan; long waits and travel leases expire. Residents start a new route from their actual persisted position. Routes follow the existing town streets and pass body-clearance checks.

Five rotating, individually worded desires cover friendship, craft, gardening, town service and settling in. Completing the appropriate real activities advances them. A goal completion restores some fulfillment and reduces stress before a new goal is chosen. Actual shared encounters affect signed affinity; stressed encounters can create friction, which affects future company choices. Socializing alone does not manufacture friendship or complete a company goal. Existing household relations are retained alongside a maximum of eight tracked relationships per resident.

## Capacity and sources

There are 48 actual facilities: 40 household forecourts with one slot per household member (100 total), plus cookshop 12, inn 14, apothecary 8, workshop 14, two gardens 12 each, well 10 and meeting square 24 (106 public slots). A slot is reserved during travel and occupied during the action. The scene remains an open-air, stylized town. Rest/wash/meal actions use home forecourts and service stations; full interior room simulation and bespoke bed/bath/eating animations are not implemented.

Town-local portions are separate from campaign scrap, cores and sealed water canisters. Initial pantry/water/materials/harvest stores are 420/420/120/220, with capacities 1200/1200/600/1000. Work must transform finite resources:

- Eat: 1 pantry + 0.2 water
- Wash: 0.65 water
- Garden: 0.35 water and 8 field units → 8 harvest
- Cook: 4 harvest + 0.8 water → 6 pantry
- Draw water: 12 aquifer units → 12 town water
- Recover materials: 4 salvage units → 4 materials
- Maintain a service: 1.5 materials; restorative care: 0.5 materials + 0.4 water

These are abstract life-simulation portions, not literal mass units. The bounded field, aquifer and recoverable-salvage pools recharge at 0.4, 0.8 and 0.045 units per active second, up to 800, 1200 and 600. This explicitly models local regrowth, water recharge and recoverable town discards. It is not connected to the regional farm, rainfall, freight or original food ledgers. Separate source and store ledgers account for initial quantities, recharge/production, extraction/consumption, donations and overflow. Accounting epochs rebase before bounded counters overflow; player spending never rebases or silently saturates.

## Player interventions

Actions require the named resident/service within 3.5 m, clear sight and an on-ground explorer with lowered staff. Costs are checked again by the authoritative action kernel.

- Water station: contribute one canister → 12 town water portions; shared 10-second donation cooldown
- Workshop: contribute two scrap → 12 materials; shared 10-second donation cooldown
- Selected damaged public service: two scrap → up to 40 condition and clear its temporary closure; condition must be at most 60, shared 20-second repair cooldown
- Meeting square: two scrap + one canister → a 60-second gathering; 90-second shared cooldown. Residents must still choose to attend, travel and spend time together
- Nearby resident: encouragement reduces stress and gives a small connection/desire nudge; 60-second per-resident cooldown

There are no inventory, renown or XP rewards. Counts, command revision and exact campaign costs reconcile. Repeating a packet or clicking with an old command revision cannot repeat a contribution. Donations cannot overflow the target stock. These interventions change local choices and capacity, but do not guarantee any particular story or a permanently happy town.

## Time, persistence and co-op

The life state has its own version-1 active-play simulation, using 0.5-second fixed steps and at most 120 steps per call. Existing causal clock history is not replayed. Normal solo gameplay advances it; solo conversations/menus pause it along with the world. Online rooms advance once on the server, continue during conversations and pause under the existing host-presence lease. Clients send only allowlisted target IDs, intervention kinds and expected intervention revision, never replacement needs, elapsed time, resources or resident poses.

Older regional saves remain valid without this field; enabling the town adds a fresh life state while retaining all old progress and ledgers. The first successful new save preserves exact pre-life bytes in an additional rollback checkpoint. Malformed present life data rejects rather than resetting. Normal autosave tracks life changes explicitly. Current actions, paths, reservations, relationships, desires, counters and ledgers survive save/reload. No offline catch-up or background play is introduced.

Renderer, physics-worker contact and server contact use the same current resident pose snapshot through the existing bounded soft crowd kernel. Snapshot identity is retained between actual resident changes. Actor-independent crowd work is cached, then actor clearance is applied to copies. Interaction range and sight use the same canonical displaced target on both solo and server paths. Online town presentation keeps moving while local menu controls pause. Large reconnect/background snapshot gaps resynchronize to authoritative poses instead of leaving invisible collision bodies ahead of slow visual catch-up. During ordinary steps, visible roots ease toward canonical positions, and this is soft kinematic crowd behavior rather than rigid-body NPC physics.

## Developer exposure

**Menu → Developer laboratory → Systems → Living town · needs, desires & resources** opens a completely disposable model. It accepts only the current seed and source revision; it cannot read/write campaign state, inventory, room credentials or conversation memory.

- Six typed, bounded applied settings: need decay 0.25–2×, activity pace 0.5–2×, walking pace 0.5–2×, company priority 0–2×, ambition priority 0–2× and input/output labor batch scale 0.5–2×
- Draft versus applied values, numeric entry, per-group/default reset, discard, explicit Apply and scenario reset
- All 100 selectable residents, staged six starting needs, actual source/resource/condition/queue inspection, fixed-step/run controls and a 1200-second disposable run limit
- Reproducible living morning, lean stores, cookshop interruption, social strain, immediate care and overwork scenarios
- Disposable interventions with finite test inventory and the production action kernel
- Strict versioned 24 KB preset import into a draft, and evidence containing build/source, seed, applied settings, scenario, elapsed model time, capped action history, relevant residents, resources and accounting. Text fallback remains available if copy/download is unavailable

Closing the model stops its timer and discards it. Normal co-op gates prohibit this local tuning tool. Campaign population remains 100; arbitrary facility-capacity edits, campaign time jumps, free resources and setting overrides in online snapshots are intentionally unsupported.

## Verification boundary

The publication receipt records the frozen source commit, exact safe test inventory, aggregate counts, both TypeScript checks, build and source/emitted CPU verification. Coverage includes long-run population/capacity/resource behavior, simultaneous critical needs with empty stores, availability and lease recovery, exact queue order, signed relationships, applied tuning, contribution conservation, save/reload, co-op retries and pause authority, developer isolation and actual Rapier source/emitted contact.

No browser/GPU/real-touch/device performance or rendered aesthetic validation was performed. The thirteen held regional food/clock files listed in EXPERIMENTAL-PREVIEW.md remain excluded; this update does not clear that review. The original V32 Site, original storage/rooms and original Library source remain untouched.

## V10 continuity and recorded evidence

Motion revision 2 removes redundant out-and-back home journeys, visibly interpolates the 0.5-second life updates, adds current crowd passing and service-exit yielding, and prevents ordinary visual lag from causing whole-crowd teleports. Existing life saves retain all progress and simplify a redundant clear-forecourt journey only on the next active step. Stationary activities now have distinct procedural poses. The square supports finite-cost maintenance coordination when the workshop is unavailable. Town → Record movement / view report records actual game-canvas images and bounded motion evidence locally; details and verification scope are in TOWN-CROWDS.md.

## V12 inhabited opening and continuing decisions

The production `createTownLifeOpening` factory creates a town already in the middle of its residents' lives. It uses the real utility chooser, supplied actions and capacity reservations, then deterministically seeds only new residents along their actual safe routes or at their reserved service slots. Current action phases are varied. Inputs for initial occupied activities are charged exactly once. Tick/cycle/fraction remain zero; no warmup ticks, production, completed actions, desire rewards or traveled-distance counters are invented. The cold `createTownLife` constructor remains a low-level fixture; production world enable, the shared engine factory and the balanced developer scenario use the inhabited opening. Present valid life saves never pass through it.

Life schedules retain the six personal timetable phases and professional shifts, with independent deterministic starting phases. Home chores, public work and public meetings compete with current needs; a work/meeting preference now rewards its appropriate public destination. Capacity demand includes reservations and occupants, rather than only already-queued people. The directory displays this actual life preference separately from the legacy fixed-routine lab.

A satisfied zero-input-cost home rest/leisure action may yield after its minimum commitment if the normal chooser prefers a supplied different public activity. This uses cancellation and replanning, without completion or ambition rewards. Paid meals, washing and production are not shortened, and critical needs still override schedules. Old synchronized home saves therefore recover through ordinary movement, retaining exact loaded positions, resources and progress. No save reset, elapsed-time replay, offline catchup or resident teleport is used. A retained save cannot be both position-identical and physically redistributed on its first frame.

Opening revision 1 and motion/behavior revision 3 are reported with the source revision. Existing state v1 and existing tuning preset formats remain accepted. Generated initial conditions and decisions are explicitly source-versioned; historical numerical output is not claimed to replay identically under a changed engine.

## V13 presentation boundary correction

Motion revision 4 changes only presentation timing and local diagnostics. The shared life authority, fixed-step rate, opening revision 1, save version 1, reservations, resources and autonomous decisions are unchanged. Slow frame callbacks no longer discard town display time; timestamped interpolation and bounded contact steps preserve ordinary walking across low/variable frame rates. Population report version 2 distinguishes small matrix changes from actual root walking and detects persistent display lag even when bodies still move. The online buffering tradeoff, frame-stall recovery, test boundaries and unchanged save guarantees are detailed in TOWN-CROWDS.md.

## V14 achieved activity and physical occupancy

The earlier logical life model could advance through other residents, start a paid activity when its mathematical path ended, and immediately reuse a released slot while its previous user still stood there. More than half of completed actions could choose the same facility again. An advancing timer therefore did not establish either achieved arrival or a visibly active town.

Motion revision 5 adds one authoritative navigation owner alongside the existing needs, utilities, resources and identity state. Ten bounded 0.05-second movement substeps serve each half-second life decision step. Static-town sweeps, resident spacing and authenticated explorer positions constrain achieved movement. Action inputs are charged only after achieved arrival; within-activity recovery and production time wait for the correct task point. Useful activities have fetch, work and put-away stages, each with a real reachable point. Rest, care, meals and conversations remain legitimate stationary activities. There is no arbitrary wandering added to satisfy a movement counter.

Public capacities now correspond to spaced personal work areas; household activities have accessible chore points. Admission checks actual bodies as well as logical reservations. Released occupants have a bounded departure route, and blocked approach diagnostics follow progress toward a stable goal rather than counting sideways motion as success. Unreachable or persistently blocked plans yield through ordinary cancellation/replanning, retaining the existing finite-resource rules.

The existing save version and all identity/household/needs/desire/relationship/ledger fields remain. A strictly validated optional navigation record stores bounded task stage, progress/blocking state, departure and accepted trajectory. A save without it is read unchanged. Its next ordinary active step adopts the movement owner continuously; already-paid legacy work keeps its remaining time, batch and consumed inputs while moving continuously to its equivalent reachable task point. Physically clear work within half a second of completion may finish at its original point. No load-time reset, offline catch-up, free production or position teleport is performed. Existing tuning controls retain real consumers: walking changes achieved speed, action pace changes work at a reached point, and resource settings retain their costs and caps.

The visible service grounds derive from the same task-point geometry. The existing Town movement report separates observed walking, progressing work with measured limb movement, rest, waiting, quiet stations and blocked residents. `bodyMatricesChanged` remains a compatibility field; breathing alone is never counted as meaningful work. All reports remain read-only, bounded and local, with explicit export and discard. Numerical checks do not certify the user's GPU, pixels, perceived activity or device performance.
