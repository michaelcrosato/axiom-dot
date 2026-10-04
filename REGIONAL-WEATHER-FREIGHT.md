# Weather-aware regional freight

This slice lets rain slow freight on the existing roads and lets dry spells restore walking speed. It adds no route destruction, new obstacles, rerouting, vehicles, terrain changes, rain particles or unlimited resources. The original finite deposits, crews, reservations, construction costs and withdrawals remain the same.

## Try it safely

Open `/system-workbench.html`, choose **Trade · source to freight store**, seed **73129**, and **Freight travel model → Regional · rain-soaked roads and drying**, then **Generate / reset**. Start the disposable scenario, watch wetness and route speed, and repair the freight bed before expecting a delivery estimate. Run or step through the opening rain and the following dry period to see speed recover. Compare **Legacy · constant-speed freight** by resetting the disposable scenario. The **Settlement** scenario can use either freight rule as well.

The separate **Rainfall model** choice controls collectors, not freight. The two ledgers use their own accepted active clocks and can start at different times. They sample the same seeded climate schedule but are not a promise of one synchronized visual storm across previously created ledgers. Workbench resets, reports and replay never import or change a campaign.

In the game, open **Journal → Regional freight + construction**, **Menu → Play & world → Resource sites**, or a freight marker on the **M** atlas. Inspection is read-only. Each route identifies its saved rule, current road wetness, route walking speed and recovery behavior. A stationary carrier is still labeled loading, blocked, unloading or waiting; the displayed road speed is the speed available when walking, not a claim that the stopped actor is moving.

## Compatibility and access

- `frontierTrade.version: 1` retains constant 1.8 m/s movement and the original replay rules
- Newly enabled freight uses version 2, including fresh regional worlds and older regional worlds with no freight ledger
- Existing freight ledgers are never silently converted. Loading, inspecting, repairing or constructing in a version-1 save does not opt it into weather
- To play the new rule in a campaign, use a fresh regional world without an existing save. Do not overwrite an old world merely to compare weather; the disposable workbench is the safe comparison path
- This slice contains no in-place migration. Original/nonregional worlds and prior terrain, roads, save recovery and resource ownership stay unchanged
- Freight timing and collector rainfall have independent saved versions. Selecting either rule in a workbench report records that explicit choice; older reports without a freight-travel field retain legacy timing

## Bounded road rule

Each immutable route samples climate once at its surface-distance midpoint. That sample applies to the whole corridor. It is a deliberately small deterministic approximation, not a point-by-point soil simulation or dynamic pathfinder.

The climate comes from the existing pure regional weather module: a seed-derived repeating 2,500-active-second season with shared front timing and geographic intensity. During precipitation, road wetness is set to half the local intensity. When rain ends, every completed 30 active dry seconds removes 25 percentage points of wetness, clamped at zero. New precipitation sets the corresponding wetness again.

Walking speed is `1.8 × (1 − wetness / 2)` m/s, between 0.9 and 1.8 m/s. Both loaded outbound carriers and empty returning carriers use it. Quarter-tick movement is integrated in integer micrometres. Forecasts integrate the same future wet, drying and dry intervals as authoritative movement, rather than dividing remaining metres by today's speed.

The dry-road baseline shown for a complete route is the existing route length divided by 1.8 m/s. It is explicitly labeled as a baseline. An active delivery estimate is different: it runs through the predicted arrival and unloading, using active simulation time. No arrival estimate is shown while the freight bed remains unrepaired, even if its repair crew has started. Loading has no predicted arrival yet; empty returns do not display an incoming delivery countdown.

The clock remains owned by the production reducer and existing multiplayer authority. Solo pause, hidden/background handling and closed-world behavior do not invent road drying or freight progress. Rendering consumes the accepted scalar distance and current movement speed; interpolation stays on the canonical path. A stopped authoritative pose may finish a small outstanding visual interpolation at its last moving rate, without changing transport or goods.

## Verification and limits

UI contracts cover explicit saved-rule labels in panels, journal and map details; wet/drying/dry copy and numeric speed; no migration on inspection; repair-required versus arrival ETA; included unloading; empty returns; command revision checks; focus/disclosure retention; and read-only snapshots. Numerical Three.js checks cover wet and dry-recovery speed boundaries, settled stops, canonical-route interpolation, acknowledged terrain/solid residency and unchanged authority. Existing main-loop tests cover menu pause, online presentation and interaction gates. Model, replay, conservation and workbench checks are recorded with the final-source evidence separately.

This is local implementation. No browser/device visual verification was performed: the prior browser access restriction remains respected. Numerical geometry and literal-DOM tests do not establish rendered appearance, phone ergonomics, frame rate or live internet multiplayer quality. No Site deployment, released source replacement or live save was changed. The inherited food release-review hold remains in force; these UI and freight changes do not clear it.
