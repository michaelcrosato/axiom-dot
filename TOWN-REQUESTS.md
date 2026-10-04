# Persistent town requests · director 1

Hearthmere now has a bounded procedural request director above its real living-town state. It observes water and material shortages, worn public services, and residents needing support. It does not create crises, grant items, or add an XP/currency system.

## Play

Open **Town life → Town requests & history**, or **Journal → Town requests**. Acceptance and decline require the living explorer within 3.5 m of the named public service, on clear ground with their staff lowered. Inspecting from elsewhere is read-only. The help button selects the relevant resident or service in the existing intervention panel.

An offered request records its real cause, issuer, target, completion predicate and active-time deadline. Accept before helping. The existing donation, repair or encouragement authority spends the same finite inventory as before. Accepting alone does not spend, complete or reward anything. A qualifying accepted intervention that actually crosses the predicate records player help. Resident work or natural recovery resolves the need without invented player credit. Expired and declined requests retain their factual outcome.

The exact goals are water ≥40 town portions, materials ≥16 portions, a service open with condition >60, or a resident at ≥30 connection and ≤60 stress. These are town-local portions, separate from regional food/litre ledgers.

## Bounds and authority

- At most two active requests, two episodes per same causal target, and 24 lifetime records
- Default 90 active seconds between requests, 240-second latched offer deadline, and 30-second condition scans
- Episode history is retained; reaching the history limit stops new requests, not town life
- State.townDirector owns the optional version-1 state; shared room authority owns the online copy
- Commands have expected director and life-command revisions. The director observes every actual half-second town boundary even under coarser room polling
- Solo menus/background pause it; online menus do not pause the room. No offline catch-up
- Present malformed data is rejected. Missing historical state starts a new director without replaying old time or replacing town progress
- The pre-procedural local checkpoint preserves exact earlier bytes on the first ordinary save

## Developer exposure

**Developer lab → World systems → Request director** is a separate numerical rehearsal. Balanced, low-store, service-outage and social-strain setups use the production town and request kernels. Rest, deadline and active-request controls are finite, typed and staged. Apply changes future offers; existing deadlines remain latched. Seed/scenario changes need an explicit reset.

The lab has real model interventions, 1–60-second steps, a 1,200-second run bound, 128 action records, strict 4 KB versioned preset import and source/seed/actual-versus-intended evidence export. Closing stops it. No campaign, room, conversation memory or ordinary slot is read or written by the lab. Its test-context placement is explicitly not physical explorer movement.

Tests cover causes, targeted contribution, natural resolution, latching, exact revisions, same-revision chronology, repeated commands, strict saves/presets, local rollback, co-op packets, staged/canceled UI operations and source/emitted parity. Numerical and non-rendering DOM checks do not establish rendered appearance or device behavior.
