# Local organic town and contact continuation

Based on `cdb067b47acdf2f86aa119f6a3e1a767708cf6ba`. Local workspace changes only; no commit or publication. The earlier partial milestone and its failed aggregate remain preserved under `../town-contact`; those historical results are not the final acceptance record.

## Delivered behavior

New regional slots use a seeded, versioned town plan with bending residential roads, varied parcel setbacks, market frontage and connected garden/outer routes. All 100 residents retain their home/business identity. Existing occupied saves retain legacy geometry and their save slots; there is no silent migration. Save, worker, renderer, collision authority and diagnostics carry the same validated layout manifest. The public service forecourts remain fixed to preserve existing work/egress and interaction contracts.

Three bounded rear yards supply physical crates, steps and tall ledges. Solo movement supports push/pull, ordinary jump/land and step-down, supported 1.10 m crate hand-climb/down, and tall jump/catch/hang/pull-up/drop/reverse lowering. Actual collision/support and authored rig anchors govern movement. Hands, torso/head, landing boots and actor obstruction gates are checked; interrupted traversal returns to collision-controlled movement. The legacy 1.30 m survey crate remains push/pull/jump only because the authored hand path does not safely clear its edge.

The developer contact course is disposable and playable through the real controller, with reset, bounded movement tuning, blocked-action diagnostics and capped evidence export. The disposable town scenario stages seed/layout recipes and exports the actual manifest; it does not rebuild a campaign. See [player instructions](../../TOWN-CONTACT.md) and [layout/save design](../../TOWN-LAYOUT.md).

## Verification

**Clean final permitted aggregate: 1,925/1,925 passed; zero failed, skipped, cancelled or todo.** It finished naturally on frozen sources. [Validation receipt](validation.json), [exact case reconciliation](exact-case-comparison.json), [TAP](permitted-suite.tap). The frozen source snapshot is [frozen-source-hashes.json](frozen-source-hashes.json), and [final-registered-cases.json](final-registered-cases.json) records 1,925 cases in 277 permitted files. The runner excludes all 13 held files, executes normally without force exit, and is not a claim that excluded tests passed.

Both TypeScript projects and production client/server build passed: [typecheck](typecheck.txt), [build](build.txt). Independent review passed 21 focused layout/contact/UI cases, then 51 contact/context cases after clearance fixes; the final descent hint was separately source-reviewed. See [review receipt](independent-review.json) and [follow-up TAP](independent-contact-followup.tap).

Emitted receipts identify actual bundle hashes and numerical coverage. Final consolidated results are in [validation.json](validation.json). The aggregate TAP is `permitted-suite.tap`. [Local patch](local-changes.patch) and [patch hash](patch-receipt.json) provide the reviewable deliverable. All 653 frozen file hashes still match. The initial attempt exposed one outdated startup constructor-name fixture; its natural completion and narrow correction are retained separately in [first-run result](first-run-result.json) and [freeze reconciliation](freeze-reconciliation.json). All 1,906 baseline cases remain, with 19 additions.

## Limits

- Shared prop manipulation and contact traversal remain gated off online. Existing server authority, retries, room imports and layout identity are tested; new shared traversal is not implemented or certified.
- Numerical source/emitted worker and Three matrix/mesh tests do not certify pixels, aesthetics, touch ergonomics, device FPS or gamepad support. Browser/registry access denials were respected without retry or bypass.
- Axis-aligned box buildings remain; public service work positions intentionally remain fixed. Crates are confined to rear parcels and cannot obstruct resident streets.
- No held regional food coupling, hosting/privacy/network settings, or Private Site changes. No new downloads, commit, push, PR, merge or deployment.
