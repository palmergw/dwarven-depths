# Issue #279 visual evidence

All captures are from the actual Vite client running the authoritative protocol-v4 Shuttergate fixture. In the initial comparison, the only presentation setting changed between candidates was the `Battlefield` viewpoint control; both consumed the same Worker-emitted snapshot. The correction removes that prototype control and presents Candidate A only, as directed. The draft PR records and verifies the exact commit containing these bytes because a committed file cannot self-identify its own commit hash.

## Candidate A correction submission

This second product-owner submission addresses the first review against `6bb1885cf5d91904d5075c7afe905c63d22093ff` and focuses only on Candidate A as directed.

| Evidence | Fixture/state | Viewport | Settings |
|---|---|---:|---|
| `candidate-a-correction-1440x900-active.png` | Shuttergate active combat, Warden plus hostile, paused after hostile arrival | 1440×900 | standard contrast, default text, normal motion, sound off |
| `candidate-a-correction-390x844-active-reduced-motion.png` | same active-combat fixture and entity requirement | 390×844 | reduced motion; otherwise defaults |
| `candidate-a-correction-motion.webm` | preparation through active combat, including idle/action character motion and foreground depth | 1440×900 | normal motion; 9.88 seconds |

Required comparisons:

- **Concept/current:** compare `../../../assets/concept-art/dwarven-depths-gameplay-mockup.png` with both correction screenshots.
- **Current iteration:** compare `candidate-a-1440x900-active.png` with `candidate-a-correction-1440x900-active.png`; the correction replaces the scrolling dashboard, wireframe platforms, primitive tokens, and circular lights with a game-first fortress view, equipped character silhouettes, surface lighting, and docked HUD.
- **Responsive:** compare the desktop correction with `candidate-a-correction-390x844-active-reduced-motion.png`; the full battlefield remains visible before the compact stacked HUD and controls.

The capture harness waited for the accessible battlefield summary to report at least two combatants before pausing screenshots. The motion capture continues for eight seconds after the same authoritative arrival state. No standalone mockup or concept-image pixels are loaded into the client.

### Source and license manifest

No external, generated, traced, or concept-derived assets are included. Fortress geometry, material palette, surface lighting, Iron Warden art, hostile art, idle/action poses, and foreground occluders are original project-authored Phaser Canvas drawing code in `apps/web/src/Battlefield.tsx`, covered by the repository license. The source is committed directly rather than emitted from an untracked asset generator.

Known limitations: these are production-direction raster-canvas proofs rather than final sprite/tile atlases; action poses are bound to authoritative arrival/departure feedback; lighting is surface-integrated but static; the compact HUD intentionally does not pre-empt the final #274/#275 shell and interaction scope.

## Capture matrix

| Evidence | Fixture/state | Viewport | Settings |
|---|---|---:|---|
| `candidate-a-1440x900-context.png` | Shuttergate preparation checkpoint, Candidate A | 1440×900 | standard contrast, default text, device motion, sound off |
| `candidate-a-1440x900-active.png` | Shuttergate active combat, at least one Warden and one hostile, manually paused after hostile arrival | 1440×900 | standard contrast, default text, device motion, sound off |
| `candidate-a-390x844-active-reduced-motion.png` | same active-combat fixture and entity requirement, Candidate A | 390×844 | reduced motion; otherwise defaults |
| `candidate-a-motion.webm` | preparation through active combat and authoritative feedback, Candidate A | 1440×900 | normal motion; 9.56 seconds |
| `candidate-b-1440x900-context.png` | same Shuttergate preparation checkpoint, Candidate B | 1440×900 | standard contrast, default text, device motion, sound off |
| `candidate-b-1440x900-active.png` | same Shuttergate active-combat fixture and entity requirement, Candidate B | 1440×900 | standard contrast, default text, device motion, sound off |
| `candidate-b-390x844-active-reduced-motion.png` | same active-combat fixture and entity requirement, Candidate B | 390×844 | reduced motion; otherwise defaults |
| `candidate-b-motion.webm` | preparation through active combat and authoritative feedback, Candidate B | 1440×900 | normal motion; 9.64 seconds |
| `previous-approved-main-1440x900-active.png` | same Shuttergate active-combat flow on merged `main` at `c39fc2e25236de8b1af640dc89480ff999b5508f` | 1440×900 | defaults |

The capture harness waited until the accessible battlefield summary reported at least two combatants before pausing each active-combat frame. This binds desktop and mobile evidence to a state containing the Warden plus a spawned hostile rather than an empty preparation frame.

## Required comparisons

- **Concept/current:** compare `../../../assets/concept-art/dwarven-depths-gameplay-mockup.png` with each `candidate-a-*` and `candidate-b-*` image. The concept remains reference-only and is not loaded by the client.
- **Previous-approved/current:** compare `previous-approved-main-1440x900-active.png` with `candidate-a-1440x900-active.png` and `candidate-b-1440x900-active.png`.
- **Candidate A/B:** compare matching context, active, and mobile files directly. Both use the same viewport, fixture contract, and settings.

## Bounded image analysis

- Candidate A changes the flat coordinate projection into diagonal screen axes with diamond floor planes, receding corridor widths, vertical masonry piers, foreground void/rock planes, projected-y occlusion, and warm local torch pools against cold blue-grey stone.
- Candidate B retains direct overhead coordinates but turns nodes and edges into bounded stone rooms and broad connected corridors, with wall outlines, floor seams, layered torch pools, and projected-y entity ordering.
- In both candidates the Warden reads as a gold helm/white brow/earth-tone body silhouette; hostiles read as red angular silhouettes with paired amber eyes. Neither canvas contains stable IDs, tick text, graph nodes, graph lines, schema/conformance terms, or developer workflow labels.
- The 390×844 frames preserve the complete 16:9 battlefield and two large labelled viewpoint controls. Reduced-motion captures use static feedback treatment.
- Candidate A is visibly closer to the concept's layered monumental hall and volumetric composition. Candidate B is topologically clearer but flatter and is retained as the lower-complexity fallback.

## Asset source/license and limitations

No external or generated art is present. All proof geometry and palette work is original project-authored canvas code under the repository license. See `../../renderer-direction-study.md` for the renderer, asset pipeline, projection, occlusion, animation, accessibility, responsiveness, packaging, migration, risk, recommendation, and known-limitation analysis.
