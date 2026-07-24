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
- The simulation core exposes an immutable spawn-admission primitive. Pending
  spawn events are admitted in stable authored order, at most one enemy enters
  through each free entrance per phase, occupied entrances retain enemies in an
  off-map queue, and independent free entrances continue admitting. An optional
  positive live-enemy cap keeps excess spawns queued without discarding or
  reordering them. Results include canonical reason-coded decisions.
- Map-backed simulations initialize immutable authoritative battlefield state
  bound to the level's compiled map. A battlefield phase enqueues scheduled
  spawns, admits queues, and then resolves movement reservations in the fixed
  same-step order. Canonical occupancy and retained queues persist in state.
- Every spawn and movement decision emits an immutable simulation event with a
  stable event sequence, source spawn or proposal ID, entity and map-point IDs,
  rule ID, status-specific event type, and machine-readable reason code.
- The authoritative battlefield phase rejects map/state mismatches and invalid
  queue identities before returning a replacement state. Blocked queues resume
  deterministically when an entrance becomes free. Node and browser parity pin
  the resulting state and event evidence to a literal checksum.

## Not implemented yet

This checkpoint does not yet expose authored wave spawn schedules, automatic
movement-proposal generation, targeting, combat, or map-specific CLI commands.
The authoritative battlefield phase accepts validated scheduled-spawn and
movement-proposal inputs so those later systems can share one state transition.
The existing `validate`, `run`, `replay --verify`, `inspect`, and `compare`
behavior remains the supported simulation surface.
