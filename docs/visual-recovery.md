# Visual recovery evidence

## Responsive matrix

Issue #276 is verified by `pnpm capture:responsive-matrix`. The capture refuses tracked worktree changes and binds every image to the built client source head, the Shuttergate fixture where combat is shown, viewport, state, presentation settings, tick, entity count, target geometry, overflow results, browser console, and screenshot checksum.

The finite matrix is 65 images: checkpoint, Forge, settings, preparation, result, recoverable error, high contrast, large text, paused combat, quiet combat, dense combat, Shield Slam impact, and reduced-motion combat at 1440×900, 1280×800, 1024×768, 768×768, and 390×844. Screenshots supplement browser assertions; they do not replace them.

The 390×844 layout is a dedicated mobile composition. Company is the checkpoint task, Forge and Settings are separate full-height views, preparation preserves a battlefield-dominant upper region, and combat separates the world from a touch control deck. It does not treat the previously rejected compressed desktop shell as its target.

## Manual product-owner checklist

- The current desktop views preserve the approved #274 composition and the approved Shuttergate battlefield/HUD baseline.
- Mobile presents one primary task and one dominant action per view rather than stacking desktop panels.
- The battlefield remains the visual subject in preparation and combat; controls do not reduce it to a narrow strip.
- Company, Forge, and Settings have intentional hierarchy and all controls remain reachable.
- Dwarves, enemies, route, effects, HUD values, focus indicators, and control states remain readable at a consistent visual scale.
- No player-facing stable IDs, inspection language, clipping, accidental page scroll, hidden controls, or battlefield/control collisions are visible.
- Large text, high contrast, reduced motion, keyboard focus order, touch target sizing, and safe-area placement remain usable.
- Browser console and page-error arrays are empty in the manifest.
- Compare current captures against the fixed concept for atmosphere and information hierarchy only; the concept is never used as a runtime asset.

Product-owner approval remains bound to the exact reviewed head and evidence packet. It is not implied by automated checks.
