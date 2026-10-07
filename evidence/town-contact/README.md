# Local town contact milestone

This is a partial implementation, based on `cdb067b47acdf2f86aa119f6a3e1a767708cf6ba`, with no commits or publication. The player guide is [TOWN-CONTACT.md](../../TOWN-CONTACT.md); remaining implementation work is specified by file in [NEXT-STEPS.md](NEXT-STEPS.md). [local-changes.patch](local-changes.patch) contains the local code, documentation and verification changes, excluding this evidence directory.

Fresh regional worlds receive three seeded rear work yards with saved, bounded physical crates, short steps and tall ledges. Existing contact push/pull/jump interactions are integrated with the added props; tall ledges support controlled reverse lowering into a supported hang. The isolated developer course exposes controls, reset, bounded tuning, blocked-action diagnostics and evidence export. Existing saves retain their occupied geometry. Shared traversal remains gated off.

The residential/business street grid is unchanged. This milestone does not complete the requested organic town layout, low-crate hand-climbing/controlled climb-down, or server-authoritative shared traversal. Model and emitted-runtime checks do not establish visual, browser or device acceptance.

## Validation result

- Both TypeScript projects and the production client/server build passed: [typecheck.txt](typecheck.txt), [build.txt](build.txt).
- Independent review's seven focused cases passed: [independent-review.json](independent-review.json), [TAP](independent-review.tap).
- Seven actual emitted Rapier-worker/Three-avatar cases passed: [emitted-contact.json](emitted-contact.json), [TAP](emitted-contact.json.tap).
- Emitted main/worker/render boundary, variable-frame timing, town-frame and source/emitted server/save checks passed: [main boundary](emitted-main-boundary.json), [town frames](emitted-town-frame.json), [server/save](emitted-server-save.json). These server checks validate preserved authority/retry paths, not newly implemented shared traversal.
- The permitted aggregate finished naturally after 2,454,020 ms: **1,911 passed, 2 failed, 0 cancelled, 0 skipped**, across 1,913 cases in 276 files. Its original output remains intact in [permitted-suite.tap](permitted-suite.tap).
- Both failures were outdated extraction/save fixtures. After the aggregate finished, only `tests/session-reset.test.ts` and `tests/startup-physics.test.ts` were corrected. Their complete files then passed **29/29**, with zero skipped/cancelled cases: [fixture-correction.tap](fixture-correction.tap). **A clean aggregate rerun has not been performed.**

## Reproducibility and frozen evidence

Use Node 22.23.0, prepending `/workspace/.cloud-tools/node-v22.23.0-linux-x64/bin` to PATH. The aggregate command was `taskset -c 0,1 node scripts/cloud/test-safe.mjs`; this selects permitted tests and excludes all 13 held files. The correction rerun was `node --experimental-strip-types --test tests/session-reset.test.ts tests/startup-physics.test.ts`. No force-exit was used.

[validation.json](validation.json) is the consolidated receipt. [final-registered-cases.json](final-registered-cases.json) records the exact permitted case-name inventory. [exact-case-comparison.json](exact-case-comparison.json) reconciles aggregate names and corrected failures; [baseline-inventory-comparison.json](baseline-inventory-comparison.json) confirms all 1,906 baseline cases remain, with seven additions. No held test was run or changed.

[frozen-source-hashes.json](frozen-source-hashes.json) records the final 648-file source snapshot. [aggregate-source-hashes.json](aggregate-source-hashes.json) preserves the aggregate's source versions. [freeze-reconciliation.json](freeze-reconciliation.json) explains the earlier verification-only fixture adjustments; production source remained unchanged after the build and throughout the aggregate. [local-change-receipt.json](local-change-receipt.json) records the patch hash and the two post-aggregate fixture changes. Emitted receipts identify actual bundle hashes.

Browser QA and registry routes were not retried. No hosting, privacy, network configuration or Private Site changes were made. No commit, push, PR, merge or deployment was performed.
