# Phase 2: static battlefield foundation

Phase 2 begins with the authored battlefield contract from
`docs/technical-design-readiness.md`. This document records only the executable
surface currently present on the Phase 2 implementation branch.

## Implemented boundary

- Content schema version 1 accepts strict `map` definitions containing stable
  navigation-node, connection, placement-point, and enemy-entrance IDs.
- Navigation connections have positive safe-integer costs, reference two
  different existing nodes, and may connect only orthogonally positioned nodes.
- Every node explicitly lists its authored neighbor order. Validation requires
  that ordered neighbor references and undirected connection records agree.
- Placement points reference navigation nodes and explicit placement adjacency;
  enemy entrances reference navigation nodes.
- Level records may bind a map by stable `mapId`. Existing Phase 1 mapless
  conformance levels remain valid.
- Compilation sorts records whose source order is not gameplay data, preserves
  authored neighbor order, canonicalizes undirected endpoints, deep-freezes all
  returned map records, and includes maps in the content-manifest checksum.
- The content runtime exposes deterministic minimum-cost route and route-cost
  primitives. Equal-cost choices follow authored neighbor order, disconnected
  goals return no route, and returned routes are immutable.
- `content/fixtures/conformance-map.json` is the nonempty golden Node/browser
  fixture.
- Static placement validation rejects duplicate dwarf assignments, unknown or
  over-capacity placement points, and any entrance that cannot traverse static
  authored connectivity to an unoccupied node adjacent to a placed dwarf. A
  placed dwarf blocks its own navigation node, so intentional walls remain
  legal when enemies can still reach an attack-valid approach.
- The simulation core exposes an immutable movement-reservation primitive.
  Proposals are checked against authored adjacency and snapshot occupancy;
  occupied destinations wait, free-destination conflicts resolve by stable
  enemy entity ID, and invalid proposals are rejected with reason-coded
  decisions. Snapshot occupancy prevents overlap, following, swapping,
  phase-through, and pushing within one movement phase.

## Not implemented yet

This checkpoint does not yet integrate movement proposals or reservations into
dynamic simulation state and does not expose spawn queues, targeting, combat, or
map-specific CLI commands. Existing `validate`, `run`, `replay --verify`,
`inspect`, and `compare` behavior remains the supported simulation surface.
