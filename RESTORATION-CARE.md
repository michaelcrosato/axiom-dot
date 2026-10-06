# Restored habitats support Greenlight care

Restoration now supplies a real service at Hearthmere's existing Greenlight Apothecary. This is explicit transport: the three habitats are distant regional landmarks, not nearby town gardens. They give no passive town bonus. The owner carries finite recovered biomass back to the clinic.

## Player route

1. Open **Habitats → Collect habitat care · return it to Greenlight**, **Town → Greenlight apothecary · delivered habitat care**, or the Field tools entry. The board lists each actual dock, restoration condition, surplus and transfer gate. The existing atlas and restoration controls remain available.
2. Restore a habitat using the existing automaton. Every cell must have earned restoration and remain viable with at least 70 health. Beside its dock, collect **five biomass portions**. Every cell retains at least two; the shared host satchel holds at most ten. Old restoration completion alone cannot bypass current health, water, heat, smoke or contamination requirements.
3. Return to **Greenlight Apothecary in Hearthmere**. Its existing care station accepts the carried bundle if the clinic's separate stock can hold it, up to **20 portions**. Use nearby E/touch or the care board. Collection and delivery both require a living, grounded, standing explorer within 3.5 metres, a clear path and a lowered staff. In co-op the host manages this shared satchel and delivery stock.
4. Close solo menus and let the town work. A resident who chooses recovery must physically arrive at an available apothecary task point. Starting a supplied session consumes **one care portion**, alongside the ordinary **0.5 town materials and 0.4 town water**. During clear, achieved work, that patient gains **1.5× the normal energy, hygiene and comfort recovery**, capped at 100. Duration, path, task stages, other needs and stock production remain unchanged.

The board displays exported, carried, delivered, stocked and consumed amounts, plus active patients and their actual needs. Travel, queues, blockers, pauses and distant patients earn no treatment gain. If a session is interrupted, its used portion stays consumed; there is no refund or duplicate reward. The old dock suit repair and existing town offers still exist independently. No scrap, cores, renown, food or other inventory is minted by this connection.

## Persistence and authority

The optional `State.restorationCare` transfer receipt joins optional per-site `careExported` counters and `townLife.habitatCare`. Older saves with no connection fields retain their behavior. Present malformed or orphaned fields are rejected, not silently erased. Exports remain part of the restoration organic balance; they are distinct from local suit-repair sinks. Exactly:

    habitat biomass exported = host satchel + clinic received
    clinic received = stocked portions + consumed portions

Collection revisions, transfer revisions and existing server sequence/CAS receipts prevent duplicate debits or deliveries. Clinic usage occurs in the existing achieved-motion owner, including saved treatment latches. Existing resident identities, relationships, needs, task reservations and movement remain authoritative. No regional food, freight or weather ledger is coupled here.

## Repeatable developer scenarios

**Developer laboratory → Systems → Habitat care · delivery & recovery scenarios** is a disposable numerical model. Unopened demonstrates blocked collection; Restored runs real paid rig commands and bounded active ticks to earn a source; Delivered additionally collects and delivers through the production transfer kernel. Preparation uses a named finite test inventory, explicit model-only operator positioning, and no campaign data. The existing Overwork town scenario supplies all 100 ordinary residents; default seed 73129 reaches its first care session after about 63 active model seconds. The exact time is an observed scenario result, not a campaign promise.

The five existing restoration settings expose finite units, limits and consumers. Edits stage before Apply; seed/scenario changes require reset. Care packet size, capacity and multiplier are fixed. Manual steps are 1–60 seconds, capped at 1,200 per reset; preparation ticks are reported separately. Reset/discard, strict 4 KB presets, stale-file protection and text evidence export retain source, seed, intended/applied inputs, preparation commands, actions, balances and actual town state. The model never writes ordinary slots or shared rooms. Existing playable restoration practice still exercises real explorer movement; model placement does not claim physical travel.

Source/emitted engines, real worker and numerical Three checks, save roundtrips, and disposable HTTP/SQLite authority tests support this milestone. They do not establish browser pixels, GPU performance, touch behavior or device acceptance. The exact thirteen held food/clock test files remain untouched and excluded. Existing gateway-crate and fatigue-replay caveats remain. The original private Site, hosting/sharing settings and live saves are unchanged.

Next: connect non-food supply delivery to actual town demand, then unify playable guidance across construction, restoration and services.
