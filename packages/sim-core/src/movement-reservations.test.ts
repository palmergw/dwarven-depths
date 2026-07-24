import { compileContent } from "@dwarven-depths/content-runtime";
import type {
  BattlefieldMapDefinition,
  MovementProposal,
  NavigationOccupant
} from "@dwarven-depths/contracts";
import { beforeAll, describe, expect, it } from "vitest";
import mapContentInput from "../../../content/fixtures/conformance-map.json" with {
  type: "json"
};
import { resolveMovementReservations } from "./index.js";

let map: BattlefieldMapDefinition;

const occupancy = [
  { entityId: "entity.enemy.alpha", nodeId: "node.entry" },
  { entityId: "entity.enemy.beta", nodeId: "node.goal" }
] as NavigationOccupant[];

beforeAll(async () => {
  const content = await compileContent(mapContentInput);
  const compiledMap = content.maps.get("map.conformance_diamond" as never);
  if (compiledMap === undefined) throw new Error("missing conformance map");
  map = compiledMap;
});

function proposal(
  id: string,
  entityId: string,
  fromNodeId: string,
  toNodeId: string
): MovementProposal {
  return { id, entityId, fromNodeId, toNodeId } as MovementProposal;
}

describe("deterministic movement reservations", () => {
  it("awards a free destination conflict to the lowest stable entity ID", () => {
    const result = resolveMovementReservations(map, occupancy, [
      proposal("movement.beta", "entity.enemy.beta", "node.goal", "node.south"),
      proposal(
        "movement.alpha",
        "entity.enemy.alpha",
        "node.entry",
        "node.south"
      )
    ]);

    expect(result).toEqual({
      occupancy: [
        { entityId: "entity.enemy.alpha", nodeId: "node.south" },
        { entityId: "entity.enemy.beta", nodeId: "node.goal" }
      ],
      decisions: [
        {
          proposalId: "movement.alpha",
          entityId: "entity.enemy.alpha",
          fromNodeId: "node.entry",
          toNodeId: "node.south",
          status: "moved",
          reason: "moved"
        },
        {
          proposalId: "movement.beta",
          entityId: "entity.enemy.beta",
          fromNodeId: "node.goal",
          toNodeId: "node.south",
          status: "waited",
          reason: "destination_reserved"
        }
      ]
    });
  });

  it("prevents following, swapping, and pushing through snapshot occupancy", () => {
    const adjacentOccupancy = [
      { entityId: "entity.enemy.alpha", nodeId: "node.entry" },
      { entityId: "entity.enemy.beta", nodeId: "node.south" }
    ] as NavigationOccupant[];
    const result = resolveMovementReservations(map, adjacentOccupancy, [
      proposal(
        "movement.alpha",
        "entity.enemy.alpha",
        "node.entry",
        "node.south"
      ),
      proposal("movement.beta", "entity.enemy.beta", "node.south", "node.entry")
    ]);

    expect(result.occupancy).toEqual(adjacentOccupancy);
    expect(
      result.decisions.map(({ status, reason }) => ({ status, reason }))
    ).toEqual([
      { status: "waited", reason: "destination_occupied" },
      { status: "waited", reason: "destination_occupied" }
    ]);

    const blocked = resolveMovementReservations(map, adjacentOccupancy, [
      proposal(
        "movement.alpha",
        "entity.enemy.alpha",
        "node.entry",
        "node.south"
      ),
      proposal("movement.beta", "entity.enemy.beta", "node.south", "node.goal")
    ]);

    expect(blocked.occupancy).toEqual([
      { entityId: "entity.enemy.alpha", nodeId: "node.entry" },
      { entityId: "entity.enemy.beta", nodeId: "node.goal" }
    ]);
    expect(blocked.decisions.map((decision) => decision.reason)).toEqual([
      "destination_occupied",
      "moved"
    ]);
  });

  it("rejects malformed proposals with stable reason codes", () => {
    const result = resolveMovementReservations(map, occupancy, [
      proposal(
        "movement.duplicate.a",
        "entity.enemy.alpha",
        "node.entry",
        "node.south"
      ),
      proposal(
        "movement.duplicate.b",
        "entity.enemy.alpha",
        "node.entry",
        "node.east"
      ),
      proposal(
        "movement.missing_entity",
        "entity.enemy.missing",
        "node.entry",
        "node.south"
      ),
      proposal("movement.source", "entity.enemy.beta", "node.east", "node.goal")
    ]);

    expect(result.decisions.map((decision) => decision.reason)).toEqual([
      "duplicate_entity_proposal",
      "duplicate_entity_proposal",
      "source_mismatch",
      "entity_not_occupied"
    ]);
    expect(result.occupancy).toEqual(occupancy);
  });

  it("rejects unknown, stationary, and non-adjacent destinations", () => {
    expect(
      resolveMovementReservations(
        map,
        [occupancy[0] as NavigationOccupant],
        [
          proposal(
            "movement.unknown",
            "entity.enemy.alpha",
            "node.entry",
            "node.missing"
          )
        ]
      ).decisions[0]?.reason
    ).toBe("unknown_node");
    expect(
      resolveMovementReservations(
        map,
        [occupancy[0] as NavigationOccupant],
        [
          proposal(
            "movement.same",
            "entity.enemy.alpha",
            "node.entry",
            "node.entry"
          )
        ]
      ).decisions[0]?.reason
    ).toBe("same_node");
    expect(
      resolveMovementReservations(map, occupancy, [
        proposal(
          "movement.disconnected",
          "entity.enemy.alpha",
          "node.entry",
          "node.goal"
        )
      ]).decisions[0]?.reason
    ).toBe("nodes_not_connected");
  });

  it("rejects invalid occupancy and duplicate proposal IDs", () => {
    expect(() =>
      resolveMovementReservations(
        map,
        [
          occupancy[0] as NavigationOccupant,
          {
            entityId: "entity.enemy.alpha",
            nodeId: "node.east"
          } as NavigationOccupant
        ],
        []
      )
    ).toThrow("duplicate occupied entity ID");
    expect(() =>
      resolveMovementReservations(
        map,
        [
          occupancy[0] as NavigationOccupant,
          {
            entityId: "entity.enemy.other",
            nodeId: "node.entry"
          } as NavigationOccupant
        ],
        []
      )
    ).toThrow("duplicate occupied navigation node ID");
    expect(() =>
      resolveMovementReservations(map, occupancy, [
        proposal(
          "movement.same",
          "entity.enemy.alpha",
          "node.entry",
          "node.south"
        ),
        proposal(
          "movement.same",
          "entity.enemy.beta",
          "node.goal",
          "node.south"
        )
      ])
    ).toThrow("duplicate movement proposal ID");
  });

  it("is permutation-invariant, detached, and deeply immutable", () => {
    const proposals = [
      proposal("movement.beta", "entity.enemy.beta", "node.goal", "node.south"),
      proposal(
        "movement.alpha",
        "entity.enemy.alpha",
        "node.entry",
        "node.south"
      )
    ];
    const occupancyBefore = structuredClone(occupancy);
    const proposalsBefore = structuredClone(proposals);
    const forward = resolveMovementReservations(map, occupancy, proposals);
    const reversed = resolveMovementReservations(
      map,
      [...occupancy].reverse(),
      [...proposals].reverse()
    );

    expect(reversed).toEqual(forward);
    expect(occupancy).toEqual(occupancyBefore);
    expect(proposals).toEqual(proposalsBefore);
    expect(Object.isFrozen(forward)).toBe(true);
    expect(Object.isFrozen(forward.occupancy)).toBe(true);
    expect(Object.isFrozen(forward.occupancy[0])).toBe(true);
    expect(Object.isFrozen(forward.decisions)).toBe(true);
    expect(Object.isFrozen(forward.decisions[0])).toBe(true);
  });
});
