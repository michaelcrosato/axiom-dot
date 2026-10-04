# One-time emergency farm irrigation

Food model **version 2** adds one small, finite response to drought: a player can spend **one previously collected sealed water canister** at a started regional farm to put **all 4 L** into its irrigation cistern. Each farm permits this **once in its lifetime**. Three farms therefore permit at most three transfers. This is not a refill, renewable water source, new building, or new reward.

## Access and use

Fresh regional campaigns, and old regional campaigns that do not yet have a food ledger, now enable food v2. Existing food v1 saves keep their exact schema, 15 receipts and overflow-only production; opening or reloading them never upgrades them. There is no in-place migration. Use a fresh campaign or the separate disposable workbench to try v2; do not overwrite an old save to compare it.

In a v2 campaign, collect a real sealed canister, complete the destination freight store, start its farm, then visit the farm work point. Open **Regional farms** through the Journal, Play & world menu, or atlas. The farm panel shows the carried canister balance, one-use status, separately imported litres, rain overflow captured, water spent on crops, and overflow lost. The button says **Use one emergency canister · 4 L · once per garden**, with the opportunity cost explained before spending.

The whole 4 L must fit in the 6 L cistern, so its existing water must be at most 2 L. Missing inventory, an unstarted farm, insufficient space, an already-used transfer, old revision, distant position or airborne action leaves both inventory and farm unchanged. An accepted command debits one canister and adds four litres atomically. The same canister cannot also water the original valley gardens, supply household barter, or contribute to Mossbank’s three-canister delivery. Reloads, four-player races, repeated clicks and lost responses do not restore or duplicate it.

Drinking tanks, flasks, rainfall, source capture and spill histories are never edited. Imported crop water is separate from the existing rain-overflow ledger. Farm overflow capture can still be limited by real cistern space; rejected excess rain remains lost overflow. After the one-use emergency allowance is gone, the farm again waits for new real collector overflow when dry.

## Separate disposable workbench

Open `/system-workbench.html`, select **Farming**, choose **Emergency irrigation → Optional Food v2**, and **Generate / reset**. The existing food fixture earns its collectors and freight stores with ordinary production actions before the displayed scenario begins. It additionally moves to the first actual generated valley canister and performs the ordinary collect action. Its source ID and position are shown. These are explicitly earned setup prerequisites, not an inventory grant, and setup active seconds are separate from the displayed scenario clock. Player approach poses are model placements, not controller-traversal evidence.

The selected farm is already started by its ordinary production action. Press the emergency button manually. **Assist never spends the canister.** Selecting another system removes this optional choice. The integrated zero-start **Settlement** scenario stays unchanged and never receives a canister fixture. Existing Food, Water, Trade and Settlement report versions/fingerprints remain pinned.

CLI setup and read-only replay:

```sh
node --experimental-strip-types scripts/system-workbench.mts --system food --seed 73129 --rainfall regional --travel legacy --irrigation canister --seconds 0 --reload --output irrigation.json
node --experimental-strip-types scripts/system-workbench.mts --replay irrigation.json --reload
```

The CLI opt-in collects the fixture canister but does not spend it automatically; use the workbench action for that. Optional irrigation reports are explicit **report v3** with `irrigation: "canister"`, food v2 and the finite command event. Replay re-earns the prerequisites and re-executes actions. Snapshot display values are not imported as authoritative inventory. Unsupported version/config/action combinations reject.

## Bounded accounting and compatibility

- Food v1 exact keys and its original 15-receipt cap remain unchanged
- Food v2 requires each farm’s `waterIrrigated` to be exactly 0 or 4 and permits at most 18 receipts: three starts, twelve finite tending actions, three one-time irrigation actions
- `regionalFoodReceiptLimit(version)` supplies the version-aware limit; the pinned geometry plan remains v1, including its legacy budget, to preserve old fingerprints
- Every receipt records accepted tick, fractional remainder, target, command and revision. Independent farm replay must reconstruct its water and all downstream crops/meals; a saved counter alone cannot establish ownership
- The replay cache includes food, rainfall and freight model versions and the dependency/command histories
- The global world equation subtracts the validated irrigation receipt count alongside ecology, household and Mossbank costs. Retaining a spent canister or inventing an imported litre fails save validation

The once-per-farm restriction deliberately keeps this feature inside a small finite command history. Reusable emergency transfers would need a separately designed bounded checkpoint/receipt policy and an explicit new compatibility model; extending this cap is not part of this slice.

## Ordinary-clock evidence

Run the installed Node 22 runtime with:

```sh
node --experimental-strip-types scripts/verify-regional-irrigation.mts /tmp/axiom-irrigation-evidence
node --experimental-strip-types --test tests/regional-irrigation*.test.ts
```

For seed **73129**, the separate measured fixture earns all old prerequisites through **9,018 active setup seconds**, then begins the new food clock in a real regional dry period with **696 seconds until rain**. Over **400 active scenario seconds**, one treated farm and its untreated control share byte-identical collector and freight histories and the same weather:

- Treated: one canister spent, 4 L imported, 0 rain litres captured/lost, 4 L used, exactly two crops, eight harvested portions, eight delivered portions
- Nine meals consumed, including four separately counted starter portions; at least five consumed portions are harvested food
- Untreated: zero crops and harvest, four starter meals consumed, one canister retained
- First planting at 0.25 s, harvest at 46 s, real carrying at 48.75 s, unloading at 69.5 s, delivered harvest at 71.5 s, second harvest at 85.25 s, guaranteed harvested-food meal at 174.75 s
- Nine exact save/reload checkpoints; final food ledger 6,514 bytes and campaign save 23,167 bytes; a new process reproduces the saved bytes and rejects an unpaid canister

New tests also exhaust all 18 receipts without extending any log, reject forged version/receipt/water state, keep fractional ordinary clocks deterministic, preserve ecology/Mossbank competition, and exercise real four-player HTTP/SQLite compare-and-swap and identical lost-response retries. Literal-DOM and emitted-worker checks are numerical/contract coverage, not rendered approval.

This is a local implementation checkpoint. The inherited food terminal-clock review and release hold remain unchanged. No denied review was retried or performed under this feature; no browser/device QA, registry access, deployment, released archive replacement, or live campaign mutation was performed.
