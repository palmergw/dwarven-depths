import { compileContent } from "@dwarven-depths/content-runtime";
import type {
  ActiveAbilityTickRequest,
  BattlefieldState,
  CommandEnvelope,
  SimulationState
} from "@dwarven-depths/contracts";
import { beforeAll, describe, expect, it } from "vitest";
import shuttergateInput from "../../../content/fixtures/phase-3-shuttergate.json" with {
  type: "json"
};
import {
  isEnemyStaggered,
  isPointInsideActiveAbilityCone,
  resolveActiveAbilityTick
} from "./active-ability.js";
import { stepSimulation } from "./index.js";

let content: Awaited<ReturnType<typeof compileContent>>;

beforeAll(async () => {
  content = await compileContent(shuttergateInput);
});

function command(sequence = 0, atTick = 0): CommandEnvelope {
  return {
    tick: atTick,
    sequence,
    command: {
      atTick,
      type: "activateAbility",
      dwarfEntityId: "entity.dwarf.warden" as never,
      abilityId: "ability.iron_warden.shield_slam" as never
    }
  };
}

function battlefield(options?: {
  readonly downed?: boolean;
  readonly target?: boolean;
  readonly windupCommitAtTick?: number;
  readonly enemyHealth?: number;
}): BattlefieldState {
  const character = content.characters.get("character.iron_warden" as never);
  const enemy = content.enemies.get("enemy.goblin_cutter" as never);
  if (character === undefined || enemy === undefined)
    throw new Error("missing Shield Slam fixture combatants");
  const target = options?.target ?? true;
  return {
    schemaVersion: 1,
    mapId: "map.shuttergate_hall" as never,
    startedWaveIds: [],
    firedSpawnIds: [],
    pendingSpawns: [],
    enemyAdmissions: [],
    occupancy: [
      {
        entityId: "entity.dwarf.warden" as never,
        nodeId: "node.shuttergate_north_guard" as never
      },
      {
        entityId: "entity.enemy.a" as never,
        nodeId: "node.shuttergate_gate" as never
      },
      {
        entityId: "entity.enemy.b" as never,
        nodeId: "node.shuttergate_gate" as never
      }
    ],
    pendingCommittedAttacks: [],
    dwarfCombatants: [
      {
        schemaVersion: 1,
        entityId: "entity.dwarf.warden" as never,
        characterDefinitionId: character.id,
        placementPointId: "placement.shuttergate_north_guard" as never,
        currentHealth: options?.downed ? 0 : character.maximumHealth,
        maximumHealth: character.maximumHealth,
        lifecycleState: options?.downed ? "downed" : "active",
        basicAttack: character.basicAttack,
        actionState: {
          schemaVersion: 1,
          currentTargetEntityId: target ? ("entity.enemy.a" as never) : null,
          activeBasicAttack: null,
          cooldownCompleteAtTick: null
        }
      }
    ],
    enemyCombatants: ["entity.enemy.a", "entity.enemy.b"].map(
      (entityId, index) => ({
        schemaVersion: 1,
        entityId: entityId as never,
        enemyDefinitionId: enemy.id,
        classification: enemy.classification,
        currentHealth: options?.enemyHealth ?? enemy.maximumHealth,
        maximumHealth: enemy.maximumHealth,
        armor: enemy.armor,
        movementIntervalTicks: enemy.movementIntervalTicks,
        admittedAtTick: 0,
        lifecycleState: "active" as const,
        basicAttack: enemy.basicAttack,
        actionState: {
          schemaVersion: 1,
          nextMovementAtTick: 0,
          currentTargetEntityId: "entity.dwarf.warden" as never,
          activeBasicAttack:
            index === 0 && options?.windupCommitAtTick !== undefined
              ? {
                  schemaVersion: 1,
                  attackId: "attack.instance.enemy_a" as never,
                  sourceEntityId: entityId as never,
                  targetEntityId: "entity.dwarf.warden" as never,
                  startedAtTick: 0,
                  commitAtTick: options.windupCommitAtTick,
                  impactAtTick: options.windupCommitAtTick + 1,
                  cooldownDurationTicks: 20,
                  damage: 10,
                  range: 1,
                  targetIsValid: true
                }
              : null,
          cooldownCompleteAtTick: null
        }
      })
    )
  };
}

function request(
  currentTick: number,
  state: BattlefieldState,
  overrides: Partial<ActiveAbilityTickRequest> = {}
): ActiveAbilityTickRequest {
  return {
    schemaVersion: 1,
    currentTick,
    phase: "COMBAT_RUNNING",
    battlefield: state,
    commands: [],
    cooldowns: [],
    statuses: [],
    committedAbilities: [],
    ...overrides
  };
}

describe("Shield Slam active ability", () => {
  it.each(["PREPARATION", "TERMINAL"] as const)(
    "emits a stable rejection without advancing %s gameplay",
    (phase) => {
      const state: SimulationState = {
        schemaVersion: 1,
        contentVersion: content.bundle.contentVersion,
        tick: 0,
        seed: "1",
        rngState: 1,
        levelId: "level.shuttergate_hall" as never,
        phase,
        eventSequence: 0,
        battlefield: battlefield(),
        ...(phase === "TERMINAL" ? { terminalResult: "defeat" as const } : {})
      };

      const result = stepSimulation(state, [command()], content);
      expect(result.state.tick).toBe(0);
      expect(result.events).toMatchObject([
        {
          id: "event.000000",
          type: "ability.activation.rejected",
          reasonCode: "phase_unavailable"
        }
      ]);
    }
  );

  it("persists accepted work through the simulation kernel until impact", () => {
    let state: SimulationState = {
      schemaVersion: 1,
      contentVersion: content.bundle.contentVersion,
      tick: 0,
      seed: "1",
      rngState: 1,
      levelId: "level.shuttergate" as never,
      phase: "COMBAT_RUNNING",
      eventSequence: 0,
      battlefield: battlefield()
    };

    const accepted = stepSimulation(state, [command()], content);
    expect(accepted.events).toMatchObject([
      {
        id: "event.000000",
        type: "ability.activation.accepted",
        reasonCode: "ability_committed"
      }
    ]);
    expect(accepted.state.activeCooldowns).toHaveLength(1);
    expect(accepted.state.committedAbilities).toHaveLength(1);

    state = accepted.state;
    for (let tick = 1; tick <= 7; tick += 1) {
      const result = stepSimulation(state, [], content);
      state = result.state;
      if (tick < 7) expect(result.events).toEqual([]);
      else {
        expect(result.events.map(({ type }) => type)).toEqual([
          "ability.impact",
          "ability.damage",
          "ability.damage",
          "ability.status.applied",
          "ability.status.applied"
        ]);
        expect(result.events[0]).toMatchObject({
          id: "event.000001",
          targetEntityIds: ["entity.enemy.a", "entity.enemy.b"],
          damage: 24,
          staggerExpiresAtTick: 25,
          reasonCode: "shield_slam_impacted"
        });
      }
    }

    expect(state.tick).toBe(8);
    expect(state.committedAbilities).toEqual([]);
    expect(state.activeStatuses).toHaveLength(2);

    const timerEvents: string[] = [];
    while (state.tick <= 90) {
      const result = stepSimulation(state, [], content);
      state = result.state;
      timerEvents.push(...result.events.map(({ type }) => type));
    }
    expect(timerEvents).toEqual([
      "ability.status.expired",
      "ability.status.expired",
      "ability.cooldown.completed"
    ]);
    expect(state.activeStatuses).toEqual([]);
    expect(state.activeCooldowns).toEqual([]);
  });

  it("uses inclusive exact integer range and cone boundaries", () => {
    const ability = {
      schemaVersion: 1 as const,
      abilityId: "ability.iron_warden.shield_slam" as never,
      sourceEntityId: "entity.dwarf.warden" as never,
      commitmentSequence: 0,
      committedAtTick: 0,
      impactAtTick: 0,
      sourceX: 0,
      sourceY: 0,
      aimDeltaX: 1,
      aimDeltaY: 0,
      damage: 1,
      range: 5,
      frontalHalfAngleDegrees: 45 as const,
      staggerTicks: 1
    };
    expect(isPointInsideActiveAbilityCone(ability, { x: 5, y: 0 })).toBe(true);
    expect(isPointInsideActiveAbilityCone(ability, { x: 1, y: 1 })).toBe(true);
    expect(isPointInsideActiveAbilityCone(ability, { x: 4, y: 4 })).toBe(false);
    expect(isPointInsideActiveAbilityCone(ability, { x: -1, y: 0 })).toBe(
      false
    );
  });

  it("admits once in envelope order, snapshots authored values, and starts cooldown", () => {
    const result = resolveActiveAbilityTick(
      request(0, battlefield(), { commands: [command(3), command(4)] }),
      content
    );

    expect(
      result.activations.map(({ status, reason }) => ({ status, reason }))
    ).toEqual([
      { status: "accepted", reason: "ability_committed" },
      { status: "rejected", reason: "duplicate_ability_command" }
    ]);
    expect(result.committedAbilities[0]).toMatchObject({
      committedAtTick: 0,
      impactAtTick: 7,
      damage: 24,
      range: 3,
      frontalHalfAngleDegrees: 60,
      staggerTicks: 18
    });
    expect(result.cooldowns[0]).toMatchObject({
      startedAtTick: 0,
      completeAtTick: 90
    });
  });

  it("rejects unavailable phases, missing facing, downed owners, cooldowns, and conflicts without mutation", () => {
    const base = battlefield();
    const committed = resolveActiveAbilityTick(
      request(0, base, { commands: [command()] }),
      content
    );
    const cases = [
      request(1, base, { phase: "PREPARATION", commands: [command(0, 1)] }),
      request(1, battlefield({ target: false }), { commands: [command(0, 1)] }),
      request(1, battlefield({ downed: true }), { commands: [command(0, 1)] }),
      request(1, base, {
        commands: [command(0, 1)],
        cooldowns: committed.cooldowns
      }),
      request(1, base, {
        commands: [command(0, 1)],
        committedAbilities: committed.committedAbilities
      })
    ];
    expect(
      cases.map(
        (item) => resolveActiveAbilityTick(item, content).activations[0]?.reason
      )
    ).toEqual([
      "phase_unavailable",
      "target_or_facing_unavailable",
      "owner_downed",
      "cooldown_active",
      "committed_action_conflict"
    ]);
  });

  it("orders all inclusive qualifying targets, interrupts only uncommitted attacks, and staggers survivors", () => {
    const impactState = battlefield({ windupCommitAtTick: 8 });
    const accepted = resolveActiveAbilityTick(
      request(0, impactState, { commands: [command()] }),
      content
    );
    const impact = resolveActiveAbilityTick(
      request(7, impactState, {
        cooldowns: accepted.cooldowns,
        committedAbilities: accepted.committedAbilities
      }),
      content
    );

    expect(impact.impacts).toEqual([
      {
        schemaVersion: 1,
        abilityId: "ability.iron_warden.shield_slam",
        sourceEntityId: "entity.dwarf.warden",
        targetEntityIds: ["entity.enemy.a", "entity.enemy.b"],
        interruptedAttackIds: ["attack.instance.enemy_a"],
        statusId: "status.staggered",
        damage: 24,
        staggerExpiresAtTick: 25,
        reason: "shield_slam_impacted"
      }
    ]);
    expect(
      impact.battlefield.enemyCombatants.map(
        ({ currentHealth }) => currentHealth
      )
    ).toEqual([26, 26]);
    expect(
      impact.battlefield.enemyCombatants[0]?.actionState.activeBasicAttack
    ).toBeNull();
    expect(
      isEnemyStaggered(impact.statuses, "entity.enemy.a" as never, 24)
    ).toBe(true);
    const expired = resolveActiveAbilityTick(
      request(25, impact.battlefield, {
        cooldowns: impact.cooldowns,
        statuses: impact.statuses
      }),
      content
    );
    expect(expired.statuses).toEqual([]);
    expect(
      isEnemyStaggered(expired.statuses, "entity.enemy.a" as never, 25)
    ).toBe(false);
  });

  it("preserves work committed at the impact tick and resolves simultaneous deaths", () => {
    const impactState = battlefield({ windupCommitAtTick: 7, enemyHealth: 24 });
    const accepted = resolveActiveAbilityTick(
      request(0, impactState, { commands: [command()] }),
      content
    );
    const impact = resolveActiveAbilityTick(
      request(7, impactState, {
        cooldowns: accepted.cooldowns,
        committedAbilities: accepted.committedAbilities
      }),
      content
    );

    expect(impact.impacts[0]?.interruptedAttackIds).toEqual([]);
    expect(
      impact.battlefield.enemyCombatants.every(
        (enemy) => enemy.lifecycleState === "destroyed"
      )
    ).toBe(true);
    expect(
      impact.battlefield.occupancy.map(({ entityId }) => entityId)
    ).toEqual(["entity.dwarf.warden"]);
    expect(impact.statuses).toEqual([]);
  });

  it("completes cooldown exactly and refreshes stagger without stacking", () => {
    const state = battlefield();
    const accepted = resolveActiveAbilityTick(
      request(0, state, { commands: [command()] }),
      content
    );
    expect(
      resolveActiveAbilityTick(
        request(89, state, { cooldowns: accepted.cooldowns }),
        content
      ).cooldowns
    ).toHaveLength(1);
    const complete = resolveActiveAbilityTick(
      request(90, state, { cooldowns: accepted.cooldowns }),
      content
    );
    expect(complete.cooldowns).toEqual([]);
    expect(complete.cooldownDecisions[0]?.reason).toBe(
      "completion_tick_reached"
    );
    const firstImpact = resolveActiveAbilityTick(
      request(7, state, {
        cooldowns: accepted.cooldowns,
        committedAbilities: accepted.committedAbilities
      }),
      content
    );
    const committed = accepted.committedAbilities[0];
    if (committed === undefined)
      throw new Error("missing committed Shield Slam");
    const refreshed = resolveActiveAbilityTick(
      request(10, firstImpact.battlefield, {
        cooldowns: firstImpact.cooldowns,
        statuses: firstImpact.statuses,
        committedAbilities: [{ ...committed, impactAtTick: 10 }]
      }),
      content
    );
    expect(refreshed.statuses).toHaveLength(2);
    expect(
      refreshed.statuses.every(({ expiresAtTick }) => expiresAtTick === 28)
    ).toBe(true);
  });
});
