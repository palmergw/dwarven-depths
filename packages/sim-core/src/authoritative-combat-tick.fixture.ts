import { compileContent } from "@dwarven-depths/content-runtime";
import type {
  DwarfActionPhaseEntry,
  SimulationState
} from "@dwarven-depths/contracts";
import shuttergateInput from "../../../content/fixtures/phase-3-shuttergate.json" with {
  type: "json"
};
import { resolveAuthoritativeCombatTick } from "./authoritative-combat-tick.js";
import {
  createBattlefieldDwarfDeploymentAuthority,
  deployBattlefieldDwarves
} from "./battlefield-attack-impact.js";
import { createInitialState } from "./index.js";

const dwarfActionEntries: readonly DwarfActionPhaseEntry[] = Object.freeze([
  Object.freeze({
    schemaVersion: 1,
    dwarfEntityId: "entity.dwarf.warden_keep" as never,
    requestedPolicy: "nearest" as const
  }),
  Object.freeze({
    schemaVersion: 1,
    dwarfEntityId: "entity.dwarf.warden_north" as never,
    requestedPolicy: "lowest_health" as const
  })
]);

async function runShuttergateTickSequence(reverseEntries: boolean) {
  const content = await compileContent(shuttergateInput);
  const initial = createInitialState(
    content,
    "level.shuttergate_hall" as never,
    "1"
  );
  if (initial.battlefield === undefined)
    throw new Error("missing Shuttergate battlefield");
  const authority = createBattlefieldDwarfDeploymentAuthority(
    [
      {
        entityId: "entity.dwarf.warden_north" as never,
        characterDefinitionId: "character.iron_warden" as never,
        placementPointId: "placement.shuttergate_north_guard" as never
      },
      {
        entityId: "entity.dwarf.warden_keep" as never,
        characterDefinitionId: "character.iron_warden" as never,
        placementPointId: "placement.shuttergate_keep_guard" as never
      }
    ],
    initial.battlefield,
    content
  );
  const deployed = deployBattlefieldDwarves(
    initial.battlefield,
    authority,
    content
  );
  let state: SimulationState = Object.freeze({
    ...initial,
    phase: "COMBAT_RUNNING" as const,
    battlefield: deployed
  });
  const validationErrors: string[] = [];
  for (const invalidState of [
    { ...state, phase: "PREPARATION" as const },
    Object.defineProperty({ ...state }, "tick", {
      enumerable: true,
      get: () => {
        throw new Error("state tick accessor must not execute");
      }
    })
  ]) {
    try {
      resolveAuthoritativeCombatTick(
        {
          schemaVersion: 1,
          state: invalidState as SimulationState,
          dwarfActionEntries
        },
        content,
        authority
      );
    } catch (error) {
      validationErrors.push(
        error instanceof Error ? error.message : String(error)
      );
    }
  }
  const checkpoints: unknown[] = [];
  for (let tick = 0; tick <= 23; tick += 1) {
    state = Object.freeze({ ...state, tick });
    const resolution = resolveAuthoritativeCombatTick(
      {
        schemaVersion: 1,
        state,
        dwarfActionEntries: reverseEntries
          ? [...dwarfActionEntries].reverse()
          : dwarfActionEntries
      },
      content,
      authority
    );
    state = resolution.state;
    if ([0, 6, 12, 13, 19, 20, 21, 23].includes(tick)) {
      checkpoints.push(
        Object.freeze({
          tick,
          events: resolution.events,
          enemyPlanning: resolution.enemyPlanning,
          enemyActions: resolution.enemyActions.decisions,
          dwarfActions: resolution.dwarfActions.decisions,
          movement: resolution.enemyMovement,
          impacts: resolution.impacts
        })
      );
    }
  }
  return Object.freeze({
    state,
    checkpoints: Object.freeze(checkpoints),
    validationErrors: Object.freeze(validationErrors)
  });
}

export async function authoritativeCombatTickParityEvidence() {
  const forward = await runShuttergateTickSequence(false);
  const reversed = await runShuttergateTickSequence(true);
  return Object.freeze({ forward, reversed });
}
