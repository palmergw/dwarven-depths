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

## Not implemented yet

This checkpoint does not expose placement occupancy/route-legality validation,
movement proposals, reservations, spawn queues, targeting, combat, or
map-specific CLI commands. Existing `validate`, `run`, `replay --verify`,
`inspect`, and `compare` behavior remains the supported simulation surface.
