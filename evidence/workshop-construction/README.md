# Workshop construction validation

Gameplay, tests, build scripts and configuration were frozen at `1b16eec2a68477698e2810a3f2975b6899868a76` before the final permitted suite. The subsequent evidence commit changes only this directory.

- `validation.json`: scope, commands, outcomes and superseded candidate failures.
- `registered-cases.json` and `permitted-suite.tap`: registration-only catalog and complete final execution log.
- `exact-case-comparison.json` and `independent-review.json`: independent case-name, exclusion, source-hash and source-review checks.
- `frozen-source-hashes.json`: all 648 tracked files at the tested commit.
- `emitted-*.json`: actual built engine, Three matrix, Rapier worker, save and HTTP/SQLite evidence.
- `typecheck.txt`, `build.txt`, `corrected-harnesses.tap`: build and targeted harness results.

All 1,743 permitted tests passed. The exact 13 held food/clock files remain excluded, unchanged and outside this claim. Numerical and transport evidence does not establish browser/GPU/device visual acceptance. The main boundary probe runs the complete production source handler with real emitted worker/view artifacts; it does not run the entire emitted browser startup.

Player entry points and limits are documented in [WORKSHOP-CONSTRUCTION.md](../../WORKSHOP-CONSTRUCTION.md).
