# V8 jump, hold controls and modular yard audit

30 September 2026. This revision is verified with source review, production EventTarget/DOM-contract input execution, actual Rapier worker tests, pure-state simulation and numeric Three.js rig geometry. No supported rendered-browser or physical-device preview was available; no denied route or live Site was used as a workaround.

## Fixed touch positions and held controls

X stays upper left for Interact/Gather/Repair/Enter/Return/Mossbank. Y stays upper right for Pulse. B stays lower left for hold Crouch. A stays lower right for Jump. All slots keep their layout dimensions, including disabled contextual actions. Labels update in place. Crouch and Jump never toggle from synthesized clicks; each binding aggregates its own pointer and keyboard sources.

- Move with the left thumb, hold Crouch with another finger and press Jump with a third; either held action can release without stealing movement
- Crouch begins immediately on down, ends on the last corresponding up/cancel/leave/lost-capture, and remains low only if the ceiling blocks standing
- Jump down sends an immediate worker message; even a complete press/release between animation frames is retained
- Holding Jump never launches again automatically
- Mouse left-button and focused Space/Enter support held action semantics; global C holds crouch, Space jumps and F pulses
- Label rerenders keep the actual button and its pointer capture alive
- Menus, transitions, focus loss, page hiding and resets clear held sources and pending ordinary taps
- Keyboard auto-repeat cannot revive a hold that was cleared during a menu or blur
- Ordinary touch panel buttons and native selects retain the V7 independent tap behavior and scroll cancellation
- All action controls use touch-action:none; scrollable panels retain their own pan behavior

## Worker and visual motion

The worker owns vertical velocity, gravity, takeoff buffering, coyote allowance, ceiling/wall collisions, grounded state and landing pulse. The main scene uses feetY rather than an invented jump offset; the shadow remains at ground height and the map remains planar. Raised-platform landing and stepping off support are covered by real Rapier tests. Airborne capsule height, horizontal motion and water simulation freeze when a panel/background pause applies. Zone replacement and teleport clear vertical state and stale inputs. Crouch-release ends a slide request and permits standing only when clear.

## Modular construction

A 6×3 snapped yard replaces four forced foundations. Seven part definitions supply rotated physical solids and typed ports. The board is bounded to 12 modules, one source pump, one tank and one outlet. Explicit joins form an acyclic directed graph; current connectivity determines real conserved supply. Placement/rotation validates bounds, player clearance, occupied cells, footprints, source/outlet positions, reserved world paths and salvage access before spending. Destruction removes incident edges, refunds once and drains tank litres exactly once.

Schema-4 four-pad saves migrate to schema 5 with exact original IDs, links, materials and water/settlement ledgers. Existing old quest routes and all three commissions remain feasible. Jumping onto a module then saving is handled by safe ground resolution on load. Rotations and layouts auto-save with the existing browser-local world save; export/import remains available.

## Remaining physical-device checks

1. On S25 portrait and landscape, verify all X/Y/B/A slots remain reachable and stationary across gathering, sentry range, crouch and jumping
2. Hold movement, hold B, press A and release in different orders; movement must only stop when its own finger lifts or a menu opens
3. Jump beside a wall and beneath a low roof, release crouch under the roof, then exit the obstruction and confirm standing
4. Open Settings mid-jump and background the app; height should pause and then resume without an extra jump or stuck input
5. Use two right-world fingers to pinch with and without the movement thumb; panel controls must still scroll/tap safely
6. Place the basic route, then dismantle/rotate/reroute with corners; join actual ports, observe conserved water and settlement reserve, export/reload the layout
7. Check fullscreen safe areas, WebGPU/WebGL2 rendering, frame rate and actual mobile ergonomics

The executable DOM shim cannot establish native browser pointer synthesis, CSS pixel layout, physical thumb reach, graphics-backend execution or 60 FPS. Existing private Site identity and source Library identity are preserved; package pins and lockfile are unchanged.

## Final local and independent gates

The final revision passes strict TypeScript, all 106 repository tests, Vite production build and whitespace checks. Independent review repeated all four checks and executed the production construction UI in a DOM-contract harness: 18 cells, bent route selection, preview rotation, five module placements, four explicit joins, live supply, valid save, rotation clearing joins, confirmed dismantle/refund and 11 save calls. Review found and verified the fix for emergency recall overlapping a newly placeable pipe. No must-fix source defect remains. Large bundle warnings remain expected for the current Three.js/Rapier foundation; they are not performance measurements.

## V9 shared procedural framework gate (1 October 2026)

The new workbench is reachable from Settings on desktop/touch and from the construction panel. It previews the real waterworks semantic plan and independently seeded workshop plans. Its form, seed field, selectors, node details, constraint list and JSON details use the existing scrollable modal. Modal focus is trapped; Escape/Close clear held input and return focus. Simulation pauses through the same authoritative worker input path used by other panels.

The in-world workshop has a hidden-on-approach roof, matching y-aware render/physics boxes and standing-height door openings. It does not replace old huts or roads. The new plot filters consume the old random draws before removing local vegetation/stone, preserving later valley1 geometry and RNG state. Schema6 adds a pinned domain/recipe/catalog manifest; schema1–5 migrations preserve progress and rescue only positions blocked by the new workshop.

New verification includes full JSON compiler/operator/budget/port tests, recipe geometry comparisons, 256-seed workshop clearance, 27-seed full-standing Rapier traversal, real waterworks/compiler integration and legacy draw preservation. Browser graphics and physical S25 ergonomics remain unverified; no browser access restriction was bypassed. Pending device checks: open/scroll/close inspector while moving or airborne, change seed with soft keyboard, inspect both recipes, walk every workshop doorway, and confirm roof visibility/occlusion on WebGPU and WebGL2.

Final V9 local and independent gates: all147 repository tests, strict TypeScript and Vite production build pass. Independent review also executed the production workbench in a DOM-contract harness (finite canvas drawing; desktop/touch/reopen/cancel/invalid seed paths), confirmed output/validation budgets and material precision fail closed, and verified 66-seed legacy vegetation/RNG compatibility. Review found no remaining release-blocking source defects. The browser/device limitation above remains unchanged.

## V10 connected-world integration

The four fixed action slots, independent hold pointers, analog locomotion, jump buffer, crouch/stand clearance, pinch, fullscreen/settings and modal pause remain regression gates. Generated world switching saves and fully reloads the session rather than reusing stale pointer/worker/render state. Terrain motion uses real sampled support; camera and shadow heights follow the same surface. New-world selection, saved-world buttons and both plan inspectors use the same delegated touch-button path and modal focus trap.

No rendered-browser or physical-device claim is added. Device checks should now include uphill/downhill movement, crossing the real bridge, entering elevated workshops, jumping on terrain, both settlement labels, same-seed no-op, changing seeds with held controls, and returning to the original legacy slot with its progress intact.
