# Procedural systems coverage and remaining boundaries

Audited against the original 17-domain framework brief and the actual preview source, not old README absence statements. The original document calls itself an architecture proposal and explicitly says a finite language cannot express every new behavior. Coverage below means a bounded production implementation in this playable frontier, not every conceivable content variant or an unrestricted engine.

| Domain | Playable bounded coverage | Principal source |
|---|---|---|
| Geology | Six seeded terrain regions, shared sampled surfaces, finite physical rock/resource catalogs | regional-world, valley, wilderness |
| Water and climate | River/cave stores and route changes, weather/dry spells, rain collectors; new conservative shallow fields and mixtures | cave-water, regional-weather, waterworks, habitat-fields |
| Vegetation | Seeded plants/trees, finite gardens; new water/contamination/heat/smoke-dependent plant recovery and scent-guided pollination | ecology, regional-world, restoration |
| Settlements | Connected valley, regional projects, 100-resident Hearthmere with real needs and capacity | settlement, starting-town, town-life |
| Roads | Shared regional trails/crossings, traversable routes and actual freight obstruction/repair | regional-routes, regional-trade |
| Buildings | Connected workshops, 40 town homes/seven businesses, actual doorway geometry; editable constrained recipe authoring and one paid campaign workshop commission | building, starting-town, workshop-authoring, workshop-construction |
| Caves | Separate natural cave, conservative flood routes, finite paid controls | natural-cave, cave-water, cave-supply |
| Dungeons | Seeded connected objective graphs, encounters, persistent caches and exits | dungeon-plan, encounters |
| Bodies | Humanoid and quadruped families; new editable neutral body/support/shell/organ graph with genuine behavior and shared collision | avatar, body, restoration-body/view/collision |
| Equipment | Paid modular staff composition and reversible constrained refits | equipment, equipment-combat |
| Abilities | Committed staff/guard timelines; new data-only pump/filter/vent/beacon abilities with real costs, timing and counterconditions | combat, guard, utility-ability |
| Agents | Needs, goals, jobs, local relationships; bounded reactive enemies and routed neutral utility behavior | causal, town-life, encounters, restoration |
| Crowds | 100 persistent residents, movement/contact budgets, measured trajectories and repeatable capture | town-crowd, town-life-runtime, town-motion-diagnostics |
| Economy | Finite shops, barter, production, freight, farming; new conserved restoration parts/consumables/biomass service | economy, commons-trade, regional-trade/food, restoration |
| Jobs/events | Existing founding and recurring water/work requests; new feasible town director with permanent bounded causal outcomes | causal, water-requests, town-director |
| Culture/history | Stable names/households/backstories/relations, contextual branching dialogue; factual request/contribution histories | town-residents, npc-conversation, town-director |
| Graphics/audio | Procedural shared geometry, bounded instancing, synthesis; new field/body/scent/utility projections | audio, regional-view, restoration-view |

## Newly closed implementation gaps

1. Persistent feasible town events beyond independent founding/water/wear rules
2. Actual bounded workshop parameter authoring, including constraint/cost/connection and real capsule-clearance evidence
3. Read-only sanitized save-difference and structured causal-history inspection
4. Player-editable neutral body/organ composition and reusable attachment/work/fluid interfaces
5. Generated utility actions with real source/target, finite costs and interruption semantics
6. Conservative contamination, heat, smoke and scent fields with gameplay consumers
7. Habitat restoration, scent-directed pollination and finite recovery-backed service
8. Relevant dormant→active lifecycle, full-body route/deployment/contact safeguards, and repeatable real-explorer plus numerical testing surfaces

## What does not require a new engine rewrite here

The world remains ±1,581.14 m. Float32 spacing at that magnitude is approximately 0.000122 m, well below the current 0.02 m controller skin. Existing inward-rounded perimeter checks and measured bounded traversal remain. Origin rebasing is not needed for this fixed 10 km² world; it becomes a requirement before materially greater coordinate scale.

The active workload is bounded: 49 terrain chunks, at most 128 physical owner cells/16,384 cell colliders, 100 half-second residents, bounded 16-neighbor crowd queries, and now three tiny field graphs/one configured rig. Domain state already has one reducer writer and the online world advances once per authority tick. Render-only distance and dormant habitat state avoid needless work. A generic packed ECS, universal aggregate-to-individual transfer system, or moving all domain reducers into the physics worker would be architecture changes without evidence they improve this bounded workload. They are not represented as implemented, and larger workloads still require profiling first.

Persistence uses the existing validated, recoverable local adapter with exact backups/epochs and separate server room transactions. The brief allows a browser persistence adapter such as IndexedDB; changing storage technology is not required to add these systems safely. Cross-device solo cloud sync remains a separate product feature.

Unbounded construction, imported executable packs, arbitrary body families/evolution, full thermodynamics/chemistry/river CFD, or a continent are broader future content/scale expansions, not missing checkboxes required for the original finite integrated test valley. This update adds the missing supported behaviors without promising universal composition.

## Genuine unresolved gates

- The separately denied regional-food/terminal-clock independent review remains incomplete. The thirteen named held files are still excluded. No tests are renamed or substituted to perform that review.
- Town-local needs/resources remain independent from regional food/weather. Coupling those held ledgers is not part of this update and is not silently claimed complete.
- Browser/GPU/device, touch and visual-quality verification remain unavailable under the existing scoped denials. Numerical Three/Rapier tests and builds cannot clear them.
- The original V32 Site, canonical source checkout, Library source, live saves and existing online rooms are not modified. This is the same owner-private experimental preview with preview-only storage and AXIOM_PREVIEW_DB.

The exact final frozen-source case inventory, exclusions, test results, emitted parity, source commit and successful private deployment accompany the publication receipt. Earlier focused or working-tree results are not a substitute for that final gate.

## Campaign construction milestone

The bounded recipe editor now drives one paid, persistent Hearthmere commission with actual resident prefabrication, protected access, shared render/collision geometry and a finite material-funded suit-repair service. See WORKSHOP-CONSTRUCTION.md. Construction is intentionally confined to an approved level parcel; arbitrary terrain/placement/interiors and held regional-food ledger integration remain outside this milestone.
