# AXIOM experimental preview

This checkout is the private experimental Site, with separate preview storage and database bindings. Preserve that identity and its notices. The original game and its saved worlds are separate.

## Developer exposure is part of every gameplay feature

For every feasible new or changed major gameplay system, update the developer tools alongside implementation. Use `DEVELOPER-EXPOSURE.md` as the acceptance checklist. Give players a safe way to reach the feature, alter supported behavior, repeat the setup, and export evidence without requiring another build. If a setting is unsafe or unsupported, document the actual limit and provide a useful scenario or inspector instead of a cosmetic control.

## Verification

Use the project’s pinned dependencies and Node 22. Run both TypeScript projects and the production build. The full aggregate currently includes unresolved food/clock review cases; use the explicitly listed safe test selection for this preview and describe its exclusions rather than claiming an aggregate pass. Do not confuse non-rendering DOM/worker tests with browser, touch or device verification.
