# Regional resource sites and freight

This optional regional overlay connects finite quarry and forestry work to road freight and useful construction. It preserves the existing landscape, roads, landmarks, wilderness gathering, six rainwater collectors and their progress. It is a small modular freight system, not a complete market economy. Farms are not part of this pack.

## Play the first loop

Use a **10 km² frontier** and open **Journal → Regional freight + construction**, or **Menu → Play & world → Resource sites**. The **M** atlas shows resource sites, freight stores, damaged freight beds, canonical routes and live carrier cargo. Selecting any marker is read-only; work requires the local E / X interaction point.

1. Follow the west trail to **Alder Quarry**, beside Alder Waystation. Its outlined work area becomes a solid stock station only when you start the crew and the footprint is clear
2. The crew processes its separate, finite 12-unit stone seam. Four units move from available stock into a loading reservation, then into Mara's visible cargo
3. Mara walks the existing road to **Pinewatch Freight Store**. New freight ledgers use weather-aware speed, from 0.9 m/s on fully wet roads to the 1.8 m/s dry baseline; existing legacy freight ledgers retain constant 1.8 m/s timing. The marked eroded freight bed is safe for unladen walkers but prevents heavy freight from continuing until repaired. Visit its work point and start the 12-second crew repair. Cargo remains with the carrier throughout
4. Four units arrive only after the carrier reaches the destination and unloads. Visit the freight-store point and start its 16-second construction. The delivered units become the store itself
5. Store completion raises receiving capacity from 4 to 12 units. The carrier can then deliver the remaining eight units over further real trips
6. At the completed store, **Take delivered building supplies** transfers the currently delivered reserve into shared carried raw stone. Pinewatch's forestry route supplies raw wood the same way. These resources can fund the existing rainwater-collector projects, including actual resident construction and drinking

The default seed's Alder–Pinewatch route is about 573 m, with a **dry-road baseline** of 5 min 19 sec of uninterrupted one-way walking, plus extraction/loading/unloading and any repair wait. The Redstone–Northreach route is about 2,693 m, with a dry-road baseline of 24 min 56 sec one way. Wet travel takes longer. The map, journal and panels identify the saved travel rule, actual route metres, current route walking speed, wetness and dry recovery. Once the freight bed is repaired, an outbound shipment's delivery estimate follows the seeded future speed changes and includes unloading. Before repair completes there is no delivery ETA; returning empty is not presented as an incoming delivery. There is no remote transport speed multiplier. Sprinting explorers can reach a repair site before their carrier.

See [REGIONAL-WEATHER-FREIGHT.md](REGIONAL-WEATHER-FREIGHT.md) for the bounded wet-road rule, safe workbench comparison and compatibility details.

All actions retain the existing E / X context slot. A jump, B hold-crouch and Y attack keep their positions; the left movement thumb and camera gestures are unchanged. Solo menus and backgrounding pause the simulation. Online rooms retain their shared clock and may continue while a panel is open.

## Modular plan and finite ownership

Three source-template records define geography, material, finite deposit, storage capacity and production duration: meadow surface-seam quarry, pine deadwood depot and redstone cutting quarry. Stable named IDs derive from the preserved regional seed. A bounded free-sector search places work areas on existing reserved landmark pads, outside roads, old shelters, collector footprints and other new work areas. No terrain or wilderness source is reseeded.

The new seam and surveyed fallen-timber deposits are separate from the original loose-stone/deadwood gathering sources. They do not replenish or credit the wilderness harvest ledger. Each route has twelve units, and its ledger proves:

`deposit = unextracted + source stock + reserved + carried + destination stock + store construction + withdrawn`

Withdrawn is lifetime transferred freight, not a second stockpile. Carried raw supplies are lifetime wilderness harvest plus lifetime withdrawn freight minus all collector allocations. Cargo or stock still at a work site cannot be spent as player inventory. Withdrawal, loading, unloading and construction never grant scrap, water, renown or a repeatable reward. An exhausted site stays exhausted. A store can be built only once; previously completed collectors are never reset or recharged.

The destination reserve is usable for remaining collector projects. If all collectors are already complete, it remains finite carried building stock; this pack does not invent new crafting demand, sell it for unlimited rewards, or claim an open-ended economy.

## Routes, crews and physical scope

Carrier movement follows sampled access legs and the existing graded road/bridge graph. The same scalar route distance drives remote progress and nearby presentation. Full-height controller checks sample the real generated ground and solids; visible carriers interpolate along route corners, never directly between distant positions. Presentation consumes authoritative current speed at weather boundaries. When authority stops, any short remaining visual interpolation uses its last moving rate to reach that committed stop; it cannot advance cargo or delivery. Returning carriers are empty and use the same weather rule. Visible online freight continues animating while menus pause local controls. A background/reconnect discontinuity discards the stale render-only projection and resumes at the accepted route position; this does not accelerate transport or deliver goods early. Source workers, builders and road workers retain stable identities and waiting positions before and after their work.

The damaged freight bed is a shallow visual ground condition, deliberately passable by the player. It is not a solid cart or boulder. Its repaired state removes the rut overlay and releases the freight restriction. New source and freight-store solids require explicit activation. Solo and server checks reject activation around the explorer, other retained online explorers or the saved survey crate. Construction formwork and finished stores use identical collider envelopes.

Only nearby actors and work areas allocate render objects. Carrier presentation also requires acknowledged local terrain. Changed solid geometry appears only after its terrain cell acknowledges the exact envelope. Unload, save/reload and return remove presentation residency without discarding goods or progress. Crews are kinematic presentations of the authoritative model, not additional Rapier rigid bodies.

## Save and multiplayer authority

`frontierTrade` is an optional versioned field. Existing regional worlds opt in without moving the player or changing generation identity. Original and connected-valley flavors stay unchanged. The first upgraded local save retains the exact earlier bytes separately from rolling backups. **Menu → Advanced → Older recovery checkpoints → Export pre-regional-freight save** exports that copy. A malformed checkpoint or failed write stops the outgoing save.

Newly enabled freight ledgers use `frontierTrade.version: 2`, including fresh regional worlds and genuinely older regional worlds with no freight ledger. Existing version-1 freight retains its original constant-speed timing and strict replay. Opening a save, building another store, or selecting a map marker does not convert it. There is no in-place migration in this slice. For a safe weather comparison, use **System Workbench → Trade → Freight travel model**; its model choice resets only a disposable scenario. To play weather-aware freight in the campaign, use a fresh regional world without an existing save rather than overwriting a saved world to try it. Freight and collector rainfall versions are independent.

Commands carry a current trade revision. Extremely old imported clocks are rebased using a proven finite-work drain horizon: only quiescent gaps are removed, preserving goods, route distance and remaining work duration. This prevents a stalled freight job from becoming permanently stuck at the numeric clock limit. The pre-existing collector clock is unchanged. Immutable strict validation replays the bounded finite event history to reject invented reserves, cargo, delivery, construction, withdrawal or progress. The server checks accepted grounded position, clear reach and physical footprints. Existing authenticated HTTP transport, D1 compare-and-swap and input sequence replay keep shared claims exactly once across four players. The room advances the freight clock once, capped at one second per accepted update; disconnected/closed time does not create catch-up.

## Repeatable verification

**Developer lab → Regional freight loop** retains its legacy constant-speed disposable production-model worlds, including extraction, reservation, obstruction, repair, delivery, construction and reserve-funded collector use. **System Workbench** compares the legacy and weather-aware rules separately. Neither inspects or mutates a live campaign. Source tests additionally run the compiled production physics worker along all three actual routes, through source and builder approaches, past all six existing collectors and against new stores before/after completion, unloading and saved revisit.

Final measurements and source fingerprints are recorded in `evidence/regional-trade-report.json`; aggregate, TypeScript, build and compiled-Worker checks are recorded beside it. Tests use the existing checksum-verified official Node 22.23.0 runtime. The earlier Node 24 native runtime failures are retained historical evidence, not a fixed issue or a new diagnostic task.

The prior cloud-browser localhost denial remains respected. No alternate browser, proxy or production-Site navigation is used to evade it. Numerical geometry, compiled-controller, DOM-contract and SQLite checks do not establish rendered browser quality, real-phone ergonomics, device frame rate or internet multiplayer latency. Those remain unverified.

### Historical original-freight verification

The following measurements record the original constant-speed freight implementation, not a new weather-aware aggregate or release approval. Current weather-freight checks are described in [REGIONAL-WEATHER-FREIGHT.md](REGIONAL-WEATHER-FREIGHT.md); exact final-source results are recorded separately.

- 1,044/1,044 aggregate project tests passed with no skipped tests
- Both browser and server TypeScript configurations passed
- Eight complete-loop seeds and six terrain/solid sweep seeds passed; the geometry sweep covered 14,153 positions with at least 20 mm clearance
- The compiled production physics worker traversed all three complete default-seed roads: 143,909 samples, all grounded, maximum surface-support error 11.7 mm and a peak of nine resident terrain cells
- The disposable model retained all 36 finite units. Its maximum trade ledger was 2,280 bytes and mean tick cost was about 0.022 ms in this server run; this is not a device or frame-rate benchmark
- Eight withdrawn wood and eight withdrawn stone funded a real 4-wood/3-stone collector, finishing after 15 further active seconds. Four wood and five stone remained; duplicate withdrawal was rejected and wilderness harvesting was unchanged
- Four-player authenticated HTTP/SQLite tests cover source, construction, repair, withdrawal and collector-allocation races, input replay, absent-host pause and retained-player/crate footprint protection

The first integrated aggregate retained three failed fixture assumptions about the added view dependency and outer upgrade call; they were updated without removing the original checks. A later measurement retained its obsolete max-clock-saturation assertion before being updated for the deliberate rebase behavior. Independent review also prompted an online-menu carrier presentation fix, background/reconnect reconciliation and a deeply immutable tiny-dt rebase return. Their regressions are retained. Build and exact-commit release verification are performed separately after the measured source is frozen, avoiding a circular self-hash in this document.
