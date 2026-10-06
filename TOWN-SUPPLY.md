# Valley salvage supplies Hearthmere

The valley's existing finite scrap caches can now be earmarked for town construction and services. This uses the ordinary two-scrap donation recipe at Second Life Salvage: **two real scrap become twelve town materials**. There is no new currency or replenishing pickup source, and loading cargo alone earns no town stock.

## Player route

Open **Town → Town supply · haul salvage to Second Life** or the corresponding Field tools entry. The board shows actual remaining cache locations and distances, the shared four-scrap delivery pack, Second Life Salvage's destination, town material stock and the workshop construction quote or completed repair-service cost. The existing map and construction board remain available.

Walk to a listed scrap cache and explicitly load one piece. Loading claims the same canonical pickup as ordinary collection, so it cannot be collected twice. Carry at most four. Return to Second Life Salvage in Hearthmere and deliver two at a time. Each accepted delivery uses the existing donation cooldown and store capacity; the town receives twelve materials immediately available to the construction commission, maintenance and other existing material consumers. An accepted town material-shortage request recognizes the same real donation through its existing contribution proof, without extra renown. The physical return matters: intent, opening the board and selecting a destination award nothing.

A single leftover can be unloaded into the ordinary field inventory at the workshop. Unloading returns exactly one scrap and grants no town material. The source remains collected. Older worlds with exhausted caches keep ordinary inventory donation and the residents' existing finite-source material recovery; this feature does not respawn resources. Scrap is shared with existing repairs, equipment and manufacturing, so choosing to deliver it is a real allocation.

Campaign and shared-room commands require a living, grounded, standing explorer in the valley, near the actual cache or workshop, with clear access and the staff lowered. The host manages the shared delivery pack online. The board shows blocked reasons, actual capacity and donation cooldown. Existing residents keep their identities, routines, needs, navigation and achieved-work rules.

## Conservation and persistence

The optional `State.townSupply` records source IDs, carried pieces, unloaded pieces and two-piece deliveries. `townLife.supplyDeliveries` is a matching permanent receipt. Exactly:

    loaded source pieces = carried + unloaded + 2 × deliveries
    command revision = loaded source pieces + unloaded + deliveries

Every loaded source is an ordinary collected tombstone. Only current cargo is an additional canonical scrap cost: unloaded pieces are already in inventory, and delivered pieces are already charged by the normal `townLife.playerSpent` ledger. Historical pump inference and recoverable-resource checks use the same ownership. Save validation rejects malformed, orphaned, duplicated or inconsistent receipts. Old saves without these optional fields retain their behavior. Host sequence and transaction receipts, command revisions and shared pickup tombstones protect retries and competing collection.

The loop does not alter wilderness wood/stone, regional freight, food or weather accounting. Those stocks are separate systems. No automatic delivery, new NPC courier owner, infinite resource grant or remote construction credit is introduced.

## Developer rehearsal and limits

**Developer laboratory → Systems → Town supply · finite cargo scenarios** runs disposable production models with bounded setup, reset, strict presets and text evidence export. Scenarios expose finite sources, loading, delivery, shortage and exhaustion. Explicit model placement is identified as such; it is not evidence of physical player traversal. Cargo capacity, conversion rate and receipt limits remain fixed. The model does not write campaign slots or rooms.

The milestone's evidence covers source and emitted models, save validation, authority transport, existing achieved worker behavior and numerical geometry/physics checks. Browser pixels, touch, GPU performance and device visual acceptance remain for the owner's playtest. The exact thirteen held test files remain excluded, and the existing gateway-crate and fatigue-replay caveats remain. No private Site, live save, hosting or sharing settings are changed.

Next: unify playable guidance across construction, restoration, supplies and services.
