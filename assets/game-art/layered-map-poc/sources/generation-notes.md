# Generation notes

## Source package and generation settings

- Provider: OpenAI Codex image generation
- Model: `gpt-image-2-medium`
- Aspect setting: landscape
- Environment-base master: `artifact-first/environment-base-master.png`, 1672×941
- Entrance chroma master: `artifact-first/entrance-shell-chroma-master.png`, 1536×1024
- Gantry chroma master: `artifact-first/gantry-shell-chroma-master.png`, 1536×1024
- References: `assets/concept-art/dwarven-depths-gameplay-mockup.png` for direction and the earlier production-scene clean plate for thematic continuity only. Neither reference is cropped, traced, or shipped as a runtime background.

## Recorded prompt briefs

Environment base: "Create a new character-, effect-, text-, HUD-, entrance-shell-, and gantry-free elevated 2.5D dwarven fortress defense map. Prioritize one wide, legible hostile-tunnel-to-defended-shutter route with raised shoulders available for separately authored route-crossing artifacts. Preserve basalt, carved stone, cool cavern depth, restrained warm light, monumental scale, and a painterly pre-rendered finish."

Entrance: "Create one complete standalone dwarven masonry tunnel arch on a uniform bright chroma-green field. Use carved dark stone and forged bands, a broad transparent route aperture, clean uncropped silhouette, and the same elevated 2.5D camera/material language as the environment base. Include no floor, cavern, character, effect, text, or UI."

Gantry: "Create one complete standalone dwarven timber-and-forged-iron overhead gantry on a uniform bright chroma-green field. Match the elevated 2.5D camera; run the beam diagonally from upper-left to lower-right; place the farther support higher and the nearer support lower; keep both full support bases visible for opposite raised shoulders; leave a broad unobstructed span; include no floor, cavern, character, UI, text, or doorway."

The generation service may normalize prompts internally; these committed briefs are the retained reproducibility/provenance record and do not claim hidden service parameters.

## Refinement history

1. Generated two independent map candidates.
2. Selected the stronger diagonal-route candidate.
3. Removed a decorative freestanding arch that confused route topology.
4. Made the upper hostile tunnel shell and timber gantry the two explicit foreground artifacts.
5. Expanded usable combat floor and reduced dead chasm space.
6. Moved the complete tunnel shell inside the frame and removed clutter from both artifact boundaries.
7. Product-owner review rejected approximate arch-mask alignment and a gantry support planted in the defense walkway.
8. Regenerated the map around a crisp masonry entrance whose visible arch ring follows explicit stone/mortar edges.
9. Rebuilt the gantry as an overhead bridge with both columns anchored on raised shoulder plinths outside the route.
10. Preserved a clean continuous route from tunnel aperture, beneath the unobstructed gantry span, to the shutter plaza.
11. Rejected the flattened-scene mask workflow and restarted from a structure-free base plus independently authored entrance and diagonal-perspective gantry RGBA sources. The revised gantry's feet land on opposite raised shoulders, its right post no longer crowds the entrance, and chroma decontamination removes generated green spill before export.

The final source intentionally improves compositing clarity and map usability rather than reproducing the previous Shuttergate plate pixel-for-pixel.
