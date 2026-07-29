# Renderer direction study (#279)

## Fixed contract

Both proofs run inside the current React/Phaser client and consume the same validated `RenderSnapshot` emitted by the Shuttergate Web Worker. They only project immutable node, connection, entity, faction, phase, and tick values. Viewpoint switching redraws presentation state; it sends no Worker command and cannot change simulation results, pause state, evidence, or checksums.

The concept image is comparison-only reference material. It is not loaded by the client, copied, cropped, traced, or used as a background.

## Candidate A — stylized depth (recommended for product-owner selection)

- **Renderer:** Phaser Canvas remains sufficient for this bounded proof. Orthographic projection turns map coordinates into diamond floor planes and receding corridor segments. A production implementation could retain Phaser WebGL without changing the snapshot contract.
- **Assets:** the proof uses original project-authored raster-canvas geometry. Production should use pixel-aligned PNG atlases for stone, timber, iron, props, characters, and effects, with a source/license manifest and nearest-neighbour sampling.
- **Camera and occlusion:** a fixed 16:9 orthographic camera projects `(x, y)` to diagonal screen axes. Entities are sorted by projected `y`, then stable ID; foreground rock planes cover the lower scene edges. Production walls and tall props would use the same deterministic depth key and explicit foreground layer.
- **Topology mapping:** authoritative nodes become visible diamond floor/room planes. Connections become wide layered stone corridors, not graph edges. The central convergence reads as a gate/chokepoint, while diagonal branches read as receding passages.
- **Animation and effects:** projected positions support sprite interpolation, attack arcs, particles, torch animation, and camera emphasis. These remain presentation-only and are suppressed or made static under reduced motion.
- **Readability:** silhouettes remain larger than the minimum touch-independent visual target at desktop and 390×844. The oblique projection provides atmosphere and elevation cues, but close occupancy needs careful sprite offsets and foreground fading.
- **Performance and budget:** Canvas is adequate for the spike. Production should use Phaser WebGL batching, a small number of 1× atlases, static environment layers, pooled effects, and bounded dynamic lights. Main risks are overdraw, atlas growth, and readability beneath tall foreground art.
- **Migration:** `Battlefield.tsx` gains the projection/layering implementation while `render-snapshot.ts` and `simulation.worker.ts` remain unchanged. Browser snapshots must be rebaselined intentionally. Vite/PWA, desktop, and mobile packaging can ship PNG atlases through the existing public asset path.

## Candidate B — top-down fallback

- **Renderer:** Phaser Canvas/WebGL is sufficient. Authoritative coordinates map directly to a fixed overhead camera.
- **Assets:** production would use pixel-art floor/wall tilemaps plus atlas sprites and props. The proof uses original project-authored raster-canvas geometry.
- **Camera and occlusion:** room and corridor layers are drawn first; props and entities sort by screen `y`, then stable ID. Cutaway or fading upper walls prevent occupancy from being hidden.
- **Topology mapping:** nodes become stone rooms/placement areas and connections become wide floor corridors bounded by walls. No navigation node, graph line, raw ID, or diagnostic overlay appears in player mode.
- **Animation and effects:** direct screen-space paths simplify movement interpolation, targeting marks, projectile arcs, and area effects. Reduced motion can substitute static impact states.
- **Readability:** topology and occupancy are clearest on small screens. The trade-off is substantially weaker monumental depth, hallway recession, and fortress scale than the approved concept.
- **Performance and budget:** this is the lower-risk option. Tilemap batches and compact atlases should fit existing browser/mobile budgets. Risks are repetitive rooms and an overly board-game-like result without strong environment composition.
- **Migration:** the same presentation-only `Battlefield.tsx` boundary applies. Render snapshots, Worker authority, command protocol, packaging, and simulation tests need no schema change; only visual fixtures and asset loading evolve.

## Comparison and recommendation

Candidate A better matches the concept's monumental underground hall, layered architecture, warm local torchlight, cold stone, receding passages, and foreground depth. It carries higher occlusion, overdraw, and asset-production risk, but those risks are bounded by deterministic depth ordering, atlas budgets, static layers, and mobile readability checks. Candidate B is simpler and clearer, especially on mobile, but gives up too much of the approved volumetric fortress composition.

Recommendation: product owner should select **Candidate A — stylized depth** for #280, with Candidate B retained only as the explicit fallback. This recommendation is not a selection; #279 remains under `status:visual-approval` until the product owner decides.

## Asset source and license

No external or generated art is included. All proof geometry, palette choices, silhouettes, room planes, corridors, masonry, foreground planes, and torch effects are original project-authored code in `apps/web/src/Battlefield.tsx`, covered by the repository license. The concept image remains an unmodified reference and is not redistributed in generated client assets.

## Known proof limitations

- Geometry and silhouettes are deliberately bounded proofs, not a production environment or animation library.
- Torch glow is static canvas geometry; motion evidence therefore demonstrates authoritative entity/feedback updates and viewpoint redraw rather than a final lighting loop.
- The existing shell, diagnostic journey, HUD, and controls are intentionally out of scope for #279 and remain scheduled in #274–#275.
- Candidate A's foreground occlusion is representative rather than room-aware; production occluder fading belongs to the selected-direction implementation.
