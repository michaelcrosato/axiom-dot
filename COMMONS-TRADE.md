# Household water barter

## Scope and consequence

This optional increment trades one actual expedition canister (4 L) for one existing piece of communal NPC repair scrap. It creates no goods, treasury, currency or replenishment. The seeded communal stock remains the original 2–4 pieces, with at most four lifetime exchanges and fewer if builders spend stock first.

An offer requires the acting player alive in the valley and within the existing 3.5 m three-dimensional interaction range of the correct household flag, a household reserve strictly below 6 L, a whole carried canister, and at least one remaining communal material. It calls the existing causal water-delivery reducer. Household reserve, consumption-supported work and any previously accepted water job therefore receive the same real delivery/contribution as a donation. The old `waterRestored` quest and its payment are not changed.

Trading can leave builders without the material needed to repair a workshop. The player can spend their acquired scrap on a different project or later pay for that workshop themselves. This is a small consequential barter system, not a general market or historical simulation.

## API and activation

- `enableCommonsTrade(state)` attaches `state.causal.commonsTrade` only when the property is absent in a generation-2 causal world
- It snapshots present communal stock, NPC repair spending and player water-delivery totals; past donations are not rewarded
- Present malformed data, including null, is not replaced
- Solo old saves remain byte-compatible without activation; parsing does not silently attach this pack
- Room create, join/resume and advance activate absent data, including zero-time first commands
- Action: `{type:'commons-trade', command:{type:'water-for-scrap', settlementId, expectedRevision}}`
- `expectedRevision` is the number of accepted exchanges, an integer from 0 through 4. Simulation ticks do not consume it. A successful transaction increments it exactly once; stale commands are no-ops

The atomic reducer returns causal state plus canonical inventory together. Each receipt has a stable sequential identity, causal time, settlement identity, before-state water/material checkpoints and explicit reciprocal water/scrap debit-credit amounts. It stores at most four receipts.

## Conservation and validation

The optional ledger extends, rather than replaces, the existing ledgers:

- Original NPC materials = live communal materials + actual NPC repair spending + validated scrap exports
- Canonical collected player scrap + validated exports = player inventory + machine, equipment, cave, bridge, workshop and causal costs + any original quest payment
- Each barter canister is included in the existing causal player-water spending and actual household-delivery totals

The standalone receipt validator rejects malformed data before world context arithmetic can derive any export credit. It validates activation baselines, fixed amounts, exact fields, identity/order, bounded revision, monotonic checkpoints, demand and local water conservation. Canonical inventory maximum and original-pump-payment inference incorporate only validated exports. Full causal validation additionally checks the existing household, workshop, material and water ledgers.

Foundation world IDs, generation manifests, initial material generation, CAUSAL_HASH (`1c9730fb`), ECONOMY_HASH (`688b09cb`) and ECOLOGY_HASH (`deb39020`) are unchanged. Existing recycling records are untouched.

## UI integration

Settings and the Living frontier navigation open a dedicated Household barter panel. `mountCommonsTradeSection(container, {state, act})` displays current household demand, communal stock, the workshop-repair opportunity cost, exact reducer-gated exchange buttons and factual sentences generated only from committed receipts. The main handler dispatches through the existing solo/room action boundary and refreshes on authoritative online snapshots. It uses no timers or local inventory predictions. An old callback carries its original revision, so repeated clicks cannot pay twice. The panel states that solo menus pause time and online menus do not. Repeated online snapshot refreshes retain expanded exchange history and a still-enabled keyboard target. Settings import now also distinguishes a successful local write from a session-only import when browser storage fails.

Normal solo initialization/restore and room initialization activate only the absent optional pack. Before the first local save containing the pack, session storage preserves the last valid same-world pack-free save as an immutable pre-barter checkpoint. Its raw bytes are exportable from Settings without parsing or reserializing. This checkpoint can contain the previous release's valid edited staff. Quota failure or an invalid occupied checkpoint aborts before active/rolling save slots change. Worlds created without a prior compatible slot do not fabricate a rollback.

The world-systems lab adds a disposable seed-1 counterfactual. In the control, a real builder spends communal scrap repairing a workshop. Two actual exchanges remove that same stock, leaving the workshop broken; the player then spends the transferred scrap repairing it and actual service resumes. The fixed seed is named explicitly; the current campaign never changes.

## Verification

New tests cover real ownership and 4 L delivery, accepted-job contribution/one-time renown, workshop repair starvation and subsequent player repair with real water-supported service, precise actor/zone/demand/stock gates, old absent bytes, late initialization, malformed receipts, all original quest payment paths, combined kit/recycling/bridge/garden costs, the full four-exchange ceiling, carried scrap beyond the old pickup-only ceiling, and snapshot-only UI callbacks.

The HTTP tests use real Node sockets and SQLite compare-and-swap, with two and four authenticated players, a deliberately held losing commit, server retry against the winning revision, stale action and sequence replays, persistence/resume, zero-time activation, malformed durable records, and guest-specific physical range. A nearby host cannot authorize an out-of-range guest to barter.

The isolated module and integration gates use typechecking, production compilation, real reducer/DOM-handler tests and loopback HTTP/SQLite. Browser inspection remains blocked by the prior preview access denial. No alternate browser route or retry is allowed; source, numerical and DOM checks are not visual approval. There is no new migration, package, service or access grant.
