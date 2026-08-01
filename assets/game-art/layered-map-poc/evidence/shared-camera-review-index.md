# Shared-camera architecture and scale WIP — product-owner review index

Status: **Changes required / bounded WIP review only**

This index intentionally excludes the obsolete flattened-map and traced-mask evidence. Review the current Blender-source direction using these surfaces in order:

1. **Clean map:** `blender/outputs/reference-plate.png`
   - No entities, diagnostics, HUD, or controls.
   - Judge overall composition, tactical space, entrance, defended shutter, and whether the service bridge earns its place architecturally.

2. **Production sprite scale and occlusion:** `blender/outputs/production-sprite-traversal.png`
   - Approved Warden at 56 px nominal alpha height.
   - Approved raiders at 44 px nominal alpha height.
   - Judge scale against architecture, route density, progressive entrance/bridge occlusion, and route readability.

3. **Native foreground isolation:** `evidence/shared-camera-foreground-isolation.png`
   - Full-frame 1280×720 checkerboard presentation of renderer-native entrance and service-bridge RGBA.
   - No traced masks, chroma keying, or post-render geometry transforms.

4. **Single summary board:** `evidence/shared-camera-product-owner-review.png`
   - Clearly labels the three visual surfaces and the bounded review contract.

## Current measurable contract

- Authored floor: 40×46 world units.
- Route: 42 world units, broad and nonbranching.
- Orthographic camera: 50 world units.
- Service bridge: keyed into side bastions; no support enters the route.
- Source: one editable Blender scene and one shared camera.

## Requested WIP judgment

- Is there meaningful tactical space rather than merely a longer corridor?
- Does the architecture communicate monumental scale at approved unit size?
- Does the service bridge earn its place by connecting the fortress and creating a useful overhead threshold?
- Are route, tunnel, shutter, units, and foreground occlusion readable?
- Is this a viable basis for movement toward the original painterly dwarven-fortress direction?

## Not claimed complete

- Painterly finish.
- Final carved masonry, chains, machinery, or set dressing.
- Final entrance voussoir and defended-shutter detailing.
- Final product approval.
