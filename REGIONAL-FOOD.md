# Regional farms and community meals

New food v2 campaigns also support [one-time emergency canister irrigation](REGIONAL-EMERGENCY-IRRIGATION.md): one earned 4 L canister per farm, with an explicit lifetime limit and separate accounting. Existing food v1 saves remain overflow-only and are never migrated. The original v1 design and measurement record follows.

This pack adds three small, renewable farm-to-store food loops to the existing regional world. It uses completed rain collectors and freight stores, without replacing their saves, reseeding the terrain, or changing the original valley garden recipes.

## Find and use a farm

Open **Journal → Regional food**, **Menu → Play & world → Regional farms**, or the **M** atlas. Visit the farm marker and inspect it with the existing **E / X** context action. Remote map and journal inspection is read-only.

Each local farm needs its existing outpost rain collector for irrigation and a completed destination freight store before activation. Complete those projects through their existing material and road-freight loops. A farm can be started while its collector is unfinished, but crops wait for real new overflow. The food panel explains missing prerequisites, water, crop progress, reserved goods, cargo, pantry stock, meals and the workers' current needs.

Starting the farm establishes a local cycle: recover new collector overflow, plant a seed, tend a crop, harvest, reserve a load, physically carry it to the nearby freight store, unload and eat. Four useful crop-tending requests per farm let the player speed up four distinct crops, earning one stewardship mark each. After all twelve marks are awarded, the crews continue planting, tending and harvesting without requiring more player input. This is a finite request set alongside renewable production.

## Water and food ownership

Drinking gets priority. Farms recover only water that newly spills from a completed collector because its drinking tank is full. They never drain the drinking reserve or the residents' flasks. The food upgrade records the current source clock and overflow as its baseline, so earlier discarded rainfall cannot be reclaimed retroactively.

Water has bounded storage and explicit overflow losses. A crop cannot grow without its real inputs. Harvested food moves through distinct source stock, loading reservation, carried cargo and destination stock. A meal is consumed only at the receiving pantry, reducing the finite food balance and the worker's hunger. Seed return comes from the actual harvested crop, keeping the seed stock bounded rather than silently restocking it.

Activating a farm brings two reusable seed portions and four packed starter rations to its completed pantry. The starter food is a one-time, explicit ledger entry, separate from harvested output. Reloading, opening a menu, returning from a distant chunk and rejoining an online room do not refill them. Food is a separate commodity from raw building materials, biomass, repair gel, salvage and water canisters. Existing trade deposits stay finite.

## People, routes and scope

Each loop has stable, named food-worker identities. Their hunger changes actual garden or pantry work, and meals restore useful productivity. They are separate from the original collector residents, so nobody is shown working at two locations at once. Hunger never kills a resident or permanently prevents recovery.

The carrier follows a real, terrain-supported local approach to the existing freight store. Loading and unloading take active time; stock is reserved exactly once before departure. The same route-distance state drives simulation and nearby presentation. Distant workers retain their goods and position without requiring all regional chunks to remain loaded. These are local distribution loops; inter-settlement food freight remains outside this pack.

Fields, work points and routes use clear areas of existing settlement pads. No new solid buildings or collision envelopes are introduced. Existing stores, collectors, roads, shelters, physical terrain and harvest IDs remain authoritative. Food meshes require acknowledged visible ground; the pantry presentation also waits for the matching store acknowledgment.

## Save and multiplayer boundaries

The optional food overlay upgrades regional worlds only, preserving old collector construction, freight cargo/reserves and original garden progress. The first local save preserves the exact pre-food bytes separately from rolling autosaves. **Menu → Advanced → Older recovery checkpoints → Export pre-regional-food save** exports that retained checkpoint when one exists.

Food uses active simulation time. Solo menus, the isolated lab and background tabs pause it. Online rooms may continue behind an open panel while the accepted shared room clock advances, but absent-host/disconnected time never creates offline catch-up. New clients cannot supply arbitrary water, stock, crop progress, meals, rewards or actor positions. Grounded reach and current command revision are checked again by the authority; authenticated input receipts and database compare-and-swap handle four-player races and lost responses.

Malformed present food state is rejected rather than replaced with a fresh allocation. Save validation checks the external water and store histories as well as the food ledger. A retained freight baseline and bounded, shared-clock command/rebase witnesses prove that the receiving store was already complete when its farm was activated; a later completed-store snapshot cannot be used to backdate food. The inherited V31 supply clock has a finite maximum; this pack does not manufacture fresh water beyond that source clock. At the separate food clock limit of one billion quarter-second ticks (about 7.9 active years), its last conserved snapshot is explicitly paused and no further food action or meal occurs; independently valid freight can continue. Shared integer subsecond arithmetic keeps legacy clock phases aligned without changing saved whole ticks, goods or construction progress.

## Repeatable verification and limits

**Developer lab → Regional food loop** runs disposable worlds and never receives live campaign state or browser storage. Tests cover the ordinary production model, real HTTP/SQLite transport, compiled production Worker and actual emitted physics worker on generated farm approaches.

The previous localhost browser denial remains respected. No alternate browser/proxy, deployed-Site navigation or refused backend-archive route is used. Numerical geometry, executed UI contracts and controller tests do not establish rendered desktop/mobile quality, actual phone performance or live internet multiplayer latency. Those remain unverified.

### Recorded verification

The integrated production measurement passed on the checksum-verified Node 22.23.0 runtime:

- Six complete-loop seeds passed; the repeat-three default run retained all conserved inputs and outputs across thirteen saved checkpoints per run
- Each default farm completed seven harvests, then continued after all four stewardship requests were exhausted; the shared finite request pool finished after 140 active seconds in the disposable scenario
- A separate one-hour active run produced twenty harvests and seventy consumed meals per farm, retaining two seed portions. Each farm's four starter rations remained separately accounted
- Food state peaked at 7,751 bytes in the repeat-three run. Mean one-second model update was about 2.34 ms in this server run; this is not a device/frame-rate benchmark
- A fresh process accepted the one-hour save byte-for-byte and rejected invented water; cold parsing took about 1.08 seconds in that run
- The six-seed geometry sweep checked 4,408 positions with at least 20 mm standing clearance and zero authored terrain-height error
- The emitted production movement worker traversed all three local routes and approaches, both old collector envelopes, chunk crossings and saved unload/revisit. All sampled positions were grounded; maximum support error was 3.4 mm and residency peaked at nine terrain cells

The full project suite, type checks and compiled-Worker delivery checks are recorded separately for the frozen source revision. The first integrated aggregate retained twenty failed harness assumptions about the added panel/view dependency; the original assertions were preserved while their fixtures were extended. The shared clock precision repair also updates two frame-partition assertions to account explicitly for subnanosecond quantization, with identical completed work and goods still required.

This is a local implementation checkpoint. Publication and replacement of the released source archive are held while independent confirmation of the final terminal-state continuation fix remains unavailable. Browser/device appearance and live internet multiplayer remain unverified.
