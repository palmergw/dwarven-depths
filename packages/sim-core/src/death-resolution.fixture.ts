import { resolveZeroHealthLifecycles } from "./death-resolution.js";

const combatants = [
  {
    schemaVersion: 1 as const,
    entityId: "entity.dwarf.warden" as never,
    kind: "dwarf" as const,
    currentHealth: 0,
    lifecycleState: "active" as const
  },
  {
    schemaVersion: 1 as const,
    entityId: "entity.enemy.cutter" as never,
    kind: "enemy" as const,
    currentHealth: 0,
    lifecycleState: "active" as const
  },
  {
    schemaVersion: 1 as const,
    entityId: "entity.deployable.turret" as never,
    kind: "deployable" as const,
    currentHealth: 0,
    lifecycleState: "active" as const
  },
  {
    schemaVersion: 1 as const,
    entityId: "entity.enemy.slinger" as never,
    kind: "enemy" as const,
    currentHealth: 4,
    lifecycleState: "active" as const
  }
];

const occupancy = [
  {
    entityId: "entity.dwarf.warden" as never,
    nodeId: "node.placement" as never
  },
  { entityId: "entity.enemy.cutter" as never, nodeId: "node.entry" as never },
  {
    entityId: "entity.deployable.turret" as never,
    nodeId: "node.attachment" as never
  },
  { entityId: "entity.enemy.slinger" as never, nodeId: "node.south" as never }
];

/** Shared golden evidence executed unchanged by Node and every browser engine. */
export function deathResolutionParityEvidence() {
  return resolveZeroHealthLifecycles({ combatants, occupancy });
}
