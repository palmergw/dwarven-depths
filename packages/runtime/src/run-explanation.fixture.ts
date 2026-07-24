import type {
  LifecycleDiagnosticRecord,
  SimulationEvent
} from "@dwarven-depths/contracts";
import type { RunExplanationRequest } from "./run-explanation.js";

const events: readonly SimulationEvent[] = Object.freeze([
  Object.freeze({
    id: "event.000001",
    tick: 0,
    sequence: 1,
    type: "round.victory",
    ruleId: "SIM-VICTORY-001"
  }),
  Object.freeze({
    id: "event.000000",
    tick: 0,
    sequence: 0,
    type: "round.started",
    ruleId: "SIM-LIFECYCLE-001"
  })
]);

const diagnostics: readonly LifecycleDiagnosticRecord[] = Object.freeze([
  Object.freeze({
    schemaVersion: 1,
    id: "diagnostic.000001",
    kind: "lifecycle",
    tick: 0,
    sequence: 1,
    eventType: "round.victory",
    reasonCode: "SIM-VICTORY-001",
    eventId: "event.000001",
    causes: Object.freeze([
      Object.freeze({ kind: "event", eventId: "event.000000" })
    ])
  }),
  Object.freeze({
    schemaVersion: 1,
    id: "diagnostic.000000",
    kind: "lifecycle",
    tick: 0,
    sequence: 0,
    eventType: "round.started",
    reasonCode: "SIM-LIFECYCLE-001",
    eventId: "event.000000",
    causes: Object.freeze([
      Object.freeze({
        kind: "command",
        sequence: 0,
        atTick: 0,
        commandType: "confirmPreparation"
      })
    ])
  })
]);

export const runExplanationFixture: RunExplanationRequest = Object.freeze({
  identity: Object.freeze({
    repositoryRevision: "a".repeat(40),
    contentManifestHash: "b".repeat(64),
    scenarioId: "scenario.explanation.fixture",
    scenarioHash: "c".repeat(64),
    seed: "1",
    replayIdentityHash: "d".repeat(64)
  }),
  terminalResult: "victory",
  terminalTick: 0,
  events,
  diagnostics
});
