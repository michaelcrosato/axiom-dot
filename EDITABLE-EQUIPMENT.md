# Editable staff recipe contract

This increment exposes the existing equipment compiler as a genuinely editable, deliberately small recipe language. It does not add arbitrary axioms, scripting, free-form expression trees, geometry editing, new equipment families or a full general-purpose recipe-language editor.

## Supported player choices

Each of builds A and B has three independent selectors:

- Grip: linen or braced
- Shaft: reed, ash, alloy or ironwood
- Head: prism, fork, maul or crown

The compiler remains the source of socket compatibility and finite recipe budgets. Linen connects the light shaft/head standard; braced connects the heavy standard. Eight of the 32 selectable combinations compile. Incompatible combinations produce compiler constraint messages and cannot be equipped, compared or exported as a recipe. No silently substituted parts.

Changing a selector, seed, import target or pasted JSON clears prior preview, comparison and export eligibility. Preview recompiles both drafts. Seeds can suggest parts through explicit “Load seeded parts” / “Next seeded A” actions; ordinary seed editing does not overwrite player-selected parts. Previewing, comparing, importing and exporting never spend material or write the campaign. Only “Assemble & equip A” does so. Lab assembly changes only the disposable practice loadout. Existing measured movement runs keep their original survey-staff baseline.

The workbench displays the exact current refund, new cost and post-recycling inventory. Incoming co-op snapshots refresh this balance without discarding unsaved edits. Underbudget assembly is disabled in the UI and independently refused by the authoritative world reducer.

## Data-only API and identity

An authoring document is exactly:

```json
{"version":2,"seed":0,"parts":{"grip":"linen","shaft":"ash","head":"fork"}}
```

`validEquipmentRecipeInput` accepts only those own data keys, a uint32 seed and registered part IDs. It rejects arrays, unknown keys, prototype-derived keys, symbols and getters/accessors. `parseEquipmentRecipe` first enforces a 1024-byte UTF-8 bound, parses JSON, validates the whitelist, compiles socket/connectivity/budget constraints and returns a fresh canonical document. Neither stats, costs, hashes nor instructions are accepted as authority.

A saved custom ref is exactly `{version:2,seed,parts,recipeHash}`. `equipmentFor` revalidates the shape, recompiles the explicit parts and matches the recomputed hash before it can drive geometry, attacks or a refund. Legacy `{version:1,seed,recipeHash}` refs retain their original behavior. `compileEquipment(seed,spec)` is unchanged, including its legacy output shape. The authoring version is independent of the equipment pack version.

The equipment manifest remains `{framework:1,domain:'equipment',version:1,recipe:'resonant-staff@1',contentHash:'2c932107'}`. Registered axioms, compiler expressions, recipe hashes, existing seed plans, world generation and all unrelated manifests are untouched. A SHA-256 golden test over 128 complete original seed plans is `d0a29e38c06833ea2fd16d73199b0fc2b23af79cbc5ebfba79e3a66e845fd211`. The optional existing schema-6 equipment extension holds both ref versions; no migration, database/schema change or package change is required. Old saves without equipment round-trip without materializing it.

The previous release cannot load v2 refs. Before the first v2-equipped local save, `storeSession` preserves the last valid same-world v1/survey raw save at the immutable per-world `preEditedEquipmentKey`. It prefers the current slot, then its rolling backup, then the original-generation legacy alias/backup. `preEditedEquipmentSave` returns those exact original bytes for direct Blob export, independently of the older pre-overnight checkpoint. Repeated autosaves and restoring the survey staff cannot overwrite this checkpoint. If no prior compatible save exists, no backup is fabricated. Checkpoint quota failure or an invalid occupied checkpoint aborts before the active/rolling slots change. Settings exposes the exact-byte local pre-edited-staff export alongside the original pre-upgrade export. Both preserve the checkpoint bytes without parsing and reserializing.

## Assembly and shared authority

New command: `{type:'assemble-equipment',recipe:EquipmentRecipeInput}`. The existing `{type:'refit-equipment',seed:number|null}` remains supported, including restoring the survey staff with a full refund.

Both commands recycle exactly the currently owned assembly and pay the recompiled next cost. The world reducer validates alive/valley access, refuses invalid/underbudget input as a no-op, and returns the same state for an identical assembly. Only one owned assembly exists, with no duplicating stock, rewards or invented pump-repair contribution. Existing save and causal material conservation include custom equipment cost.

The HTTP validator enforces the exact new action shape and compiles its recipe before the reducer. The host alone manages the expedition's shared kit. Any connected actor's staff phase, buffer, stun, recovery/cancel lock or active guard blocks refitting. This is checked in command order and rechecked on every D1 compare-and-swap retry. Thus an attack committed by another concurrent request invalidates a pending kit change. The transport clones queued commands and retries lost replies with identical sequence/session/payload; no second material charge or duplicate event occurs.

`retireComboCommitment` drops an old hit and buffered chain while retaining paid stamina, regen delay, stun and the remaining original recovery/cancellation deadline. Server timeout, lease replacement, explicit leave and close use that retirement; guard interruption retains cooldown and receipts. Absent records cannot block the shared kit indefinitely because their old attacks are retired before the connected-actor gate excludes them. Returning actors retain their personal recovery lock and cannot immediately attack/guard with the new kit. The existing host clock-lease guard interruption remains intact; there is no offline catch-up or automatic stamina refill.

Solo and server zone transitions also use commitment-preserving retirement. This closes attack → enter → exit → assemble ordering that previously discarded the original attack deadline via a reset. Preview/import handlers are disposed on Close, navigation, remount and lab exit. File reads carry a revision token, so canceled/late reads cannot overwrite newer edits, reopen a panel or trigger assembly.

## Evidence and limits

- `tests/equipment-editor.test.ts`: golden original plans, all eight editable assemblies, whitelist/accessor/prototype/size injection, old/new refs, exact material conservation and save round trips for both world generations, real A/B model runs, actual production-rig meshes/two-hand sockets/range, real main-handler campaign/lab/online separation, lifecycle commitment retention
- `tests/equipment-ui.test.ts`: actual production DOM handlers for previews, edits, invalid seeds/socket mismatch, costs/refunds, repeated assembly/compare/export, bounded JSON paste/file import, pending-file races, Close/cancel/remount/navigation disposal, authoritative balance refresh and unsaved edits
- `tests/equipment-http.test.ts`: real TCP HTTP plus SQLite authority, host-only changes, injection rejection, repeated actions and lost-success retry, concurrent CAS recheck, global staff/guard locks, absent guest on long host-only resume, explicit leave/close → resume, and enter/exit ordered-action bypass
- `tests/equipment-rollback.test.ts`: exact immutable pre-v2 bytes beyond repeated autosaves, independent earlier rollback checkpoint, same-world/legacy fallback, no fabricated new-world backup, corrupted checkpoint handling and quota failure leaving the old slot intact
- Existing equipment and guard suites retain geometry/pose envelopes, all hit timing/range/wall checks, independent guard receipts/cooldowns and the original lab isolation checks

Strict TypeScript, full tests and client/server production build are release gates. Build output is local only; no hosting, commit, deployment, migration, credential or new service action is part of this increment. Browser screenshot/physical mobile/accessibility/performance claims are not established. One isolated local preview attempt was blocked with `net::ERR_BLOCKED_BY_CLIENT`; it was stopped without retry or alternate route. Numerical rig tests and the DOM-handler harness are not visual approval.

## Integration

Staged from guard candidate `dad171833c07ad5c70c9b3d52036c0f5869c1eb8`. The owner should merge the supplied patch into canonical only after review. Relevant overlap points are the main equipment panel/lifecycle hooks, shared combat retirement helper, server room authority/leave handling and the world equipment action union/case. Do not replace concurrently updated world/authority files wholesale; merge these hunks and rerun aggregate typecheck, tests and build.
