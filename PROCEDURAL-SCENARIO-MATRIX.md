# Bounded procedural regression matrix

`scripts/procedural-scenario-matrix.mts` runs disposable **production** workbench sessions. It is a repeatable numerical regression tool, not a new gameplay mechanic, seed success guarantee, live-save importer or release approval. Use the installed Node 22 runtime and dependencies. No downloads, browser, registry, network or deployment are needed.

## Run

```sh
node --experimental-strip-types scripts/procedural-scenario-matrix.mts --list
node --experimental-strip-types scripts/procedural-scenario-matrix.mts --output /tmp/axiom-matrix --budget-seconds 1800
node --experimental-strip-types scripts/procedural-scenario-matrix.mts --seeds 73129,42 --cases settlement-regional-regional,settlement-interrupted-resume --coverage cartesian --output /tmp/axiom-focused
node --experimental-strip-types scripts/procedural-scenario-matrix.mts --seed-count 20 --sample-seed 2802851878 --seconds 60 --output /tmp/axiom-short
```

The output folder must be new or empty; an old run is never silently overwritten. `--seconds` only shortens cases, in quarter-second increments. No case advances its scenario clock beyond 3,600 seconds. Food's separate earned-canister case normally runs 400 seconds.

The **default is 27 cases across 20 seeds**, rather than all 160 seed/case combinations. The first seed runs all eight cases. Remaining seeds rotate through the four baseline rain/freight combinations, five or six baseline runs per combination. Explicit `--coverage cartesian` runs the full selected cross-product. Maximum selection is 128 distinct uint32 seeds and eight cases, so plans and metadata remain finite.

Seeds start with the fixed anchors 73129, 0, 1, 42, 4294967295 and 2147483648. The tail is a deterministic 32-bit LCG with multiplier 1664525, increment 1013904223, and default sampling seed 2802851878. This samples varied procedural worlds; it does not prove every seed is valid or statistically representative. Exact selected seeds and stable versioned case IDs are in the summary. `--seeds` cannot be mixed with sample options.

## Cases and checks

| Case ID | Production recipe |
| --- | --- |
| `settlement-legacy-legacy` | Legacy rain and freight; assist once per active second |
| `settlement-legacy-regional` | Legacy collector rain, seeded weather-aware freight; independent choices |
| `settlement-regional-legacy` | Regional rain, historical constant-speed freight |
| `settlement-regional-regional` | Regional rain and weather-aware freight |
| `settlement-delayed-start` | Regional pair; first assist at 240 seconds |
| `settlement-quarter-staggered` | Regional pair; first assist at 0.75 s, then every 7.25 s |
| `settlement-interrupted-resume` | Regional pair; reconstruct report at 433.25 s, then continue exact action schedule |
| `food-earned-canister` | Separate optional Food v2, regional rain/legacy freight, one explicit earned 4 L transfer plus untreated control |

Each settlement starts with all three production clocks at zero, no staged construction materials, no captured water and no starter meals. Assist issues normal eligible production commands, waits for actual road blockage before repairing, and never supplies inventory. Farm start later grants four separately conserved production starter meals.

The tool records every normal production event through the workbench journal. Production conservation checks run on every quarter tick. The matrix additionally checks sampled inventory/actor finiteness, nonnegative inventory, road speed/wetness and repair-aware estimates. Its **maximum sampled finite balance error** is recorded separately from the production model's first-failing-tick evidence. Strict save/reload is checked at 600.25 seconds if reached and at the final state; the interruption case additionally reloads at 433.25 seconds. Every completed case must exactly replay its geometry, actions, checkpoints and final fingerprint.

Milestones are observation intervals, normally at most one simulated second wide, and are labeled with last-unobserved and first-observed seconds. They are not represented as exact production-event timestamps. Dry drinking-water shortage and later real rain recovery are recorded; the full seed-73129 regional/regional reference must demonstrate both and a harvested meal. Other seeds may legitimately remain short of prerequisites, rain, crop water, delivery or meals within one hour. Such outcomes are retained with their real final inventory and production causes; they do **not** become simulation failures merely because meals are absent.

The optional Food case actually collects its fixture canister through the production collect action, manually irrigates, then verifies a duplicate attempt cannot spend/import it twice. Assist is checked never to spend it. Its untreated control retains the earned canister; production weather and collector-overflow source stay matched. The 73129/400-second reference requires eight harvested portions in treatment and zero in control. The existing fixture earns 9,018 active prerequisite seconds for this seed, separately from the 400-second scenario clock. This finite setup is disclosed and repeated for control/replay; it is not free inventory, a zero-start settlement, terminal-clock exercise or controller traversal.

## Evidence, budgets and failures

- `summary.json`: selection, attempted/passed/failed/incomplete counts, pending case IDs, seeds with at least one passed case, outcomes, timing and scope
- `results.jsonl`: one completed result row at a time; results are not accumulated into an unbounded in-memory report
- `source-hashes.json`: SHA-256 hashes of local TypeScript production sources and the matrix tooling, alongside the source revision in the summary
- `reports/*.replay.json`: ordinary workbench reports; optional untreated control and partial/failure/actual-replay reports have explicit suffixes

Only the current session, optional control, latest inspectable report and bounded production caches/journals are kept while a case runs. A summary lists at most 1,024 planned jobs. No per-tick trace grows with duration. Reports keep the workbench's 128-event and 361-checkpoint limits. Artifact-write failure is a structured failure and never claims a missing file was saved.

The wall budget is **cooperative**, including setup and validation. A synchronous fixture, save validation or replay cannot be preempted; it may exceed the budget before the next check. Such an overrun is marked incomplete at the final boundary. SIGINT/SIGTERM are observed at event-loop yields and leave a partial recipe when possible. Do not interpret a partial result or missing validation as a pass. Exit codes: 0 complete/pass, 1 simulation/evidence failure, 2 invalid arguments, 3 incomplete/budget/signal.

Simulation accounting adds forward, control and explicit report-replay timeline seconds plus separately measured fixture clocks. It **excludes internal replay work inside strict save validation**. Both requested scenario windows and actual elapsed wall time are reported. Progress ETA is an empirical mean estimate, not a promised finish time.

Replay any saved recipe with the existing CLI:

```sh
node --experimental-strip-types scripts/system-workbench.mts --replay /tmp/axiom-matrix/reports/CASE.replay.json --reload
```

It can also be imported through the disposable workbench UI. Replay mismatches retain expected and actual reports and the earliest differing **sampled checkpoint** (ten active seconds apart), action-acceptance tick, or geometry boundary. This is not a claim to locate the earliest unsampled causal tick. A caught exception preserves the latest serializable report when possible; an action that threw before journaling may need the accompanying case/reason to investigate.

## Resilience and verification boundaries

Malformed exported system/view arrays now reject before replacing an existing UI session. Malformed worker **envelopes** reject pending work and terminate the uncertain worker, requiring Generate/reset; an uncertain action is not silently retried. This is envelope validation, not a new deep validator for every successful projection field. Non-rendering DOM/worker tests cover stale/duplicate replies, repeated clicks, interrupted imports, canceled exports and recovery.

Focused tests are `tests/procedural-scenario-matrix.test.ts` and `tests/system-workbench-protocol-resilience.test.ts`. The matrix tests include exact ordinary resume, partial budgets, artifact I/O failure and a deliberately altered checkpoint that must identify sampled tick 40. The held FOOD terminal-clock review remains untouched. Any wider regression run must explicitly exclude held terminal/clock-limit probes and disclose those exclusions; do not describe that subset as a full aggregate pass. No browser/device/rendered or release approval follows from these numerical checks.
