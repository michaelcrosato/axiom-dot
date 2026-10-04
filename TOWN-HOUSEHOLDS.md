# Hearthmere households and daily lives

The preview now houses all 100 seeded townspeople in 40 physical homes: 12 single-person households, 12 couples (24 people), and 16 families (64 people). Four three-person families have one parent and two grown children; eight four-person families have two parents and two grown children; four five-person families have two parents and three grown children. Family relationships describe adults, including grown children. The roster's existing IDs, full names and appearances remain stable; surnames do not imply a relationship. Relationships are explicit, reciprocal and tied to one household. The first 20 house IDs and structures are retained; two additional rows provide 20 homes.

## What the player can inspect

Town → Resident directory shows the selected resident's age, occupation, address, household role, named relatives/partner, individualized backstory and daily timetable. The household directory lists every address and occupant. The current activity and shared clock refresh while the panel is open. Nearby conversation stays available in the real town.

All 100 residents, including the seven shopkeepers, now physically follow the same deterministic schedule kernel used by the renderer, solo physics and co-op collision. Each resident has timed home, commute, work, square and return phases. The shared 24-hour town day lasts 480 simulation seconds; individual shift offsets and phase durations are reflected in both the timetable and actual positions. Shop signs keep serving existing finite-stock transactions when the named keeper is off duty, so saved trade progress and availability are unchanged.

Household data and positions regenerate from the world seed and clock. They introduce no personal save payload, reward, currency or new transaction ledger. The town layout revision is independent of the existing version-one trade state and save format. Co-op actors undergo a one-time layout-two overlap recovery; established inventory and progress remain unchanged.

## Developer exposure

Developer tools → Hearthmere town scenario is a disposable model while the campaign is paused. It uses the real roster, routine, crowd contact and transaction kernels. The selected resident shows household, backstory, timetable, live coordinates and phase. Model time can be set to any whole second from 0 to 480. Go to phase start seeks the selected resident's actual routine boundary, including their shift offset and applied speed; this needs a nonzero speed. Existing 0–2× routine speed, population (7–100), spacing, appearance, activity budget and gait controls retain their strict version-two preset contract.

Reset scenario rebuilds names/options for its seed, clamps selection to its population, clears time, actions, collision report and transactions. Apply, discard and default staging remain distinct. The feedback export includes household revision, selected household and routine along with source, seed, applied settings and bounded actions. The preset remains version two because its input schema is unchanged; no arbitrary imported routine or relationship data is accepted.

The map shows all four home streets and the market street. Visit the real town returns to the playable scene through existing readiness and solo/co-op gates; model clock changes never alter the campaign clock or normal saves.

## Limits

Homes are open-door physical structures and assigned dwelling locations, not furnished sleep simulations. Families are all adults, with no child AI. Backstories and schedules are deterministic authored combinations, not autonomous dialogue or a relationship-progression system. Residents use bounded kinematic crowd spacing and yielding rather than 100 rigid bodies. Numerical, DOM-contract, CPU and real Rapier checks do not certify rendered browser/GPU, touch or physical-device appearance or performance. The original experimental food/clock review limitations remain unchanged.
