# Versioned Hearthmere layout

This local implementation adds layout revision 3 for explicitly created regional worlds. `createRegionalState` remains the historical revision-2 constructor for compatibility fixtures; production new-world selection uses `createOrganicRegionalState`. A missing `townLayout` always selects legacy geometry. There is no in-place town migration.

## What changes

Forty homes keep their original IDs, home indices, names and 100 household assignments. Seven businesses keep their indices and finite trade stock. Seeded frontage spacing, setbacks and bending residential lanes replace rigid alignment in new worlds. A curved market frontage, outer residential loops and garden cross-links form a connected road network. Axis-aligned building footprints remain intentional: arbitrary rotation is unsupported by the existing box collider/navigation contract.

Public garden, square, well and paid-service work stations retain their proven positions and capacities. Moving the buildings does not move these open-air service stations. This bounded choice preserves town-supply, habitat-care and director interaction positions without changing any resource rules. Rear prop parcels remain outside resident work/egress space; crates cannot be dragged onto the resident network. The northern workshop parcel remains reserved.

## State and movement ownership

`State.townLayout` and inhabited `TownLifeState.townLayout` contain revision 3, recipe 1 and a deterministic geometry/road manifest hash. Validators reject unsupported revisions, recipes, extra fields, mismatched seed hashes and mismatched life/world identities. Property ordering does not affect identity. The unchanged finite trade ledger remains version 1.

Generation caches, regional-worker requests/results, streamed chunks, shop interactions, collision authority, crowd and matrix views, atlas and motion diagnostics resolve that same saved identity. A stale regional result from another layout is rejected. Legacy and new slots for the same numeric seed use separate keys; selecting an already occupied legacy seed resumes it. Reset retains the current slot's recipe. Imports do not silently regenerate buildings or resident positions.

Revision 3 routes use the generated road polylines and their real intersections, with short swept entrance/service approaches. Only collinear road segments are simplified. A clear line through a household forecourt cannot replace the road route. Existing achieved-motion avoidance, action-slot reservations, departure handling and rendered trajectory replay remain authoritative. Route geometry and approach caches are bounded and keyed by the immutable plan. Legacy routing remains unchanged.

## Player and developer controls

Choose an unused regional seed in Settings to create the new layout. Existing saved worlds stay available; the world list displays their town layout revision. Town → diagnostics shows the exact seed, layout identity, streets, entrances and households as copyable JSON. The atlas uses the selected plan.

Developer lab → Systems → Open disposable town scenario has a **Layout recipe** selector: 2 for legacy streets, 3 for new parcels. Seed is bounded to unsigned 32-bit integers. Changes remain drafts until **Reset scenario & population**; **Discard draft** restores the applied recipe, and **Reset draft defaults** stages legacy defaults. Reset replaces only the disposable routine/collision model, not the campaign. Export records the applied recipe and manifest; strict v2 legacy and v3 new-layout presets are supported. The scenario is a diagram/model; Visit real town returns to the actual current campaign, without applying the draft layout there.

For hands-on crate/ledge testing, use the separate isolated contact course described in [TOWN-CONTACT.md](TOWN-CONTACT.md). Layout scale, arbitrary road painting, house rotation and occupied-world regeneration are intentionally unsupported controls.

## Acceptance limits

Automated checks cover seeded reachability, every service/work-stage/egress point, legacy geometry hashes, save/reload, generation-worker identity changes, source/emitted worker and matrix integration, achieved resident journeys/work, and existing server authority/retry behavior. The exact final results and inventory are in `evidence/town-organic`.

Shared props, low climbs and ledge traversal remain disabled online; existing server movement and town simulation still resolve the correct layout. Browser/GPU aesthetics, touch ergonomics, performance and device acceptance have not been certified. Denied browser/registry routes were not retried. No held regional tests or food coupling changes, publication, deployment or Private Site changes are part of this work.
