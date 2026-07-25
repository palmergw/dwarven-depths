import {
  compileContent,
  compileScenario
} from "@dwarven-depths/content-runtime";
import type {
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

declare const self: DedicatedWorkerGlobalScope;

let initialized = false;
let commandAccepted = false;

function post(message: WorkerMessage): void {
  self.postMessage(message);
}

self.addEventListener("message", async (event: MessageEvent<unknown>) => {
  const message = parseClientMessage(event.data);
  if (message === undefined) {
    post(
      failure(
        "invalid_message",
        "The worker rejected a malformed or unsupported message."
      )
    );
    return;
  }

  if (message.type === "initialize") {
    if (initialized) {
      post(
        failure(
          "already_initialized",
          "The simulation worker is already initialized."
        )
      );
      return;
    }
    initialized = true;
    post({
      protocolVersion: WEB_PROTOCOL_VERSION,
      type: "snapshot",
      phase: "preparation"
    });
    return;
  }

  if (!initialized || commandAccepted) {
    post(
      failure("command_rejected", "Preparation confirmation is not available.")
    );
    return;
  }
  commandAccepted = true;
  post({
    protocolVersion: WEB_PROTOCOL_VERSION,
    type: "snapshot",
    phase: "running"
  });

  try {
    const content = await compileContent(
      contentFixture as unknown as ContentBundle
    );
    const scenario = compileScenario(
      scenarioFixture as unknown as ScenarioDefinition,
      content
    );
    const result = await runScenario(scenario, content);
    post({
      protocolVersion: WEB_PROTOCOL_VERSION,
      type: "result",
      terminalResult: result.terminalResult,
      terminalTick: result.terminalTick,
      finalStateChecksum: result.finalStateChecksum,
      eventStreamChecksum: result.eventStreamChecksum,
      commands: result.commands
    });
  } catch (error) {
    post(
      failure(
        "runtime_failure",
        error instanceof Error
          ? error.message
          : "The authoritative runtime failed."
      )
    );
  }
});
