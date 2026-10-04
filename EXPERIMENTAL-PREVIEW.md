# AXIOM experimental preview

This is a separate owner-private experimental Site. The original AXIOM Living Frontier publication remains V32. No original Site source, Library file, saved game, or online room is replaced.

## Source and scope

- Complete upstream local build: `df7d7340a839bb353ccb633cd31a1e07349edd97`, copied from the clean canonical checkout on 2026-10-03.
- Preview checkout branch: `experimental-preview`. The exact preview commit is the clean checkout HEAD recorded by the Site workflow and embedded in the generated build's source revision.
- Preview-only changes: experimental notices and titles, namespaced browser storage, a dedicated database binding, the developer-controls upgrade documented in DEVELOPER-EXPOSURE.md, and the Hearthmere starting town documented in STARTING-TOWN.md. Food, rainfall, weather-dependent freight, irrigation, objectives, and system workbench implementations are retained.
- New Site project: `appgprj_6ac1395afe608191ad13ebdd53ccb864`.

## Save and room isolation

- The preview has a distinct Site origin. All browser local and session storage additionally use `axiom-experimental-preview-v1:`. The adapter does not load, migrate, enumerate, overwrite or clear unprefixed data.
- Co-op remains on the new Site's D1 database with the dedicated logical binding `AXIOM_PREVIEW_DB`. The preview Worker does not accept the original `DB` binding. Original database identifiers or data are not copied.
- The original schema migrations are schema-only; no live saves or rooms are seeded. Internal links and API requests stay relative to the preview's origin. Importing a save remains an explicit user action.

## Known limitations

Food's final edge-case review is incomplete. Browser/device rendering, GPU behavior, touch interactions and performance remain unverified. The separate preview may have bugs. Automated checks are bounded local evidence, not an official security assessment or a statement that any platform flag has cleared.

The validation selection intentionally excludes these 13 held files; no replacement terminal-clock probes are run:

- tests/ecology.test.ts
- tests/regional-clock-precision.test.ts
- tests/regional-food-trade-witness.test.ts
- tests/regional-food-world-authority.test.ts
- tests/regional-food.test.ts
- tests/regional-supply.test.ts
- tests/regional-trade-integration.test.ts
- tests/regional-trade-timeline.test.ts
- tests/regional-trade.test.ts
- tests/regional-weather-cold.test.ts
- tests/regional-weather-trade-authority.test.ts
- tests/regional-weather-trade.test.ts
- tests/regional-weather.test.ts

The exact local validation results accompany the publication record. Historical validation documents retain their original scope and are not a claim of complete preview validation.

## In-world conversations

This revision adds the game-native NPC conversations described in NPC-CONVERSATIONS.md, with a separate bounded local memory and disposable rehearsal. All existing preview storage/database isolation and the thirteen test exclusions above remain in force.

## Living-town autonomy

V9 adds a separately versioned active-play town-life state described in TOWN-LIFE.md. Six resident needs, utility-driven goals/actions, finite local sources/stores, reserved capacity, relationships and player interventions are shared across solo/online authority and current crowd projection. Historical regional worlds get a fresh life state without replaying time or replacing old progress, and the first outgoing save retains an exact pre-life checkpoint. Town source/resource accounting is independent of the held regional food/clock review. All preview-origin, storage-prefix and AXIOM_PREVIEW_DB isolation rules remain unchanged.

## V10 town motion correction

The V9 movement regression is addressed in the motion-revision-2 code and player-operated capture described in TOWN-CROWDS.md. The final permitted test receipt includes actual source/emitted per-frame body matrices with production snapshot cadence and dense contacts. This remains the same private preview, storage namespace and AXIOM_PREVIEW_DB; no original Site, source Library file or live save is replaced. Browser/device appearance remains unverified.

## Procedural completion pass

The new request director, constrained authoring tools and modular restoration pack are documented in TOWN-REQUESTS.md, RESTORATION.md and PROCEDURAL-COVERAGE.md. Additive state preserves original foundations and exact pre-pack checkpoint bytes. All existing preview namespace, AXIOM_PREVIEW_DB, owner-only audience and thirteen test exclusions remain unchanged. Full browser/device and held food review are still not claimed.

## V12 startup bustle correction

Fresh town creation now initializes real mixed public/home activities and reserved journeys without advancing time. Existing life saves retain exact loaded positions and recover through normal needs/choice steps. All drawn residents keep meaningful activity animation rather than losing it outside the near-detail budget. A read-only all-population matrix/authority watchdog and camera-frustum startup cases accompany the correction. Original Site, Library source, storage namespace, database binding, owner-only audience and thirteen exclusions remain unchanged. Player/device verification is still required.

## V14 townspeople architecture

Motion revision 5 gives navigated residents one authoritative achieved-movement owner. Reachable personal task areas, physical admission/egress and purposeful work stages replace logical arrivals into dense shared spots. The scene replays accepted movement and the scene commits the bodies and explorer from a completed physics contact frame. Existing life saves load unchanged and adopt bounded navigation during normal active play; progress, identities, households, needs, desires, dialogue and finite ledgers remain. The production main/worker/terrain/render boundary now has sustained controlled integration coverage. Exact frozen-source validation accompanies the publication receipt; these tests are not browser/GPU/device or aesthetic certification. The original Site and Library source, preview storage namespace, AXIOM_PREVIEW_DB, owner-only audience and the same thirteen held exclusions remain unchanged.
