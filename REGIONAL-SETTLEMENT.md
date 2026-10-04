# Regional settlement workbench

The **Settlement** production system runs the existing freight, water and food models together in one disposable, bounded workbench scenario. Its only target is **Alder–Pine settlement**, index `0`. It is available through `/system-workbench.html` and `scripts/system-workbench.mts`.

This is a local model checkpoint. It does not load or change a campaign save, start multiplayer, publish a Site or replace a released source archive. The inherited food release-review hold remains in force.

## Initial conditions

- All production clocks and the displayed workbench clock begin at zero; `setupSeconds` is zero
- Two existing freight routes and their stores, one collector and one farm are unstarted
- No setup material, stored water or food is granted, and no historic discarded overflow is recovered
- Finite deposits, reserve limits, route geometry, carrying capacity, production and construction work, unloading and food reducers are unchanged. Regional travel applies the production model’s version-2 weather-dependent movement speed; Legacy preserves historical constant-speed freight
- Action approach poses are model placements. Residents, carriers and farm actors use their authoritative production positions; no player-controller walk or collision claim is made

The remaining regional ledgers are production dependencies, not additional settlement tasks. The workbench exposes only this settlement’s target-specific commands.

## Run the production chain

In the browser, select **Settlement**, choose a seed, rainfall model and freight travel model, then **Generate / reset**. Inspect **Settlement work & causes** for the two freight routes, collector and farm. Each enabled button identifies its production target; disabled buttons explain which prerequisite is missing.

1. Start **Alder Quarry** and **Pinewatch Deadwood Depot**, the two finite freight sources
2. Observe carriers reaching damaged roads, then repair the obstruction and let them traverse the remaining real production paths and unload
3. Build **Pinewatch Freight Store** and **Alder Freight Store** using ordinary delivered stock and construction time
4. Withdraw finite reserves and deliver **4 wood and 3 stone** to the **Alder Waystation** collector. Partial deliveries are allowed; the collector build waits for the full cost
5. Build the collector and let residents finish construction, capture rain and drink
6. Start **Alder Garden** as soon as its local freight store is complete. This can precede collector completion; the crop still waits for real new overflow. Tend eligible crops
7. Follow new collector overflow into crop water, growth, harvest, carried food, pantry stock and meals

Use the regular clock controls. Every active tick remains 0.25 seconds. Hidden tabs pause without catching up, and the scenario stops at one active hour. Rainfall and freight travel are independent explicit choices: new UI/CLI scenarios use Regional for both; Legacy remains available for historical behavior. Regional roads use a fixed midpoint corridor exposure to seeded weather. Rain sets wetness and slows travel to 0.9–1.8 m/s; each completed 30 dry active seconds removes a quarter of wetness. This bounded corridor approximation does not add route geometry or point-by-point moisture. The Freight travel card shows each route’s current speed and condition, and an arrival estimate only when repair no longer blocks delivery. Pausing does not dry roads. The local weather card is a read-only projection of the collector’s production weather at the same active clock.

Farm start itself supplies **four separately conserved starter meals** through the production reducer. They are neither harvested food nor a fixture grant. A report with four meals does not establish harvested-food consumption: that requires `meals > 4` and matching conservation checks. A run can legitimately wait on a freight prerequisite, rain, overflow, crop work or delivery; elapsed time alone is not evidence of completion.

## Headless recipe

Use the already-installed dependencies and Node 22.23.0:

```sh
node --experimental-strip-types scripts/system-workbench.mts --system settlement --seed 73129 --index 0 --rainfall regional --travel regional --view route --seconds 3600 --assist --reload --output settlement.json
node --experimental-strip-types scripts/system-workbench.mts --replay settlement.json --reload
```

`--assist` checks eligible commands once per simulated second. It delays road repair until the loaded carrier is actually blocked, so the obstruction remains observable, and starts the farm as soon as its local freight store is ready. Independent work can overlap; the numbered explanation above is not a strict serial script. It executes the same target-specific production-start, repair, store-build, reserve-withdrawal, material-delivery, collector-build, farm-start and crop-tending actions that the UI exposes, at the actual current production tick. It does not accelerate production or manufacture prerequisites. Without assistance, actions remain manual and the settlement can stay unstarted or blocked.

CLI output includes the combined named inventory, each selected system’s cause, local weather, per-route wetness/speed/repair-aware ETA, and conservation result. The report additionally retains the combined exact ledger, numbered actor positions, action timeline, geometry fingerprint and periodic state fingerprints. The one-hour bound also applies to headless runs.

## Reports, geometry and verification

Settlement uses report **version 2**, with explicit `domain`, `targetId` and `action` for accepted or rejected production actions. For example, starting Alder Quarry with seed 73129 records `domain: "trade"`, `targetId: "region:1:73129/trade/0/source"` and `action: "start-source"`; the UI passes its corresponding `trade/region:1:73129/trade/0/source/start-source` ID unchanged. Collector actions use target `region:1:73129/site/0`, and Alder Garden uses `region:1:73129/food/1` for that seed. Parsing rejects unsupported targets and invalid timelines; replay reconstructs the empty fixture and applies the recorded commands at their recorded ticks. It does not import arbitrary campaign state. Existing Water, Trade and Food reports stay version 1, retaining their legacy configuration and fingerprint compatibility. A missing `travel` config field always selects version-1 freight; `travel: "regional"` selects version 2. Explicit Legacy selection normalizes to an absent field. Derived freight-condition projections are not imported as state or added to old snapshots.

The route view shows the two freight routes and collector/farm paths without generating terrain chunks. The chunk view compiles exactly one chosen production chunk. The settlement view remains a 64 × 64 m window with at most four intersecting production chunks. Distant prerequisites do not expand that terrain window into a regional renderer.

### Historical constant-speed reference

For seed **73129**, Regional rainfall, **Legacy travel** and the assisted **3,600-active-second** run, the verified production inventory contains **36 harvested portions**, **30 eaten meals** and **4 production starter meals**. Thus at least **26 eaten portions are harvested food**, independently exposed as `harvestedMealsMinimum`. All conservation checks and the strict save round-trip pass, with zero initial setup time.

The historical route-view recipe (add `--travel legacy`) has final state fingerprint **`b3960d09`** and exact report replay. Both freight paths measure **573.270558 m**, travelled at **1.8 m/s**. Measured active-clock milestones are:

- Stone/timber reservation: **16 / 20 s**; loaded travel: **19 / 23 s**
- Actual damaged-road stops: **114.75 / 118.75 s**; repairs finish: **127 / 131 s**
- First deliveries: **353 / 357 s**; freight stores finish: **369 / 373 s**
- Garden starts at **373 s**, with four production starter portions and zero crop water
- Later stone/timber reserves are withdrawn at **996 / 1,000 s**; collector construction starts at **1,000 s** and finishes at **1,027 s**
- The completed collector remains in an actual drinking-water drought shortage. Recovery rain first captures at **2,214.25 s**, residents first drink at **2,231 s**, and only later does new overflow start at **2,305.5 s**
- First crop is planted at **2,309.75 s**, harvested at **2,369.75 s**, delivered at **2,398.5 s**, and produces the first guaranteed harvested meal at **2,400.5 s**

These are production-clock times, not a scheduled time shortcut. There is no one-hour claim for every seed: seeds and rainfall change the observed readiness. Four production starter meals remain explicitly included in the total 30 meals.

`node --experimental-strip-types scripts/verify-settlement-workbench.mts /tmp/settlement-evidence --travel legacy` reproduces this historical recipe, strict save/reload at fifteen active stages, a final exact replay, and a deliberately altered checkpoint that must identify sampled tick **160** as its earliest difference. Stages cover both freight loads/transits/unloads/store builds, collector construction, growing, harvesting, food loading/transit/unloading and eating delivered harvested food. It writes `settlement-report.json` and `settlement-measurements.json` without accepting a live state or save input.

The reference run has **18 target events**, **361 bounded fingerprints**, **22,678 final campaign-save bytes**, **about 30.5 KB of compact report JSON**, and no terrain chunks in route view. The measurement report also records sampled payload maxima. Its maximum conservation error is about **1.43 × 10⁻¹⁴**, below the **10⁻⁵** check threshold. The ordinary compiled-workbench verifier includes explicit legacy and regional travel scenarios plus actual emitted-worker target actions and full one-hour settlement replay parity. These are numerical model results, not rendered or release approval.

Non-rendering DOM tests check selection, one-target handling, empty-at-zero copy, causes, unchanged action-ID forwarding, repeated-click protection, report replay and returning to older systems. Model, CLI and compiled-worker verification are tracked separately against the final source. These checks do not establish rendered quality, graphics execution, traversal, phone ergonomics, device performance or release approval. Previously denied browser/registry-download routes and the held food terminal-clock review are not invoked or bypassed.


### Weather-aware full-loop verification

`node --experimental-strip-types scripts/verify-settlement-workbench.mts /tmp/settlement-weather-evidence` selects Regional rainfall and Regional travel and starts all three clocks at zero. It executes the same assisted quarter-second chain for 3,600 active seconds, observes wet/drying/dry road conditions and slower wet-road movement, checks strict reloads in each road condition plus the fifteen production stages, and requires real harvested-food consumption. It verifies exact report replay and the deliberate earliest-difference probe at tick 160. Add `--travel legacy` to compare the historical run above without changing geometry or any non-travel production rule.

For the same **73129** seed, the Regional-travel run finishes with fingerprint **`28f357e8`**, **36 harvested portions**, **30 total meals** and **26 guaranteed harvested meals**. Both existing paths remain **573.270558 m**. Their measured movement-speed range is **0.9–1.8 m/s**, and maximum wetness is **1**. The weather-aware milestones differ while the recipe remains identical:

- Damaged-road stops: **210.25 / 214.25 s**; repairs finish: **223 / 227 s**
- First deliveries: **469.25 / 471.75 s**; freight stores finish: **486 / 488 s**
- Garden starts at **488 s**; finite material reserves are withdrawn at **1,113 / 1,115 s**
- Collector starts at **1,115 s** and finishes at **1,142 s**
- The collector is still ready before drought recovery, so first rain capture (**2,214.25 s**), first drinking (**2,231 s**), overflow (**2,305.5 s**) and the first guaranteed harvested meal (**2,400.5 s**) remain unchanged in this seed

The measured Regional run retains **18 events**, **361 checkpoints**, **22,678 final save bytes** and **about 30.9 KB of compact report JSON**. Its three road-condition reloads occur at ticks **1**, **748** and **1,228**, in addition to the fifteen production-stage reloads. Maximum conservation error is about **1.43 × 10⁻¹⁴**. No one-hour guarantee is made for other seeds.

The evidence files identify the travel rule and measured route speed/wetness range separately from dry nominal speed. Per-route causes and repair-required ETAs remain inspectable throughout the genuine from-zero chain. These bounded numerical runs are model evidence only; they do not lift the inherited food release gate or establish rendering, controller traversal or device performance.
