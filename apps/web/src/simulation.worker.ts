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
import { runScenario } from "@dwarven-depths/runtime";
import contentFixture from "../../../content/fixtures/empty-content.json";
import scenarioFixture from "../../../scenarios/conformance/empty-level.json";
import {
  failure,
  parseClientMessage,
  WEB_PROTOCOL_VERSION,
  type WorkerMessage
} from "./protocol.js";
import {
  compareRenderIds,
  type RenderPhase,
  type RenderSnapshot
} from "./render-snapshot.js";

declare const self: DedicatedWorkerGlobalScope;

let initialized = false;
let commandAccepted = false;
let manualPaused = false;
let terminal = false;
let protocolVersion: 1 | 2 = WEB_PROTOCOL_VERSION;
let preparedContent: CompiledContent | undefined;
let preparedScenario: ScenarioDefinition | undefined;

function post(message: WorkerMessage): void {
  self.postMessage(message);
}

function createRenderSnapshot(
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
}

function postRunningSnapshot(): void {
  post(
    protocolVersion === 1
      ? { protocolVersion: 1, type: "snapshot", phase: "running" }
      : {
          protocolVersion: 2,
          type: "snapshot",
          phase: "running",
          manualPaused
        }
  );
}

async function executePreparedScenario(): Promise<void> {
  if (
    terminal ||
    manualPaused ||
    preparedContent === undefined ||
    preparedScenario === undefined
  )
    return;
  try {
    const result = await runScenario(preparedScenario, preparedContent);
    terminal = true;
    postRenderSnapshot(
      createRenderSnapshot(
        preparedContent,
        preparedScenario,
        "terminal",
        result.finalState.tick,
        result.finalState.battlefield
      )
    );
    post({
      protocolVersion,
      type: "result",
      terminalResult: result.terminalResult,
      terminalTick: result.terminalTick,
      finalStateChecksum: result.finalStateChecksum,
      eventStreamChecksum: result.eventStreamChecksum,
      commands: result.commands
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
      preparedContent = await compileContent(
        contentFixture as unknown as ContentBundle
      );
      preparedScenario = compileScenario(
        scenarioFixture as unknown as ScenarioDefinition,
        preparedContent
      );
      const preparationSnapshot = createRenderSnapshot(
        preparedContent,
        preparedScenario,
        "preparation",
        0
      );
      const preparedLevel = preparedContent.levels.get(
        preparedScenario.levelId
      );
      const preparedMap =
        preparedLevel?.mapId === undefined
          ? undefined
          : preparedContent.maps.get(preparedLevel.mapId);
      postRenderSnapshot(preparationSnapshot);
      post({
        protocolVersion,
        type: "snapshot",
        phase: "preparation",
        levelId: preparationSnapshot.levelId,
        deployableEntityCount: preparationSnapshot.entities.filter(
          (entity) => entity.faction === "deployable"
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
    postRunningSnapshot();
    return;
  }

  if (message.command.type === "commitManualResume") {
    if (!initialized || !commandAccepted || terminal || manualPaused) {
      post(
        failure(
          "command_rejected",
          "The manual resume is not available for execution.",
          protocolVersion
        )
      );
      return;
    }
    await executePreparedScenario();
    return;
  }

  if (
    !initialized ||
    commandAccepted ||
    preparedContent === undefined ||
    preparedScenario === undefined
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
  manualPaused = protocolVersion === 2;
  postRunningSnapshot();
  postRenderSnapshot(
    createRenderSnapshot(preparedContent, preparedScenario, "running", 0)
  );

  if (protocolVersion === 1) await executePreparedScenario();
});
