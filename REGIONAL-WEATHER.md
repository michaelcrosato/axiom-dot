# Regional rainfall and dry spells

This local procedural slice replaces the short collector rain loop for newly enabled regional supply ledgers. It drives real water input and downstream farm overflow through existing production reducers. It does not add rain particles, cloud rendering, storms that damage buildings, river flooding, or a replacement for the older field-garden ecology climate.

## Try it

Open `/system-workbench.html`, choose **Water · collector and residents**, **Regional · fronts and dry spells**, seed **73129**, target **Alder Waystation**, and Generate / reset. Run at 60× or use +60 seconds. The Weather card shows the current source-clock phase and next change; the inventory and residents show the actual consequences.

At this seed the opening rain lasts 187 active seconds, the main dry spell lasts 2,027 seconds, recovery starts at 2,214 seconds, and the season restarts at 2,500 seconds. Collected water is stored, carried, drunk or overflowed. The dry spell stops roof input, residents consume their real reserves, and thirst can reduce useful work. Recovery must refill the drinking tank before new overflow can irrigate the local farm.

Choose **Farming · overflow to meals** with Regional rainfall to inspect the same dependency. Its prerequisites are earned before the experiment begins, so the displayed weather uses total collector time, including the separately displayed setup time. The selected farm starts with no historical overflow reclaimed. Dry conditions stop new irrigation capture; finite saved water or a previously planted crop can continue briefly.

**Legacy rainfall** recreates the original 20-wet/10-dry-second collector model. A workbench change resets only a disposable scenario. It never changes a campaign or imports a campaign save.

## Save compatibility and access

`frontierSupply.version: 1` keeps the previous model exactly, including its saved counters, future timing and strict reconstruction. Existing supplied campaigns remain version 1; they are never silently converted. Their supplies panel identifies the legacy model and points to the disposable workbench.

Newly enabled supply ledgers use version 2, including fresh regional worlds and genuinely older regional worlds that have no supply ledger yet. Original/nonregional valley saves remain unchanged. The choice is owned by the ledger for all six collectors; building another collector in an existing version-1 campaign does not change that campaign's rainfall. To play version 2, open a fresh regional seed without an existing regional save. Do not overwrite an old world merely to try the weather; the workbench is the safe comparison path.

There is no in-place conversion in this slice. Historical overflow is part of the downstream food ledger's replay contract, so conversion requires a separately designed migration rather than relabeling an existing save. Imported older workbench reports omit the rainfall field and continue using version 1 with their original state fingerprints.

## Determinism, budget and authority

- A pure seed/position/tick function supplies rain intensity. No mutable random generator, persisted forecast, wall clock, background catch-up or renderer clock is introduced
- One bounded 10,000-quarter-tick season repeats: 160–220 seconds opening rain, 2,000–2,040 seconds dry, 160–220 seconds recovery and at least 20 final dry seconds. This is an intentionally compressed game climate, not an unbounded sequence of unique weather
- Six broad geographic exposure zones vary intensity while sharing seed-derived front timings. These footprints approximate climate exposure rather than exact terrain-biome borders. Existing biome-specific collector rates and tank capacities remain unchanged
- Rain intensity is 0, 0.5, 1, 1.5 or 2. Production tick t consumes weather index t−1. Potential input uses an exact bounded half-open interval integral
- Collector replay distinguishes model versions, and skips only repeated dynamics at the same weather phase. Its existing bounded replay budget remains enforced. The weather schedule cache holds at most 48 immutable seed/zone entries
- Food's source-history cache now distinguishes collector versions, and its repeated-state key includes source weather phase. These are narrowly scoped dependency changes; the held food terminal-clock review is not retried or cleared
- Solo accepted active ticks and the existing co-op room-owned clock remain authoritative. Four peers do not cause four rainfall updates. An absent host or closed world adds no time
- Water remains conserved as captured = stored + carried + consumed + spilled; potential roof input is not automatically captured. Food receives only eligible new overflow, without altering drinking storage

## Verification and remaining limits

New tests cover seed/zone variation, front boundaries, exact rain integrals, simulation step partitioning, old/new cache isolation, malformed version relabeling, legacy save continuity, drought/reserve exhaustion/recovery, production save parsing, co-op single-clock authority, and workbench report/worker replay. Existing physics, movement, terrain and action suites remain regression gates.

No denied browser, registry, or independent food-review route is retried. Numerical and non-rendering UI tests do not establish browser appearance, physical phone performance, or live network multiplayer behavior. This remains local implementation; the live Site and released source Library are not replaced, and the inherited food release-review hold remains in force. Exact final revision/check evidence is reported separately.
