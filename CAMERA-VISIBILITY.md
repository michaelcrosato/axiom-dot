# Zoom-out visibility

## Behavior

The existing wheel, right-side pinch and Camera panel still use zoom 17–58. The current production camera is a 42° oblique perspective camera with elevation 0.88 × zoom; there is no separate orthographic/isometric mode in this checkout.

Close-view atmosphere is unchanged through zoom 28. Between 28 and 42 the fog range moves smoothly beyond the view. From 42 to 58 every drawable fragment has exactly zero fog contribution. Zooming back in smoothly restores the regional, cave/valley or isolated-lab atmosphere. The same linear Fog object is updated each frame; neither backend needs a new shader for each zoom step. Camera/menu pauses do not pause visibility updates.

Before this change, regional fog started at view depth 45 m and became opaque at 95 m. The camera's focal point was 77.260 m deep at maximum zoom, already 71.17% fog blended. It is now 0%. At minimum zoom the focal point is 22.645 m deep and remains unchanged at 0%. The far clip is 512 m rather than 240 m, allowing highland views to reach actual terrain without cutting into sky at the top of the view.

## Ground coverage and ownership

- Nearby gameplay detail still comes only from collision-confirmed 64 m chunks. Load/retain radii, 49-chunk physics cap, features, movement, world boundaries, save format and world area are unchanged
- A separate render-only landscape fills ground outside committed terrain. It samples the existing seeded surface and biome colors, with 16 m interior patches and exact 2 m border vertices. It creates no props, colliders, paths or simulation state
- Ownership holes follow the actual committed-render map, including when an old chunk remains visible during a pending harvest refresh. Queued/generated chunks cannot create empty holes
- One scenic terrain mesh and one four-vertex scenic water plane are added. Both are shadow-free. Regional boundary skirts meet the same canonical 2 m vertices, including clipped corner chunks, and remain when edge chunks are committed. Outside the finite playable region, the low scenic water floor provides a visible boundary background without adding playable area
- Coverage uses the real tilt, viewport aspect and low scenic floor. It reserves every zoom/orbit angle around a quantized 64 m camera center and 16 m height band, avoiding geometry rebuilds during wheel/pinch/orbit alone
- Very wide footprints switch to 256 m patches with 64 m interiors, retaining fine patches around committed detail and 2 m borders everywhere. The finite-world/49-committed-chunk bound is at most 931 patches, enforced by a 1024-patch guard. Cache eviction and geometry replacement dispose old resources
- New-world and authoritative relocation camera targets snap to the destination rather than sweeping through irrelevant intermediate neighborhoods. Initial scenic geometry is prepared before the loading screen is removed
- Interior/lab roots retain their existing background and geometry. Landscape remains under the valley root, so it cannot show through another zone. Persisted pagehide keeps the scenery for BFCache; final pagehide disposes it

## Evidence and limits

`tests/camera-visibility.test.ts` checks smooth monotone fog restoration, zero fog at every drawn depth when pulled back, actual Three perspective rays at portrait through 4:1 aspect, ground/coverage containment for all zoom values and multiple orbit angles, negative/clipped chunk seams, ownership holes, budgets, repeated updates and disposal. The extracted production visibility hook covers paused-menu zoom, repeated resize and zone profiles. Existing input, menu/map, save, streaming and physics suites remain required.

`scripts/measure-camera-visibility.mts` produces `evidence/camera-visibility-report.json`. In the recorded Node 22 run, 25 committed detail chunks plus render-only coverage used 60–200 scenic patches, 18,432–42,048 scenic vertices across the sampled portrait/ultrawide/highland cases. One hundred unchanged updates caused no geometry rebuild. Cold scenic geometry construction measured approximately 104–304 ms on this server; this is why it is primed under the initial loading screen and relocation does not glide through multiple cold regions. These timings are not a browser/device benchmark. Receipt, quantized-center, altitude-band and viewport changes can still trigger bounded geometry work.

No browser rendering or physical-device performance pass was performed. Local browser access was denied; it was not retried through another route, and the live Site was not used for browser testing. Numeric ray, color and topology checks do not approve actual WebGPU/WebGL shading, LOD transitions, portrait readability or phone frame rate. The shared scene/fog path supports both backends in code; renderer compatibility remains subject to the same explicit visual limitation.

All ordinary project tests and builds use the existing checksum-verified official Node 22.23.0 binary. No diagnostic retry, runtime protection change or assertion relaxation is part of this fix. The prior Node 24 WASM issue remains outside this change.
