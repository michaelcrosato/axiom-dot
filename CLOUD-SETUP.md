# AXIOM cloud development setup

This repository contains the AXIOM experimental-preview source. See `SOURCE-PROVENANCE.json` for the precise imported source commit, export exclusions and source-file checksums. The import is a source backup and development starting point, not a deployment or hardware upgrade.

## Runtime

Use **Node 22.23.0**, matching `.nvmrc`. Keep `package-lock.json` and install its exact dependency versions. The existing project documentation records intermittent native V8/WebAssembly failures with Node 24.19.0; do not treat a Node 24 environment from another project as verified for AXIOM. The setup scripts check the runtime and stop instead of installing another one or changing system configuration.

The stack is TypeScript, Vite, Three.js and Rapier. Rust is not required by the current source-build workflow. CPU, RAM and disk capacity depend on the chosen coding environment. GPU rendering occurs in the browser running the game; a GitHub repository or a larger build container does not guarantee a capable browser GPU or faster device rendering.

## Install and start

From the repository root, with Node 22.23.0 already selected:

```sh
bash scripts/cloud/install.sh
bash scripts/cloud/start.sh
```

The install script runs `npm ci`. It requires authorized network access to the existing lockfile's package sources and can run dependency lifecycle scripts. It does not install a runtime, alter credentials, or provision hosting. If package access is restricted, stop and resolve that restriction through the approved environment setup rather than changing routes or regenerating the lockfile.

The start script launches Vite bound to `127.0.0.1`. Use the coding environment's authorized private port-forwarding or preview feature to open its reported URL. A browser is needed to play; starting Vite does not itself verify graphics, WebGPU/WebGL2 support, touch input or device performance.

Plain Vite supports solo play and the local review pages. It does not create the production online-co-op service. Co-op requires the Worker runtime, authenticated Site access and the dedicated `AXIOM_PREVIEW_DB` D1 binding. Database migrations in this repository are schema only; they contain no live saves or rooms.

## Validation without running held cases

After installation, the compile/build checks are:

```sh
npm run typecheck
npm run build
```

Both TypeScript projects are included in `typecheck`. The build creates browser assets in `dist/client/` and a Worker in `dist/server/`. These generated outputs are excluded from the source import.

Where this test execution is authorized, use the bounded-scope file selection:

```sh
node scripts/cloud/test-safe.mjs
```

This runner requires Node 22.23.0, checks the exact exclusion list against `EXPERIMENTAL-PREVIEW.md`, and excludes all 13 inherited held files. It does not replace or clear their outstanding review. Do **not** run the legacy `npm test` command or the unfiltered `tests/*.test.ts` glob while these holds remain: they include those files. No GitHub Actions workflow or automatic test job is added by this import.

The held files are:

- `tests/ecology.test.ts`
- `tests/regional-clock-precision.test.ts`
- `tests/regional-food-trade-witness.test.ts`
- `tests/regional-food-world-authority.test.ts`
- `tests/regional-food.test.ts`
- `tests/regional-supply.test.ts`
- `tests/regional-trade-integration.test.ts`
- `tests/regional-trade-timeline.test.ts`
- `tests/regional-trade.test.ts`
- `tests/regional-weather-cold.test.ts`
- `tests/regional-weather-trade-authority.test.ts`
- `tests/regional-weather-trade.test.ts`
- `tests/regional-weather.test.ts`

Numerical, worker and non-rendering DOM checks are not browser/device validation. Historical evidence files retain their historical scope; see the imported revision's validation receipt before citing any counts as current. The original food/terminal-clock review and browser/device verification limits remain in force. Source export does not grant permission to bypass a test, browser, package-registry or network restriction.

## Saved coding environment

Once the private GitHub repository is accessible to the existing connection, select this repository when creating or editing a saved coding environment. The setup command may be `bash scripts/cloud/install.sh` after that environment supplies Node 22.23.0; the interactive start command is `bash scripts/cloud/start.sh`. Keep long-running Vite startup separate from setup completion.

Publish/save the environment configuration through the supported interface, then verify a fresh task restores the repository, runtime, dependencies and start instructions. Until that fresh-task check succeeds, the environment is not verified. This source import does not create or publish a cloud environment, change hardware tiers, purchase resources or broaden GitHub access.

## Hosting and privacy

The `.openai/hosting.json` manifest identifies the existing private experimental Site and its dedicated database binding. It is retained for source/build provenance; it is not an instruction to publish or modify that Site. Deliberately creating another Site requires separate authorization and its own project identity. Preserve the original/experimental storage and database isolation documented in `EXPERIMENTAL-PREVIEW.md`.

The import excludes dependency directories, build outputs, local runtime state, Git metadata and any untracked local files. No save data, credentials, short-lived hosting credentials or authentication sessions are intentionally included. Keep the repository private unless its owner explicitly approves public release. No new source-code license is assigned by the import; existing dependency license notices and the lockfile are preserved.
