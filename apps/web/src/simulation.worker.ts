import {
  type CompiledContent,
  compileContent,
  compileScenario
} from "@dwarven-depths/content-runtime";
import type {
  BattlefieldState,
  ContentBundle,
  ScenarioDefinition
} from "@dwarven-depths/contracts";
import {
  createLiveScenarioHost,
  createShieldSlamWebPreparationState,
  type LiveScenarioHost
} from "@dwarven-depths/runtime";
import emptyContentFixture from "../../../content/fixtures/empty-content.json";
import shieldSlamContentFixture from "../../../content/fixtures/phase-3-shuttergate.json";
import emptyScenarioFixture from "../../../scenarios/conformance/empty-level.json";
import shieldSlamScenarioFixture from "../../../scenarios/conformance/shuttergate-web-truth.json";
import { createPresentationSnapshot } from "./presentation-snapshot.js";
import {
  type CombatControlDwarf,
  EMPTY_CONTENT_MANIFEST_HASH,
  failure,
  parseClientMessage,
  TARGET_POLICIES,
  WEB_PROTOCOL_VERSION,
  type WorkerMessage
} from "./protocol.js";
import {
  compareRenderIds,
  type RenderPhase,
  type RenderSnapshot,
  type RenderSnapshotV2
} from "./render-snapshot.js";

declare const self: DedicatedWorkerGlobalScope;

const FOCUS_LOSS_GUARD_MILLISECONDS = 100;

let initialized = false;
let commandAccepted = false;
let manualPaused = false;
let terminal = false;
let resumeRequestId: string | null = null;
let pendingExecutionRequestId: string | null = null;
const acceptedRequestIds = new Set<string>();
const scheduledTargetPolicies = new Set<string>();
const scheduledAbilities = new Set<string>();
const abilityRejections = new Map<string, string>();
let protocolVersion: 1 | 2 | 3 | 4 = WEB_PROTOCOL_VERSION;
let preparedContent: CompiledContent | undefined;
let preparedScenario: ScenarioDefinition | undefined;
let liveHost: LiveScenarioHost | undefined;
let previousPresentationSnapshot: RenderSnapshotV2 | undefined;

function post(message: WorkerMessage): void {
  self.postMessage(message);
}

function createLegacyRenderSnapshot(
  content: CompiledContent,
  scenario: ScenarioDefinition,
  phase: RenderPhase,
  tick: number,
  battlefield?: BattlefieldState
): RenderSnapshot {
  const level = content.levels.get(scenario.levelId);
  const map =
    level?.mapId === undefined ? undefined : content.maps.get(level.mapId);
  const dwarves = new Set(
    battlefield?.dwarfCombatants.map((combatant) => combatant.entityId) ?? []
  );
  const enemies = new Set(
    battlefield?.enemyCombatants.map((combatant) => combatant.entityId) ?? []
  );
  return {
    schemaVersion: 1,
    levelId: scenario.levelId,
    mapId: map?.id ?? null,
    tick,
    phase,
    nodes: [...(map?.nodes ?? [])]
      .sort((left, right) => compareRenderIds(left.id, right.id))
      .map(({ id, x, y }) => ({ id, x, y })),
    connections: [...(map?.connections ?? [])]
      .sort((left, right) => compareRenderIds(left.id, right.id))
      .map(({ id, nodeIds }) => ({
        id,
        fromNodeId: nodeIds[0],
        toNodeId: nodeIds[1]
      })),
    entities: [...(battlefield?.occupancy ?? [])]
      .sort((left, right) => compareRenderIds(left.entityId, right.entityId))
      .map(({ entityId, nodeId }) => ({
        id: entityId,
        nodeId,
        faction: dwarves.has(entityId)
          ? ("dwarf" as const)
          : enemies.has(entityId)
            ? ("enemy" as const)
            : ("deployable" as const)
      }))
  };
}

function postRenderSnapshot(snapshot: RenderSnapshot): void {
  post({
    protocolVersion,
    type: "render_snapshot",
    snapshot
  });
  if (snapshot.schemaVersion === 2) previousPresentationSnapshot = snapshot;
}

function postRunningSnapshot(): void {
  post(
    protocolVersion === 1
      ? { protocolVersion: 1, type: "snapshot", phase: "running" }
      : {
          protocolVersion,
          type: "snapshot",
          phase: "running",
          manualPaused,
          resumeRequestId
        }
  );
}

function authoritativeCombatControls(): readonly CombatControlDwarf[] {
  if (preparedContent === undefined || liveHost === undefined) return [];
  return [...(liveHost.state.battlefield?.dwarfCombatants ?? [])]
    .sort((left, right) => compareRenderIds(left.entityId, right.entityId))
    .map((dwarf) => {
      const character = preparedContent?.characters.get(
        dwarf.characterDefinitionId
      );
      if (character === undefined)
        throw new Error(
          `Combat-control dwarf references unknown character ${dwarf.characterDefinitionId}.`
        );
      return {
        entityId: dwarf.entityId,
        characterId: character.id,
        supportedTargetPolicies: TARGET_POLICIES.filter((policy) =>
          character.supportedTargetPolicies.includes(policy)
        ),
        ...(character.activeAbilities === undefined
          ? {}
          : {
              activeAbilities: [...character.activeAbilities]
                .sort((left, right) => compareRenderIds(left.id, right.id))
                .map((ability) => ({
                  abilityId: ability.id,
                  cooldownCompleteAtTick:
                    liveHost?.state.activeCooldowns?.find(
                      (cooldown) =>
                        cooldown.ownerEntityId === dwarf.entityId &&
                        cooldown.cooldownId.startsWith(
                          `${ability.id}.cooldown.`
                        )
                    )?.completeAtTick ?? null,
                  rejectionReason:
                    liveHost?.state.phase !== "COMBAT_RUNNING"
                      ? "phase_unavailable"
                      : (abilityRejections.get(
                          `${dwarf.entityId}\u0000${ability.id}`
                        ) ?? null)
                }))
            })
      };
    });
}

function postCombatControls(): void {
  if (protocolVersion === 3) {
    if (preparedContent?.manifestHash !== EMPTY_CONTENT_MANIFEST_HASH)
      throw new Error(
        "The combat-control snapshot does not match the empty content manifest."
      );
    post({
      protocolVersion: 3,
      type: "combat_controls",
      contentManifestHash: EMPTY_CONTENT_MANIFEST_HASH,
      dwarves: []
    });
  } else if (protocolVersion === 4 && preparedContent !== undefined) {
    post({
      protocolVersion: 4,
      type: "combat_controls",
      contentManifestHash: preparedContent.manifestHash,
      dwarves: authoritativeCombatControls()
    });
  }
}

async function executePreparedScenario(): Promise<void> {
  if (
    terminal ||
    manualPaused ||
    preparedContent === undefined ||
    preparedScenario === undefined ||
    liveHost === undefined
  )
    return;
  try {
    const step = liveHost.step();
    scheduledTargetPolicies.clear();
    scheduledAbilities.clear();
    abilityRejections.clear();
    for (const event of step.events) {
      if (event.type === "ability.activation.rejected")
        abilityRejections.set(
          `${event.dwarfEntityId}\u0000${event.abilityId}`,
          event.reasonCode
        );
    }
    if (step.state.phase === "TERMINAL") terminal = true;
    postRenderSnapshot(
      protocolVersion === 4
        ? createPresentationSnapshot(
            preparedContent,
            preparedScenario,
            step.state,
            step.state.phase === "TERMINAL" ? "terminal" : "running",
            previousPresentationSnapshot
          )
        : createLegacyRenderSnapshot(
            preparedContent,
            preparedScenario,
            step.state.phase === "TERMINAL" ? "terminal" : "running",
            step.state.tick,
            step.state.battlefield
          )
    );
    if (protocolVersion === 4) postCombatControls();
    if (step.state.phase !== "TERMINAL") {
      schedulePreparedScenario("live-host");
      return;
    }
    const result = await liveHost.result();
    if (
      protocolVersion !== 4 &&
      result.commands.some(
        (envelope) => envelope.command.type !== "confirmPreparation"
      )
    )
      throw new Error(
        "The empty web fixture produced an unsupported replay command."
      );
    const terminalEvidence = {
      terminalResult: result.terminalResult,
      terminalTick: result.terminalTick,
      finalStateChecksum: result.finalStateChecksum,
      eventStreamChecksum: result.eventStreamChecksum
    };
    if (protocolVersion === 4)
      post({
        protocolVersion: 4,
        type: "result",
        ...terminalEvidence,
        commands: result.commands as Extract<
          WorkerMessage,
          { protocolVersion: 4; type: "result" }
        >["commands"]
      });
    else
      post({
        protocolVersion,
        type: "result",
        ...terminalEvidence,
        commands: result.commands as Extract<
          WorkerMessage,
          { protocolVersion: 1 | 2 | 3; type: "result" }
        >["commands"]
      });
  } catch (error) {
    terminal = true;
    post(
      failure(
        "runtime_failure",
        error instanceof Error
          ? error.message
          : "The authoritative runtime failed.",
        protocolVersion
      )
    );
  }
}

function schedulePreparedScenario(requestId: string): void {
  pendingExecutionRequestId = requestId;
  setTimeout(() => {
    if (pendingExecutionRequestId !== requestId || manualPaused || terminal)
      return;
    pendingExecutionRequestId = null;
    void executePreparedScenario();
  }, FOCUS_LOSS_GUARD_MILLISECONDS);
}

self.addEventListener("message", async (event: MessageEvent<unknown>) => {
  const message = parseClientMessage(event.data);
  if (message === undefined) {
    post(
      failure(
        "invalid_message",
        "The worker rejected a malformed or unsupported message.",
        protocolVersion
      )
    );
    return;
  }

  if (message.type === "initialize") {
    if (initialized) {
      post(
        failure(
          "already_initialized",
          "The simulation worker is already initialized.",
          protocolVersion
        )
      );
      return;
    }
    initialized = true;
    protocolVersion = message.protocolVersion;
    try {
      const contentFixture =
        protocolVersion === 4 ? shieldSlamContentFixture : emptyContentFixture;
      const scenarioFixture =
        protocolVersion === 4
          ? shieldSlamScenarioFixture
          : emptyScenarioFixture;
      preparedContent = await compileContent(
        contentFixture as unknown as ContentBundle
      );
      preparedScenario = compileScenario(
        scenarioFixture as unknown as ScenarioDefinition,
        preparedContent
      );
      liveHost = createLiveScenarioHost(
        preparedScenario,
        preparedContent,
        protocolVersion === 4
          ? createShieldSlamWebPreparationState(
              preparedContent,
              preparedScenario
            )
          : undefined
      );
      previousPresentationSnapshot = undefined;
      const preparationSnapshot =
        protocolVersion === 4
          ? createPresentationSnapshot(
              preparedContent,
              preparedScenario,
              liveHost.state,
              "preparation"
            )
          : createLegacyRenderSnapshot(
              preparedContent,
              preparedScenario,
              "preparation",
              0,
              liveHost.state.battlefield
            );
      const preparedLevel = preparedContent.levels.get(
        preparedScenario.levelId
      );
      const preparedMap =
        preparedLevel?.mapId === undefined
          ? undefined
          : preparedContent.maps.get(preparedLevel.mapId);
      postRenderSnapshot(preparationSnapshot);
      postCombatControls();
      post({
        protocolVersion,
        type: "snapshot",
        phase: "preparation",
        levelId: preparationSnapshot.levelId,
        deployableEntityCount: preparationSnapshot.entities.filter(
          (entity) => entity.faction !== "enemy"
        ).length,
        placementPointCount: preparedMap?.placementPoints.length ?? 0
      });
    } catch (error) {
      post(
        failure(
          "runtime_failure",
          error instanceof Error
            ? error.message
            : "The authoritative runtime failed.",
          protocolVersion
        )
      );
    }
    return;
  }

  if (message.protocolVersion !== protocolVersion) {
    post(
      failure(
        "invalid_message",
        "The command protocol version does not match the initialized session.",
        protocolVersion
      )
    );
    return;
  }

  if (
    acceptedRequestIds.has(message.requestId) ||
    acceptedRequestIds.size >= 1024
  ) {
    post(
      failure(
        "command_rejected",
        "The command request ID is duplicated or the session limit was reached.",
        protocolVersion
      )
    );
    return;
  }
  acceptedRequestIds.add(message.requestId);

  if (message.command.type === "activateAbility") {
    const command = message.command;
    const dwarf = authoritativeCombatControls().find(
      ({ entityId }) => entityId === command.dwarfEntityId
    );
    const commandKey = `${liveHost?.state.tick ?? -1}:${command.dwarfEntityId}:${command.abilityId}`;
    if (
      protocolVersion !== 4 ||
      !initialized ||
      !commandAccepted ||
      terminal ||
      liveHost === undefined ||
      dwarf?.activeAbilities?.some(
        ({ abilityId }) => abilityId === command.abilityId
      ) !== true ||
      scheduledAbilities.has(commandKey)
    ) {
      post(
        failure(
          "command_rejected",
          "The requested ability is stale, unavailable, unsupported, cooling down, or duplicated for this tick.",
          protocolVersion
        )
      );
      return;
    }
    liveHost.scheduleCommand({
      atTick: liveHost.state.tick,
      type: "activateAbility",
      dwarfEntityId: command.dwarfEntityId as never,
      abilityId: command.abilityId as never
    });
    scheduledAbilities.add(commandKey);
    return;
  }

  if (message.command.type === "setTargetPolicy") {
    const command = message.command;
    const dwarf = authoritativeCombatControls().find(
      ({ entityId }) => entityId === command.dwarfEntityId
    );
    const commandKey = `${liveHost?.state.tick ?? -1}:${command.dwarfEntityId}`;
    if (
      protocolVersion !== 4 ||
      !initialized ||
      !commandAccepted ||
      terminal ||
      liveHost === undefined ||
      dwarf === undefined ||
      !dwarf.supportedTargetPolicies.includes(command.requestedPolicy) ||
      scheduledTargetPolicies.has(commandKey)
    ) {
      post(
        failure(
          "command_rejected",
          "The requested target policy is stale, unavailable, unsupported, or duplicated for this tick.",
          protocolVersion
        )
      );
      return;
    }
    liveHost.scheduleCommand({
      atTick: liveHost.state.tick,
      type: "setTargetPolicy",
      dwarfEntityId: command.dwarfEntityId as never,
      requestedPolicy: command.requestedPolicy
    });
    scheduledTargetPolicies.add(commandKey);
    return;
  }

  if (message.command.type === "setManualPause") {
    if (
      !initialized ||
      !commandAccepted ||
      terminal ||
      message.command.paused === manualPaused
    ) {
      post(
        failure(
          "command_rejected",
          "The requested manual-pause state is not available.",
          protocolVersion
        )
      );
      return;
    }
    manualPaused = message.command.paused;
    if (manualPaused) pendingExecutionRequestId = null;
    resumeRequestId = manualPaused ? null : message.requestId;
    postRunningSnapshot();
    return;
  }

  if (message.command.type === "commitManualResume") {
    if (
      !initialized ||
      !commandAccepted ||
      terminal ||
      manualPaused ||
      message.command.resumeRequestId !== resumeRequestId
    ) {
      post(
        failure(
          "command_rejected",
          "The manual resume is not available for execution.",
          protocolVersion
        )
      );
      return;
    }
    resumeRequestId = null;
    schedulePreparedScenario(message.command.resumeRequestId);
    return;
  }

  if (
    !initialized ||
    commandAccepted ||
    preparedContent === undefined ||
    preparedScenario === undefined ||
    liveHost === undefined
  ) {
    post(
      failure(
        "command_rejected",
        "Preparation confirmation is not available.",
        protocolVersion
      )
    );
    return;
  }
  commandAccepted = true;
  liveHost.scheduleCommand({ atTick: liveHost.state.tick, ...message.command });
  resumeRequestId = null;
  pendingExecutionRequestId = null;

  if (protocolVersion === 4) {
    // Materialize the first authoritative combat frame before pausing. This
    // applies preparation, spawns the first hostile, and gives the renderer a
    // stable one-Warden/one-hostile tick without starting the live loop.
    manualPaused = false;
    await executePreparedScenario();
    manualPaused = true;
    pendingExecutionRequestId = null;
    postRunningSnapshot();
    return;
  }

  manualPaused = protocolVersion !== 1;
  postRunningSnapshot();
  postRenderSnapshot(
    createLegacyRenderSnapshot(
      preparedContent,
      preparedScenario,
      "running",
      liveHost.state.tick,
      liveHost.state.battlefield
    )
  );

  if (protocolVersion === 1) await executePreparedScenario();
});
