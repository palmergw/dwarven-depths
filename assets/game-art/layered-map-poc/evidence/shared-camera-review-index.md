# Shuttergate tutorial map — corrected product-owner review index

Status: **Changes required / bounded WIP review only**

This map is explicitly categorized as a **tutorial map**. Its scale is not evidence that the large-map composition problem is solved. Review the corrected Blender-source evidence in this order:

1. **Clean map:** `blender/outputs/reference-plate.png`
   - No entities, diagnostics, HUD, or controls.
   - Judge the tutorial court, hooked route, entrance, and defended shutter.
   - The rejected lower-edge framing has been removed.

2. **Production sprite scale and occlusion:** `blender/outputs/production-sprite-traversal.png`
   - Approved Warden at 56 px nominal alpha height.
   - Approved raiders at 44 px nominal alpha height.
   - Raider and Warden presentation alpha is normalized so units read as solid.
   - Judge tutorial-scale readability and entrance occlusion.

3. **Native foreground isolation:** `evidence/shared-camera-foreground-isolation.png`
   - Full-frame 1280×720 checkerboard presentation of the renderer-native entrance RGBA.
   - No traced masks, chroma keying, or post-render geometry transforms.

4. **Single summary board:** `evidence/shared-camera-product-owner-review.png`
   - Clearly labels the three visual surfaces and the bounded review contract.

## Current measurable contract

- Authored floor: 40×46 world units with a broad unobstructed central court.
- Route: hooked, broad, and nonbranching.
- Orthographic camera: 50 world units.
- No decorative edge-framing foreground pass remains.
- The entrance shell is the only purposeful foreground occluder.
- Source: one editable Blender scene and one shared camera.

## Requested WIP judgment

- Is the court readable and appropriately bounded for a tutorial map?
- Does the hooked route read immediately across the unobstructed tactical floor?
- Are route, tunnel, shutter, units, and foreground occlusion readable?
- Is this a viable basis for movement toward the original painterly dwarven-fortress direction?

## Not claimed complete

- Painterly finish.
- Final carved masonry, chains, machinery, or set dressing.
- Final entrance voussoir and defended-shutter detailing.
- Final product approval.
- Any claim that large-map scale has been solved.
