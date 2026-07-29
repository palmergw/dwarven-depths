# Issue #279 visual evidence

All current captures are from the actual Vite client running the authoritative protocol-v4 Shuttergate fixture. The only presentation setting changed between candidates is the `Battlefield` viewpoint control; both candidates consume the same Worker-emitted snapshot. The draft PR records and verifies the exact commit containing these bytes because a committed file cannot self-identify its own commit hash.

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
