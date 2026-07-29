# Dwarven Depths Issue #282 — Art-Direction Analysis

## Reference-use boundary

The supplied gameplay mockup is used only to identify high-level visual traits, staging goals, and production constraints. Every requested raster is to be newly generated. No reference pixels, crops, traced shapes, copied layouts, copied characters, or copied ornament are incorporated. The production set will use a distinct Shuttergate composition, original architecture, original silhouettes, and a reduced HUD arrangement.

## Visible concept traits

- **Composition and camera:** A wide, slightly elevated orthographic/isometric-like view makes a large underground defense space legible at once. The world occupies most of the frame, while interface pieces hug the outer edges. Receding architecture and floor-level changes create depth without sacrificing tactical readability.
- **Spatial staging:** A hostile threshold sits deep in the scene and feeds enemies through a readable sequence of broad floor lanes, bends, stairs, platforms, and constrictions. Defenders occupy distinct foreground and midground stations. Strong landmarks clarify entrance, route, encounter spaces, and defended destination.
- **Lighting and palette:** Slate, charcoal, navy-black, and cold gray masonry dominate. Small but intense amber-orange fires rake across stone and metal, producing warm pools, copper highlights, and silhouette separation. Cool blue accents are sparse and functional. Darkness frames rather than obscures play space.
- **Architecture and materials:** Heavy block masonry, arches, buttresses, stairs, elevated ledges, iron braces, doors, rail tracks, hanging banners, chains, braziers, rubble, and forged fittings create a dense dwarven fortress vocabulary. Surface wear is chunky and readable rather than photoreal.
- **Characters:** Compact, broad dwarven defenders use large beards, helmets, shields, tools, and weapons as role-defining silhouettes. Hostiles vary in scale but remain readable through hunched posture, glowing facial accents, weapon shapes, and spacing. Colored circles and restrained status marks aid identification.
- **Route and chokepoints:** The concept communicates flow with floor geometry, bridges, stairs, track curves, and clustered enemy staging. Chokepoints are architectural, not abstract graph overlays.
- **HUD integration:** Frames resemble carved stone and dark forged metal with rivets and copper/gold trim. Top bars carry fortress, wave, and resource status; bottom modules carry portraits, health/state, abilities, and time controls. UI is game-world ornamental rather than browser-card styling.
- **Rendering character:** Crisp, hand-painted pixel-art or downsampled pre-rendered-3D forms use hard-edged clusters, controlled highlights, selective texture, and a consistent logical texel scale. Materials feel dimensional, but the image remains deliberately game-like and readable.

## Bounded production plan

1. Create one original 16:9 Shuttergate defense keyframe with a distinct S-shaped route: a hostile rear entrance, two architectural chokepoints, and a foreground fortified shutter gate. Keep the world dominant and reserve only shallow top/bottom edge bands for an integrated HUD.
2. Establish a shared visual bible: crisp 2px logical texel feel; hand-painted pixel clusters over subtly pre-rendered 3D massing; slate/navy/cold-stone base; amber/copper torchlight; dark iron and aged timber; restrained cool-blue gameplay accents.
3. Design an original Iron Warden: broad readable dwarf, braided dark-auburn beard, riveted iron plate, rectangular gate-shield, and square-headed hammer. Produce exactly six isolated, evenly spaced action poses.
4. Design one original hostile family member with a lean mine-raider silhouette, scavenged armor, hooked weapon, and ember eyes. Produce exactly six isolated, evenly spaced poses.
5. Produce an environment board with five clearly separated, bounded panels: receding passage; floor/winding route; walls/arch/doorway; props/foreground; warm lighting/effects. Exclude characters and UI.
6. Produce a HUD board containing only the required frame, portrait, health, three ability controls, status treatments, and pause/settings controls. Keep labels short and game-facing.
7. Visually inspect all outputs for count, composition, unwanted text, mixed style, missing required elements, and accidental UI/character leakage. Regenerate each major miss no more than once.

## Explicit exclusions

- No reuse of reference pixels or literal duplication of its hero lineup, enemy arrangement, gate silhouette, upgrade panel, labels, numbers, border ornaments, or exact HUD layout.
- No browser cards, debug graphs, node-link route overlays, photorealism, smooth vector/SVG styling, excessive bloom, particle fog that hides gameplay, or dense prose.
- No mechanics claims are implied by the art; these are production-direction rasters, not authoritative game-state or interface contracts.
