# Town supply validation

Source, tests, scripts and configuration were frozen at `c491fd95f6adc9c7f34a33679f56cc748dc479ce`. The later evidence commit adds only this directory.

- `validation.json`: exact scope, commands, results and limits.
- `registered-cases.json`, `permitted-suite.tap`: registration-only inventory and complete final test log.
- `independent-review.json`, `exact-case-comparison.json`, `independent-scope.json`: independent source/freeze/held-file and exact-case checks.
- `frozen-source-hashes.json`: all 711 tracked hashes at the tested commit.
- `emitted-*.json`: actual supply/town/construction/restoration engines, Three matrices, Rapier worker, disposable HTTP/SQLite and production main-handler boundary.
- Development TAP and independent counterfactual evidence distinguish fail-before regressions from final frozen results.
- `typecheck.txt`, `build.txt`: complete compile/build transcripts.

All 1,807 permitted cases passed across 255 files, with zero failures, cancellations, skips or todos. Exactly 13 held files remain excluded and unchanged. Browser/GPU/touch/device acceptance is not established. Temporary paths in original reports identify capture locations; retained artifacts are here.

See [TOWN-SUPPLY.md](../../TOWN-SUPPLY.md) for the player route, costs, persistent receipts, developer scenarios and limits.
