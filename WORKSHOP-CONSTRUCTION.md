# Paid campaign workshop construction

Hearthmere's workshop recipe editor now feeds one permanent campaign commission. The existing preview editor remains available separately. This is a bounded construction loop, not arbitrary placement, terrain editing, demolition, or a new currency.

## Play the loop

Open **Town → West workshop** or **Settings → Field tools → West workshop · construction & repairs**. Visit Hearthmere first if needed. Follow the west town lane north past the homes to the north-west parcel board at **x −226, z −193**. The approved building center is **x −226, z −200**, on the existing level town foundation. The board is also an ordinary nearby E / touch interaction.

Prepare the width, depth, rear rooms, hall depth, door width and finish seed. Apply the plan to inspect its real geometry and quote; Apply and preset import do not pay or build. Select an available existing resident, then explicitly commit shared town materials at the board. The compiler's finite material and labor quantities determine the quote. Materials come from the existing town store, replenished through actual local recovery or the existing two-scrap donation; regional food and weather are not coupled.

The assigned resident **prefabricates at Second Life Salvage's existing workbench**, using its actual reserved slot, travel, task stages and visible craft animation. This milestone does not send a second decorative worker to the new parcel. Construction earns work only while that resident has physically reached a clear work point. Travel, a blocked approach, an unavailable workshop and urgent personal recovery do not count. The assignment resumes through ordinary town steps when the resident is available. Solo panels pause the world: close the board to let the town work, then return to inspect progress. Online progression follows the existing host-presence authority.

The parcel has five visible paid phases derived only from saved achieved work: funded at zero; frame prefabrication after work begins; wall/panel finish at one third; fittings and finishes at two thirds; complete only at the full required work. Temporary timber sheathing, straps, roof coverings and wrapped fixtures visibly represent every reserved solid. The board shows the same phase, remaining work and five milestone markers. This is an on-site presentation of off-site prefabrication, not a claim that another worker is assembling the building locally.

Full collision is installed at acceptance, after overlap checks, and stays identical through all visual phases. Temporary representations occupy the exact original compiled envelopes; seams, braces and wraps add no solids and remain within those envelopes. No late wall or fixture can grow around a player or resident. The view remains withheld until the exact collision acknowledgement and reconstructs its phase directly after reload. Nearby roofs retain their established cutaway. Building appearance and device usability still require the owner's playtest.

After completion, the new board offers **up to 25 suit HP for four shared town materials**. Full-health players cannot spend stock. There is one building, no cancellation, demolition or refunds, and a bounded 1,000-service receipt capacity. This keeps duplicate clicks and retries from turning structural replacement into a resource source.

## State and authority

`State.workshopConstruction` is additive and absent in older worlds. `world.ts` owns campaign commands and progression; `town-life.ts` emits achieved-work receipts from its existing fixed-step activity owner. The 100 resident identities, needs, households, routines, reservations and navigation remain in the same town state. A construction receipt does not replace or independently move a resident.

Only the approved north-west parcel is allowed. Its complete grammar envelope is outside the entire accepted resident-navigation band, including saved paths, departure points, detours and traces. The approach from the west lane and every room use the compiler's real doorway gaps. Rendered boxes, local Rapier cells and server collision derive from the same compiled geometry.

Commands contain only bounded recipe inputs, a resident ID, the fixed parcel ID and an expected command revision. The server lets only the host commission the shared workshop and spend shared materials on its repair service. It checks accepted grounded position, reach, line of sight, existing stock and body clearance. Replays and stale commands cannot pay again. Suit repair applies to the requesting living actor. The existing room transaction, sequence receipt, retry and host-presence rules remain in force.

Snapshots validate the optional construction record, compiler quote, worker identity, progress, service counters and version before accepting it. Its total payment must match the permanent optional town material receipt, including after ordinary accounting rebases. Present malformed data is rejected rather than reset. Local saves track construction changes; reload regenerates identical geometry before physics becomes ready. Old worlds without the record retain their previous behavior.

## Developer exposure and evidence

**Developer laboratory → Systems → Campaign workshop · construction rehearsal** provides a disposable model with bounded recipe controls, staged Apply/default/discard, strict recipe preset text/file import, fresh opening/available-worker/material-shortage scenarios, seed/reset, explicit bounded time steps and exportable evidence. It cannot load campaign data or write normal save slots. The source/build, intended and applied setup, worker, achieved work, town balances and bounded action history are exported to a text fallback. The existing recipe preview remains an independent tool.

The source, emitted-model, Three matrix, actual Rapier worker and HTTP/SQLite checks are numerical/transport evidence. They do not establish browser pixels, GPU performance, touch behavior or device acceptance. The exact thirteen held food/clock test files documented in `EXPERIMENTAL-PREVIEW.md` remain excluded. Existing gateway-crate and fatigue replay caveats remain; no original Site, player saves, credentials, database bindings or sharing settings are changed.

The connected supply, restoration-care and Field Plan milestones are now available. See CAMPAIGN-LOOP.md for a consolidated player route and repeatable developer rehearsal. No held regional food coupling is implemented here.
