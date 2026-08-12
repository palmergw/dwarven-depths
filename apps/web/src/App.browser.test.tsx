import {
  createInitialProfile,
  type ProfileState,
  purchasedUpgradeCatalog,
  purchaseUpgradeRank
} from "@dwarven-depths/progression";
import type { ProfileSaveEnvelope } from "@dwarven-depths/save";
import { IndexedDbProfileStoreError } from "@dwarven-depths/save/indexed-db";
import { StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { App } from "./App.js";
import {
  Battlefield,
  buildBattlefieldPrimitives,
  buildDepartureFeedbackPrimitives,
  buildInterpolationOrigins,
  buildTruthScreenAlignment,
  comparePresentationPrimitives,
  decodeBattlefieldDepthAsset,
  deriveCombatPresentationState,
  deriveShieldSlamImpactIds,
  deriveSlingerProjectilePaths,
  deriveTemporalCombatTreatment,
  interpolationDistanceForFrame,
  renderedFactionForSourceKey,
  selectCombatPoseAsset,
  selectCombatPoseTreatment,
  statusSignalKind
} from "./Battlefield.js";
import { CombatControls } from "./CombatControls.js";
import { CombatHud } from "./CombatHud.js";
import type { CheckpointProfileStore } from "./checkpoint-profile.js";
import { deriveCombatFeedback } from "./combat-feedback.js";
import "./styles.css";
import {
  EMPTY_CONTENT_MANIFEST_HASH,
  parseWorkerMessage,
  WEB_PROTOCOL_VERSION,
  type WorkerMessage
} from "./protocol.js";
import type { RenderSnapshot } from "./render-snapshot.js";

async function runCampaignAttempt(
  profile: ProfileState,
  attemptNumber: number
): Promise<{
  readonly result: Extract<
    WorkerMessage,
    { protocolVersion: 4; type: "result" }
  >;
  readonly maximumHealth: number;
  readonly abilityActivations: number;
}> {
  const worker = new Worker(
    new URL("./simulation.worker.ts", import.meta.url),
    {
      type: "module"
    }
  );
  const attemptId = `attempt.shuttergate.web_${String(attemptNumber).padStart(6, "0")}`;
  const preparation = waitForMessage(
    worker,
    (message) => message.type === "snapshot" && message.phase === "preparation"
  );
  const result = waitForMessage(
    worker,
    (message) =>
      message.type === "result" ||
      (message.type === "failure" && message.code === "runtime_failure"),
    300_000
  );
  let lastAbilityTick = -1;
  let maximumHealth = 0;
  let abilityActivations = 0;
  worker.addEventListener("message", (event: MessageEvent<unknown>) => {
    const message = parseWorkerMessage(event.data);
    if (
      message?.type === "render_snapshot" &&
      message.snapshot.schemaVersion === 2
    )
      maximumHealth = Math.max(
        maximumHealth,
        ...message.snapshot.entities
          .filter((entity) => entity.faction === "dwarf")
          .map((entity) => entity.maximumHealth)
      );
    if (
      message?.type !== "combat_controls" ||
      message.protocolVersion !== 4 ||
      message.authoritativeTick === lastAbilityTick
    )
      return;
    const dwarf = message.dwarves.find((candidate) =>
      candidate.activeAbilities?.some(
        (ability) =>
          ability.abilityId === "ability.iron_warden.shield_slam" &&
          ability.cooldownCompleteAtTick === null &&
          ability.rejectionReason === null
      )
    );
    if (dwarf === undefined) return;
    lastAbilityTick = message.authoritativeTick;
    abilityActivations += 1;
    worker.postMessage({
      protocolVersion: 4,
      type: "command",
      requestId: `ability-${message.authoritativeTick}`,
      command: {
        type: "activateAbility",
        dwarfEntityId: dwarf.entityId,
        abilityId: "ability.iron_warden.shield_slam"
      }
    });
  });
  try {
    worker.postMessage({
      protocolVersion: 4,
      type: "initialize",
      runConfiguration: {
        schemaVersion: 1,
        attemptId,
        seed: String(attemptNumber),
        placementPointId: "placement.shuttergate_north_guard",
        profile
      }
    });
    await preparation;
    const paused = waitForMessage(
      worker,
      (message) =>
        message.type === "snapshot" &&
        message.phase === "running" &&
        message.protocolVersion === 4 &&
        message.manualPaused
    );
    worker.postMessage({
      protocolVersion: 4,
      type: "command",
      requestId: `prepare-${attemptNumber}`,
      command: { type: "confirmPreparation" }
    });
    await paused;
    worker.postMessage({
      protocolVersion: 4,
      type: "command",
      requestId: `speed-${attemptNumber}`,
      command: { type: "setSimulationSpeed", speed: 2 }
    });
    const resumeRequestId = `resume-${attemptNumber}`;
    worker.postMessage({
      protocolVersion: 4,
      type: "command",
      requestId: resumeRequestId,
      command: { type: "setManualPause", paused: false }
    });
    worker.postMessage({
      protocolVersion: 4,
      type: "command",
      requestId: `commit-${attemptNumber}`,
      command: { type: "commitManualResume", resumeRequestId }
    });
    const terminal = await result;
    if (terminal.type !== "result" || terminal.protocolVersion !== 4)
      throw new Error(
        terminal.type === "failure"
          ? terminal.message
          : "expected protocol 4 result"
      );
    return { result: terminal, maximumHealth, abilityActivations };
  } finally {
    worker.terminate();
  }
}

const expected = {
  terminalResult: "victory",
  finalStateChecksum:
    "3273b044b92e0941e35341de5aaef023db045af7c97983a7bd947c040e60fb33",
  eventStreamChecksum:
    "d081b5fbde5b7d474a38545e401939cbd0b63ecc6ad2558aedeaea0be4fb0d59"
} as const;
const motionPreferenceStorageKey =
  "dwarven-depths.presentation.motion-preference.v1";
const textScaleStorageKey = "dwarven-depths.presentation.text-scale.v1";
const contrastPreferenceStorageKey =
  "dwarven-depths.presentation.contrast-preference.v1";
const soundPreferenceStorageKey =
  "dwarven-depths.presentation.sound-preference.v1";

function freshWorkerRunConfiguration() {
  return {
    schemaVersion: 1 as const,
    attemptId: "attempt.shuttergate.web_000001" as never,
    seed: "1",
    placementPointId: "placement.shuttergate_north_guard" as never,
    profile: createInitialProfile("character.iron_warden" as never)
  };
}

let root: Root | undefined;
afterEach(async () => {
  root?.unmount();
  root = undefined;
  document.body.replaceChildren();
  window.localStorage.removeItem(motionPreferenceStorageKey);
  window.localStorage.removeItem(textScaleStorageKey);
  window.localStorage.removeItem(contrastPreferenceStorageKey);
  window.localStorage.removeItem(soundPreferenceStorageKey);
  window.history.replaceState(null, "", "/");
  vi.restoreAllMocks();
  await page.viewport(1280, 720);
});

function waitForMessage(
  worker: Worker,
  predicate: (message: WorkerMessage) => boolean,
  timeoutMilliseconds = 10_000
): Promise<WorkerMessage> {
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(
      () => reject(new Error("worker response timed out")),
      timeoutMilliseconds
    );
    worker.addEventListener("message", (event: MessageEvent<unknown>) => {
      const message = parseWorkerMessage(event.data);
      if (message !== undefined && predicate(message)) {
        window.clearTimeout(timeout);
        resolve(message);
      }
    });
  });
}

class ControlledResultWorker {
  readonly listeners = new Set<(event: MessageEvent<unknown>) => void>();
  terminated = false;

  constructor(
    readonly terminalResult: "victory" | "defeat" = expected.terminalResult,
    readonly campaignAttemptId?: string
  ) {}

  addEventListener(
    type: string,
    listener: (event: MessageEvent<unknown>) => void
  ): void {
    if (type === "message") this.listeners.add(listener);
  }

  postMessage(message: unknown): void {
    if (typeof message !== "object" || message === null) return;
    const candidate = message as {
      readonly type?: string;
      readonly command?: { readonly type?: string };
    };
    if (candidate.type === "initialize") {
      this.emit({
        protocolVersion: 4,
        type: "snapshot",
        phase: "preparation",
        levelId: "level.shuttergate_hall",
        deployableEntityCount: 0,
        placementPointCount: 2
      });
    } else if (
      candidate.type === "command" &&
      candidate.command?.type === "confirmPreparation"
    ) {
      this.emit({
        protocolVersion: 3,
        type: "render_snapshot",
        snapshot: {
          schemaVersion: 1,
          levelId: "level.shuttergate_hall",
          mapId: null,
          tick: 1,
          phase: "terminal",
          nodes: [],
          connections: [],
          entities: []
        }
      });
      const campaignAttemptNumber =
        this.campaignAttemptId === undefined
          ? 0
          : Number(this.campaignAttemptId.slice(-6));
      this.emit({
        protocolVersion: 4,
        type: "result",
        terminalResult: this.terminalResult,
        terminalTick: 1,
        finalStateChecksum: expected.finalStateChecksum,
        eventStreamChecksum: expected.eventStreamChecksum,
        ...(this.campaignAttemptId === undefined
          ? {}
          : {
              campaign: {
                schemaVersion: 1,
                attemptId: this.campaignAttemptId,
                rewardId: `reward.${this.campaignAttemptId}`,
                forgeOreAwarded: 8,
                profile: {
                  ...createInitialProfile("character.iron_warden" as never),
                  revision: campaignAttemptNumber,
                  forgeOre: campaignAttemptNumber * 8,
                  claimedRewardIds: Array.from(
                    { length: campaignAttemptNumber },
                    (_, index) =>
                      `reward.attempt.shuttergate.web_${String(index + 1).padStart(6, "0")}`
                  )
                }
              }
            }),
        commands: [
          {
            tick: 0,
            sequence: 0,
            command: { atTick: 0, type: "confirmPreparation" }
          }
        ]
      });
    }
  }

  emit(message: unknown): void {
    const event = new MessageEvent("message", { data: message });
    for (const listener of this.listeners) listener(event);
  }

  terminate(): void {
    this.terminated = true;
  }
}

class ControlledFailureWorker {
  readonly listeners = new Set<(event: MessageEvent<unknown>) => void>();
  readonly errorListeners = new Set<(event: ErrorEvent) => void>();
  terminated = false;
  throwOnConfirm = false;

  addEventListener(
    type: string,
    listener:
      | ((event: MessageEvent<unknown>) => void)
      | ((event: ErrorEvent) => void)
  ): void {
    if (type === "message")
      this.listeners.add(listener as (event: MessageEvent<unknown>) => void);
    if (type === "error")
      this.errorListeners.add(listener as (event: ErrorEvent) => void);
  }

  postMessage(message: unknown): void {
    if (typeof message !== "object" || message === null) return;
    const candidate = message as {
      readonly type?: string;
      readonly command?: { readonly type?: string };
    };
    if (candidate.type === "initialize") {
      this.emit({
        protocolVersion: 4,
        type: "snapshot",
        phase: "preparation",
        levelId: "level.shuttergate_hall",
        deployableEntityCount: 0,
        placementPointCount: 2
      });
    } else if (candidate.command?.type === "confirmPreparation") {
      if (this.throwOnConfirm) throw new Error("confirmation transport failed");
      this.emit({
        protocolVersion: 4,
        type: "failure",
        code: "runtime_failure",
        message:
          "level.shuttergate_hall reached internal entity character.iron_warden"
      });
    }
  }

  emit(message: unknown): void {
    const event = new MessageEvent("message", { data: message });
    for (const listener of this.listeners) listener(event);
  }

  emitError(message: string): void {
    const event = new ErrorEvent("error", { message });
    for (const listener of this.errorListeners) listener(event);
  }

  terminate(): void {
    this.terminated = true;
  }
}

class ControlledJourneyWorker {
  readonly listeners = new Set<(event: MessageEvent<unknown>) => void>();
  terminated = false;
  runConfiguration:
    | { readonly attemptId: string; readonly profile: ProfileState }
    | undefined;

  addEventListener(
    type: string,
    listener: (event: MessageEvent<unknown>) => void
  ): void {
    if (type === "message") this.listeners.add(listener);
  }

  postMessage(message: unknown): void {
    if (typeof message !== "object" || message === null) return;
    const candidate = message as {
      readonly type?: string;
      readonly command?: { readonly type?: string; readonly paused?: boolean };
      readonly runConfiguration?: {
        readonly attemptId: string;
        readonly profile: ProfileState;
      };
    };
    if (candidate.type === "initialize") {
      this.runConfiguration = candidate.runConfiguration;
      this.emit({
        protocolVersion: 4,
        type: "snapshot",
        phase: "preparation",
        levelId: "level.shuttergate_hall",
        deployableEntityCount: 0,
        placementPointCount: 2
      });
    } else if (candidate.command?.type === "confirmPreparation") {
      this.emit({
        protocolVersion: 4,
        type: "snapshot",
        phase: "running",
        manualPaused: false,
        resumeRequestId: "guided-run",
        simulationSpeed: 1
      });
    } else if (candidate.command?.type === "setManualPause") {
      this.emit({
        protocolVersion: 4,
        type: "snapshot",
        phase: "running",
        manualPaused: candidate.command.paused === true,
        resumeRequestId:
          candidate.command.paused === true ? null : "guided-resume",
        simulationSpeed: 1
      });
    }
  }

  finish(
    profileForgeOreAwarded = 8,
    terminalResult: "victory" | "defeat" = expected.terminalResult
  ): void {
    const runConfiguration = this.runConfiguration;
    if (runConfiguration === undefined)
      throw new Error("journey worker was not initialized");
    const rewardId = `reward.${runConfiguration.attemptId}`;
    const forgeOreAwarded = 8;
    this.emit({
      protocolVersion: 4,
      type: "result",
      terminalResult,
      terminalTick: 1,
      finalStateChecksum: expected.finalStateChecksum,
      eventStreamChecksum: expected.eventStreamChecksum,
      campaign: {
        schemaVersion: 1,
        attemptId: runConfiguration.attemptId,
        rewardId,
        forgeOreAwarded,
        profile: {
          ...runConfiguration.profile,
          revision: runConfiguration.profile.revision + 1,
          forgeOre: runConfiguration.profile.forgeOre + profileForgeOreAwarded,
          claimedRewardIds: [
            ...runConfiguration.profile.claimedRewardIds,
            rewardId
          ]
        }
      },
      commands: [
        {
          tick: 0,
          sequence: 0,
          command: { atTick: 0, type: "confirmPreparation" }
        }
      ]
    });
  }

  emitTerminalSnapshot(terminalResult: "victory" | "defeat" = "victory"): void {
    this.emit({
      protocolVersion: 4,
      type: "render_snapshot",
      snapshot: {
        schemaVersion: 2,
        scenarioId: "scenario.shuttergate.terminal-presentation",
        levelId: "level.shuttergate_hall",
        mapId: "map.shuttergate_hall",
        tick: 1,
        previousTick: null,
        phase: "terminal",
        nodes: [],
        connections: [],
        entities: [],
        entityTransitions: [],
        encounter: {
          startedWaveIds: [
            "wave.shuttergate.1",
            "wave.shuttergate.2",
            "wave.shuttergate.3",
            "wave.shuttergate.4",
            "wave.shuttergate.5"
          ],
          activeWaveId: "wave.shuttergate.5",
          pendingSpawnCount: 0,
          livingHostileCount: 0,
          terminalResult
        }
      }
    });
  }

  emit(message: unknown): void {
    const event = new MessageEvent("message", { data: message });
    for (const listener of this.listeners) listener(event);
  }

  terminate(): void {
    this.terminated = true;
  }
}

class PersistentJourneyProfileStore implements CheckpointProfileStore {
  envelope: ProfileSaveEnvelope | undefined;
  writes = 0;

  async load() {
    return this.envelope === undefined
      ? ({ status: "empty" } as const)
      : ({
          status: "loaded",
          source: "primary",
          envelope: this.envelope,
          migratedFromSchemaVersion: null
        } as const);
  }

  async write(request: {
    readonly expectedRevision: number | null;
    readonly envelope: unknown;
  }): Promise<ProfileSaveEnvelope> {
    const currentRevision = this.envelope?.profile.revision ?? null;
    if (request.expectedRevision !== currentRevision)
      throw new IndexedDbProfileStoreError(
        "save_conflict",
        "unexpected journey profile revision"
      );
    this.envelope = request.envelope as ProfileSaveEnvelope;
    this.writes += 1;
    return this.envelope;
  }

  async close(): Promise<void> {}
}

class ControlledTargetPolicyWorker {
  readonly listeners = new Set<(event: MessageEvent<unknown>) => void>();
  readonly targetPolicyCommands: string[] = [];
  readonly abilityCommands: string[] = [];
  readonly speedCommands: number[] = [];
  acknowledgeSpeedCommands = true;
  lastTargetPolicyRequestId: string | undefined;
  lastAbilityRequestId: string | undefined;

  addEventListener(
    type: string,
    listener: (event: MessageEvent<unknown>) => void
  ): void {
    if (type === "message") this.listeners.add(listener);
  }

  postMessage(message: unknown): void {
    if (typeof message !== "object" || message === null) return;
    const candidate = message as {
      readonly type?: string;
      readonly requestId?: string;
      readonly command?: {
        readonly type?: string;
        readonly requestedPolicy?: string;
        readonly abilityId?: string;
        readonly speed?: number;
      };
    };
    if (candidate.type === "initialize") {
      this.emit({
        protocolVersion: 4,
        type: "snapshot",
        phase: "preparation",
        levelId: "level.shuttergate_hall",
        deployableEntityCount: 1,
        placementPointCount: 2
      });
    } else if (candidate.command?.type === "confirmPreparation") {
      this.emit({
        protocolVersion: 4,
        type: "snapshot",
        phase: "running",
        manualPaused: true,
        resumeRequestId: null,
        simulationSpeed: 1
      });
      this.emit({
        protocolVersion: 4,
        type: "render_snapshot",
        snapshot: {
          schemaVersion: 2,
          scenarioId: "scenario.shuttergate",
          levelId: "level.shuttergate_hall",
          mapId: "map.shuttergate_hall",
          tick: 10,
          previousTick: 9,
          phase: "running",
          nodes: [],
          connections: [],
          entities: [],
          entityTransitions: [],
          encounter: {
            startedWaveIds: [],
            activeWaveId: null,
            pendingSpawnCount: 0,
            livingHostileCount: 0,
            terminalResult: null
          }
        }
      });
      this.emitControls(10);
    } else if (
      candidate.command?.type === "setTargetPolicy" &&
      candidate.command.requestedPolicy !== undefined
    ) {
      this.targetPolicyCommands.push(candidate.command.requestedPolicy);
      this.lastTargetPolicyRequestId = candidate.requestId;
    } else if (
      candidate.command?.type === "activateAbility" &&
      candidate.command.abilityId !== undefined
    ) {
      this.abilityCommands.push(candidate.command.abilityId);
      this.lastAbilityRequestId = candidate.requestId;
    } else if (
      candidate.command?.type === "setSimulationSpeed" &&
      candidate.command.speed !== undefined
    ) {
      this.speedCommands.push(candidate.command.speed);
      if (this.acknowledgeSpeedCommands)
        this.emitSpeed(candidate.command.speed as 1 | 2);
    }
  }

  emitSpeed(speed: 1 | 2): void {
    this.emit({
      protocolVersion: 4,
      type: "snapshot",
      phase: "running",
      manualPaused: true,
      resumeRequestId: null,
      simulationSpeed: speed
    });
  }

  emitControls(
    authoritativeTick: number,
    acknowledgedRequestIds: readonly string[] = [],
    currentTargetPolicy: "nearest" | "highest_armor" = "nearest"
  ): void {
    this.emit({
      protocolVersion: 4,
      type: "combat_controls",
      acknowledgedRequestIds,
      authoritativeTick,
      contentManifestHash: "a".repeat(64),
      dwarves: [
        {
          entityId: "entity.dwarf.warden",
          characterId: "character.iron_warden",
          currentTargetPolicy,
          supportedTargetPolicies: ["nearest", "highest_armor"],
          activeAbilities: [
            {
              abilityId: "ability.iron_warden.shield_slam",
              cooldownCompleteAtTick: null,
              rejectionReason: null
            }
          ]
        }
      ]
    });
  }

  emit(message: unknown): void {
    const event = new MessageEvent("message", { data: message });
    for (const listener of this.listeners) listener(event);
  }

  terminate(): void {}
}

async function buttonWithText(text: string): Promise<HTMLButtonElement> {
  return vi.waitFor(() => {
    const candidate = Array.from(document.querySelectorAll("button")).find(
      (button) => button.textContent === text
    );
    expect(candidate).toBeInstanceOf(HTMLButtonElement);
    return candidate as HTMLButtonElement;
  });
}

async function completeAppAttempt(): Promise<string> {
  await userEvent.click(await buttonWithText("Begin preparation"));
  await userEvent.click(await buttonWithText("Confirm preparation"));
  await buttonWithText("Return to checkpoint");
  const evidence = document.querySelector(".evidence")?.textContent;
  expect(evidence).toContain("Terminal result");
  expect(evidence).toContain("Final state checksum");
  expect(document.querySelector('[role="status"]')?.textContent).toMatch(
    /Run complete: (victory|defeat)\./
  );
  return evidence ?? "";
}

async function resultHeading(text: string): Promise<HTMLHeadingElement> {
  return vi.waitFor(() => {
    const heading = document.querySelector("#results-heading");
    expect(heading).toBeInstanceOf(HTMLHeadingElement);
    expect(heading?.textContent).toBe(text);
    return heading as HTMLHeadingElement;
  });
}

function renderApp(): void {
  const container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  root.render(<App />);
}

function appliedMotionPreference(): string | null {
  return (
    document.querySelector("main")?.getAttribute("data-motion-preference") ??
    null
  );
}

function appliedTextScale(): string | null {
  return (
    document.querySelector("main")?.getAttribute("data-text-scale") ?? null
  );
}

function appliedContrastPreference(): string | null {
  return (
    document.querySelector("main")?.getAttribute("data-contrast-preference") ??
    null
  );
}

function appliedSoundPreference(): string | null {
  return (
    document.querySelector("main")?.getAttribute("data-sound-preference") ??
    null
  );
}

function journeyStepStates(): string[] {
  return Array.from(
    document.querySelectorAll<HTMLElement>(".run-journey-step")
  ).map((step) => step.dataset["state"] ?? "");
}

describe("run journey guidance", () => {
  it("tracks the full authoritative path in StrictMode without live-region duplication", async () => {
    const workers: ControlledJourneyWorker[] = [];
    const createWorker = (): Worker => {
      const worker = new ControlledJourneyWorker();
      workers.push(worker);
      return worker as unknown as Worker;
    };
    const container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    root.render(
      <StrictMode>
        <App createWorker={createWorker} />
      </StrictMode>
    );

    const journey = await vi.waitFor(() => {
      const candidate = document
        .querySelector("#run-journey-heading")
        ?.closest("section");
      expect(candidate).toBeInstanceOf(HTMLElement);
      return candidate as HTMLElement;
    });
    expect(journey.querySelector('[role="status"]')).toBeNull();
    expect(journeyStepStates()).toEqual([
      "current",
      "upcoming",
      "upcoming",
      "upcoming"
    ]);
    expect(journey.querySelector('[aria-current="step"]')).toHaveTextContent(
      "Review the checkpoint"
    );

    await userEvent.click(await buttonWithText("Begin preparation"));
    await vi.waitFor(() =>
      expect(journeyStepStates()).toEqual([
        "complete",
        "current",
        "upcoming",
        "upcoming"
      ])
    );
    const preparation = document.querySelector(".preparation-summary");
    expect(preparation).toHaveTextContent("Fixed tutorial deployment");
    expect(preparation).toHaveTextContent(
      "There is no placement choice in this tutorial defence."
    );
    expect(preparation).toHaveTextContent("North approach · locked");
    expect(preparation?.textContent).not.toContain("placement points");

    await userEvent.click(await buttonWithText("Confirm preparation"));
    await buttonWithText("Pause combat");
    expect(document.querySelector(".status")?.textContent).toContain(
      "Combat is underway"
    );
    expect(document.querySelector(".status")?.textContent).not.toContain(
      "worker"
    );
    expect(journeyStepStates()).toEqual([
      "complete",
      "complete",
      "current",
      "upcoming"
    ]);
    expect(journey.querySelector('[aria-current="step"]')).toHaveTextContent(
      "Press Escape"
    );
    expect(journey.querySelector('[aria-current="step"]')).toHaveTextContent(
      "changing windows pauses automatically"
    );
    await userEvent.keyboard("{Escape}");
    await buttonWithText("Resume combat");

    workers.at(-1)?.finish();
    await resultHeading("Victory results");
    expect(journeyStepStates()).toEqual([
      "complete",
      "complete",
      "complete",
      "current"
    ]);
    expect(journey.querySelector('[aria-current="step"]')).toHaveTextContent(
      "download its authoritative run evidence"
    );
    const summary = document.querySelector(".result-summary");
    expect(summary).toHaveAccessibleName("Expedition summary");
    expect(summary).toHaveTextContent("OutcomeFortress held");
    expect(summary).toHaveTextContent("Forge Ore earned+8");
    expect(summary).toHaveTextContent("New balance8 Forge Ore");
    expect(document.querySelector(".results")).toHaveTextContent(
      "spend your reward and muster the next defence"
    );
  });

  it("keeps the terminal battlefield mounted through its departure interval", async () => {
    const worker = new ControlledJourneyWorker();
    const store = new PersistentJourneyProfileStore();
    const container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    root.render(
      <App
        createWorker={() => worker as unknown as Worker}
        createProfileStore={() => store}
      />
    );

    await userEvent.click(await buttonWithText("Begin preparation"));
    await userEvent.click(await buttonWithText("Confirm preparation"));
    await buttonWithText("Pause combat");
    const terminalSnapshotEmittedAt = Date.now();
    worker.emitTerminalSnapshot();
    worker.finish();

    await vi.waitFor(() =>
      expect(document.querySelector(".active-combat-screen")).not.toBeNull()
    );
    expect(document.querySelector("#results-heading")).toBeNull();
    await vi.waitFor(
      () =>
        expect(window.__DWARVEN_DEPTHS_RENDERER__?.snapshotPhase).toBe(
          "terminal"
        ),
      { timeout: 10_000 }
    );
    await resultHeading("Victory results");
    expect(Date.now() - terminalSnapshotEmittedAt).toBeGreaterThanOrEqual(650);
    expect(document.querySelector(".active-combat-screen")).toBeNull();
    expect(document.querySelector(".result-summary")).toHaveTextContent(
      "Waves faced5"
    );
  });

  it("does not strand a terminal result when battlefield assets fail to load", async () => {
    const sourceDescriptor = Object.getOwnPropertyDescriptor(
      HTMLImageElement.prototype,
      "src"
    );
    if (sourceDescriptor?.set === undefined)
      throw new Error("HTMLImageElement.src setter is unavailable");
    const setImageSource = sourceDescriptor.set;
    let failedBattlefieldAsset = false;
    vi.spyOn(HTMLImageElement.prototype, "src", "set").mockImplementation(
      function (this: HTMLImageElement, value: string) {
        if (!failedBattlefieldAsset && value.includes("environment-base")) {
          failedBattlefieldAsset = true;
          queueMicrotask(() => this.dispatchEvent(new Event("error")));
          return;
        }
        setImageSource.call(this, value);
      }
    );
    const worker = new ControlledJourneyWorker();
    const container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    root.render(
      <App
        createWorker={() => worker as unknown as Worker}
        createProfileStore={() => new PersistentJourneyProfileStore()}
      />
    );

    await userEvent.click(await buttonWithText("Begin preparation"));
    await userEvent.click(await buttonWithText("Confirm preparation"));
    worker.emitTerminalSnapshot();
    worker.finish();

    await vi.waitFor(
      () =>
        expect(
          document
            .querySelector(".battlefield-canvas")
            ?.getAttribute("data-renderer-error")
        ).toBe("asset-load-failed"),
      { timeout: 10_000 }
    );
    expect(failedBattlefieldAsset).toBe(true);
    await resultHeading("Victory results");
    expect(document.querySelector(".active-combat-screen")).toBeNull();
  });

  it("rejects contradictory terminal progression when profile storage is unavailable", async () => {
    const workers: ControlledJourneyWorker[] = [];
    const createWorker = (): Worker => {
      const worker = new ControlledJourneyWorker();
      workers.push(worker);
      return worker as unknown as Worker;
    };
    const createProfileStore = (): CheckpointProfileStore => ({
      load: async () => {
        throw new Error("IndexedDB unavailable");
      },
      write: async () => {
        throw new Error("unexpected profile write");
      },
      close: async () => undefined
    });
    const container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    root.render(
      <App
        createWorker={createWorker}
        createProfileStore={createProfileStore}
      />
    );

    await userEvent.click(await buttonWithText("Begin preparation"));
    await userEvent.click(await buttonWithText("Confirm preparation"));
    await buttonWithText("Pause combat");
    workers.at(-1)?.finish(9);

    const failure = await vi.waitFor(() => {
      const candidate = document.querySelector("#failure-heading");
      expect(candidate).toBeInstanceOf(HTMLHeadingElement);
      return candidate as HTMLHeadingElement;
    });
    expect(failure).toHaveTextContent("The company must regroup");
    expect(failure.closest("section")).toHaveTextContent(
      "The expedition could not continue. Return to the checkpoint and try again."
    );
    expect(document.querySelector("#results-heading")).toBeNull();
  });

  it("does not claim a valid terminal reward was saved when profile storage is unavailable", async () => {
    const workers: ControlledJourneyWorker[] = [];
    const createWorker = (): Worker => {
      const worker = new ControlledJourneyWorker();
      workers.push(worker);
      return worker as unknown as Worker;
    };
    const container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    root.render(
      <App
        createWorker={createWorker}
        createProfileStore={() => ({
          load: async () => {
            throw new Error("IndexedDB unavailable");
          },
          write: async () => {
            throw new Error("unexpected profile write");
          },
          close: async () => undefined
        })}
      />
    );

    await userEvent.click(await buttonWithText("Begin preparation"));
    await userEvent.click(await buttonWithText("Confirm preparation"));
    await buttonWithText("Pause combat");
    workers.at(-1)?.finish(8);

    await resultHeading("Victory results");
    const results = document.querySelector(".results");
    expect(results).toHaveTextContent("Run balance8 Forge Ore");
    expect(results).toHaveTextContent("ProgressionReward not saved");
    expect(results).toHaveTextContent(
      "Local progression is unavailable. Return to the checkpoint and retry when storage is available; this run's reward cannot be spent."
    );
    expect(results).not.toHaveTextContent("Reward saved");
    expect(results).not.toHaveTextContent("spend your reward");
  });

  it("preserves the authoritative result summary when terminal progression cannot be written", async () => {
    window.history.replaceState(null, "", "/?inspection=1");
    const worker = new ControlledJourneyWorker();
    const store = new PersistentJourneyProfileStore();
    const writeProfile = store.write.bind(store);
    store.write = async (request) => {
      if (store.writes === 0) return writeProfile(request);
      throw new Error("IndexedDB write failed");
    };
    const container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    root.render(
      <App
        createWorker={() => worker as unknown as Worker}
        createProfileStore={() => store}
      />
    );

    await userEvent.click(await buttonWithText("Begin preparation"));
    await userEvent.click(await buttonWithText("Confirm preparation"));
    await buttonWithText("Pause combat");
    worker.emitTerminalSnapshot();
    worker.finish();

    await vi.waitFor(
      () =>
        expect(document.querySelector("#results-heading")).toBeInstanceOf(
          HTMLHeadingElement
        ),
      { timeout: 10_000 }
    );
    await resultHeading("Victory results");
    const results = document.querySelector(".results");
    expect(results).toHaveTextContent("OutcomeFortress held");
    expect(results).toHaveTextContent("Waves faced5");
    expect(results).toHaveTextContent("Forge Ore earned+8");
    expect(results).toHaveTextContent("Run balance8 Forge Ore");
    expect(results).toHaveTextContent("ProgressionReward not saved");
    expect(results).toHaveTextContent("this run's reward cannot be spent");
    expect(results).toHaveTextContent("Progression saveIndexedDB write failed");
    expect(document.querySelector("#failure-heading")).toBeNull();
  });

  it("does not let a late worker failure overtake an accepted terminal reward", async () => {
    const worker = new ControlledJourneyWorker();
    const store = new PersistentJourneyProfileStore();
    const writeProfile = store.write.bind(store);
    let terminalEnvelope: ProfileSaveEnvelope | undefined;
    let resolveTerminalWrite:
      | ((envelope: ProfileSaveEnvelope) => void)
      | undefined;
    store.write = async (request) => {
      if (store.writes === 0) return writeProfile(request);
      terminalEnvelope = request.envelope as ProfileSaveEnvelope;
      return new Promise<ProfileSaveEnvelope>((resolve) => {
        resolveTerminalWrite = resolve;
      });
    };
    const container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    root.render(
      <App
        createWorker={() => worker as unknown as Worker}
        createProfileStore={() => store}
      />
    );

    await userEvent.click(await buttonWithText("Begin preparation"));
    await userEvent.click(await buttonWithText("Confirm preparation"));
    await buttonWithText("Pause combat");
    worker.finish();
    await vi.waitFor(() => expect(resolveTerminalWrite).toBeTypeOf("function"));

    worker.emit({ malformed: "late worker response" });
    if (terminalEnvelope === undefined || resolveTerminalWrite === undefined)
      throw new Error("terminal profile write was not pending");
    store.envelope = terminalEnvelope;
    resolveTerminalWrite(terminalEnvelope);

    await resultHeading("Victory results");
    const results = document.querySelector(".results");
    expect(results).toHaveTextContent("Forge Ore earned+8");
    expect(results).toHaveTextContent("New balance8 Forge Ore");
    expect(results).toHaveTextContent("ProgressionReward saved");
    expect(results).not.toHaveTextContent("No reward was applied");
    expect(document.querySelector("#failure-heading")).toBeNull();
    expect(store.envelope.profile.forgeOre).toBe(8);
  });

  it("adapts terminal guidance to failure details", async () => {
    const createWorker = (): Worker =>
      new ControlledFailureWorker() as unknown as Worker;
    const container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    root.render(<App createWorker={createWorker} />);

    await userEvent.click(await buttonWithText("Begin preparation"));
    await userEvent.click(await buttonWithText("Confirm preparation"));
    const failureHeading = await vi.waitFor(() => {
      const candidate = document.querySelector("#failure-heading");
      expect(candidate).toBeInstanceOf(HTMLHeadingElement);
      return candidate as HTMLHeadingElement;
    });
    expect(document.activeElement).toBe(failureHeading);
    expect(journeyStepStates()).toEqual([
      "complete",
      "complete",
      "complete",
      "current"
    ]);
    expect(document.querySelector('[aria-current="step"]')).toHaveTextContent(
      "Review the failure details"
    );
    expect(
      document.querySelector('[aria-current="step"]')
    ).not.toHaveTextContent("download");
  });

  it("keeps diagnostics out of the enlarged high-contrast player frame at 320 pixels", async () => {
    await page.viewport(320, 720);
    window.localStorage.setItem(textScaleStorageKey, "extra-large");
    window.localStorage.setItem(contrastPreferenceStorageKey, "high");
    window.localStorage.setItem(motionPreferenceStorageKey, "reduce");
    renderApp();

    const inspection = await vi.waitFor(() => {
      const candidate = document.querySelector(".inspection-surface");
      expect(candidate).toBeInstanceOf(HTMLDetailsElement);
      return candidate as HTMLDetailsElement;
    });
    expect(inspection).toHaveAttribute("hidden");
    expect(inspection.getBoundingClientRect().width).toBe(0);
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(
      window.innerWidth
    );
    const main = document.querySelector("main");
    expect(main).toHaveAttribute("aria-labelledby", "app-heading");
    expect(document.querySelectorAll("h1")).toHaveLength(1);
    expect(document.querySelector("#app-heading")).toHaveTextContent(
      "Dwarven Depths"
    );
    for (const control of document.querySelectorAll<HTMLElement>(
      "button:not(:disabled), input:not(:disabled), select:not(:disabled)"
    )) {
      const labelledBy = control.getAttribute("aria-labelledby");
      const label =
        control.getAttribute("aria-label") ??
        (labelledBy === null
          ? undefined
          : document.getElementById(labelledBy)?.textContent) ??
        (control instanceof HTMLInputElement ||
        control instanceof HTMLSelectElement
          ? control.labels?.[0]?.textContent
          : control.textContent);
      expect(label?.trim(), control.outerHTML).not.toBe("");
    }

    const settingsButton = await buttonWithText("Settings");
    settingsButton.focus();
    await userEvent.keyboard("{Enter}");
    const settingsHeading = document.querySelector(
      "#presentation-settings-heading"
    );
    await vi.waitFor(() =>
      expect(document.activeElement).toBe(settingsHeading)
    );
    expect(main).toHaveAttribute("data-text-scale", "extra-large");
    expect(main).toHaveAttribute("data-contrast-preference", "high");
    expect(main).toHaveAttribute("data-motion-preference", "reduce");
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(
      window.innerWidth
    );
    await userEvent.keyboard("{Shift>}{Tab}{/Shift}");
    expect(await buttonWithText("Close settings")).toHaveFocus();
    await userEvent.keyboard("{Escape}");
    await vi.waitFor(() =>
      expect(document.activeElement).toBe(
        Array.from(document.querySelectorAll("button")).find(
          (button) => button.textContent === "Settings"
        )
      )
    );
  });
});

describe("presentation settings", () => {
  it("opens and closes by keyboard with deterministic focus restoration", async () => {
    renderApp();
    const settingsButton = await buttonWithText("Settings");
    settingsButton.focus();
    await userEvent.keyboard("{Enter}");

    const heading = await vi.waitFor(() => {
      const candidate = document.querySelector(
        "#presentation-settings-heading"
      );
      expect(candidate).toBeInstanceOf(HTMLHeadingElement);
      return candidate as HTMLHeadingElement;
    });
    expect(document.activeElement).toBe(heading);
    const dialog = heading.closest('[role="dialog"]');
    expect(dialog).toBeInstanceOf(HTMLElement);
    expect(dialog?.getAttribute("aria-modal")).toBe("true");
    expect(dialog?.textContent).not.toContain("authoritative simulation");

    await userEvent.keyboard("{Shift>}{Tab}{/Shift}");
    expect(await buttonWithText("Close settings")).toHaveFocus();
    await userEvent.keyboard("{Tab}");
    expect(document.activeElement).toBe(
      document.querySelector("#motion-preference")
    );

    await userEvent.keyboard("{Escape}");
    await vi.waitFor(() =>
      expect(document.activeElement).toBe(
        Array.from(document.querySelectorAll("button")).find(
          (button) => button.textContent === "Settings"
        )
      )
    );
    expect(document.querySelector("#presentation-settings-heading")).toBeNull();
  });

  it("applies and persists a mouse-selected presentation preference", async () => {
    renderApp();
    await userEvent.click(await buttonWithText("Settings"));
    const select = document.querySelector("#motion-preference");
    expect(select).toBeInstanceOf(HTMLSelectElement);
    await userEvent.selectOptions(select as HTMLSelectElement, "reduce");

    expect(appliedMotionPreference()).toBe("reduce");
    expect(window.localStorage.getItem(motionPreferenceStorageKey)).toBe(
      "reduce"
    );
    await userEvent.click(await buttonWithText("Close settings"));
    root?.unmount();
    root = undefined;
    document.body.replaceChildren();

    renderApp();
    await vi.waitFor(() => expect(appliedMotionPreference()).toBe("reduce"));
  });

  it("falls back to device motion when storage is malformed or unavailable", async () => {
    window.localStorage.setItem(motionPreferenceStorageKey, "unexpected");
    renderApp();
    await vi.waitFor(() => expect(appliedMotionPreference()).toBe("device"));

    root?.unmount();
    root = undefined;
    document.body.replaceChildren();
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("blocked", "SecurityError");
    });
    renderApp();
    await vi.waitFor(() => expect(appliedMotionPreference()).toBe("device"));
  });

  it("keeps sound opt-in with keyboard-selectable quiet and full mix levels", async () => {
    renderApp();
    await vi.waitFor(() => expect(appliedSoundPreference()).toBe("off"));
    await userEvent.click(await buttonWithText("Settings"));
    const select = document.querySelector("#sound-preference");
    expect(select).toBeInstanceOf(HTMLSelectElement);
    (select as HTMLSelectElement).focus();
    await userEvent.keyboard("{ArrowDown}");
    await vi.waitFor(() => expect(appliedSoundPreference()).toBe("quiet"));
    expect(window.localStorage.getItem(soundPreferenceStorageKey)).toBe(
      "quiet"
    );
    await userEvent.keyboard("{ArrowDown}");
    await vi.waitFor(() => expect(appliedSoundPreference()).toBe("on"));
    expect(window.localStorage.getItem(soundPreferenceStorageKey)).toBe("on");

    root?.unmount();
    root = undefined;
    document.body.replaceChildren();
    renderApp();
    await vi.waitFor(() => expect(appliedSoundPreference()).toBe("on"));
  });

  it("falls back to sound off for malformed or unavailable storage", async () => {
    window.localStorage.setItem(soundPreferenceStorageKey, "unexpected");
    renderApp();
    await vi.waitFor(() => expect(appliedSoundPreference()).toBe("off"));

    root?.unmount();
    root = undefined;
    document.body.replaceChildren();
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("blocked", "SecurityError");
    });
    renderApp();
    await vi.waitFor(() => expect(appliedSoundPreference()).toBe("off"));
  });

  it("applies a keyboard-selected text scale", async () => {
    renderApp();
    await userEvent.click(await buttonWithText("Settings"));
    const select = document.querySelector("#text-scale");
    expect(select).toBeInstanceOf(HTMLSelectElement);
    (select as HTMLSelectElement).focus();
    await userEvent.keyboard("{ArrowDown}");

    await vi.waitFor(() => expect(appliedTextScale()).toBe("large"));
    expect(window.localStorage.getItem(textScaleStorageKey)).toBe("large");
  });

  it("persists a mouse-selected text scale across remounts", async () => {
    renderApp();
    await userEvent.click(await buttonWithText("Settings"));
    const select = document.querySelector("#text-scale");
    expect(select).toBeInstanceOf(HTMLSelectElement);
    await userEvent.selectOptions(select as HTMLSelectElement, "extra-large");
    expect(appliedTextScale()).toBe("extra-large");

    root?.unmount();
    root = undefined;
    document.body.replaceChildren();
    renderApp();
    await vi.waitFor(() => expect(appliedTextScale()).toBe("extra-large"));
  });

  it("falls back to default text scale for malformed or unavailable storage", async () => {
    window.localStorage.setItem(textScaleStorageKey, "unexpected");
    renderApp();
    await vi.waitFor(() => expect(appliedTextScale()).toBe("default"));

    root?.unmount();
    root = undefined;
    document.body.replaceChildren();
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("blocked", "SecurityError");
    });
    renderApp();
    await vi.waitFor(() => expect(appliedTextScale()).toBe("default"));
  });

  it("reflows extra-large settings at the supported narrow viewport", async () => {
    await page.viewport(320, 720);
    window.localStorage.setItem(textScaleStorageKey, "extra-large");
    renderApp();
    await userEvent.click(await buttonWithText("Settings"));

    await vi.waitFor(() => expect(appliedTextScale()).toBe("extra-large"));
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(
      document.documentElement.clientWidth
    );
    for (const control of document.querySelectorAll("select, button")) {
      const bounds = control.getBoundingClientRect();
      expect(bounds.left).toBeGreaterThanOrEqual(0);
      expect(bounds.right).toBeLessThanOrEqual(window.innerWidth);
    }
  });

  it("applies keyboard-selected high contrast to the current shell", async () => {
    renderApp();
    await userEvent.click(await buttonWithText("Settings"));
    const select = document.querySelector("#contrast-preference");
    expect(select).toBeInstanceOf(HTMLSelectElement);
    (select as HTMLSelectElement).focus();
    await userEvent.keyboard("{ArrowDown}");

    await vi.waitFor(() => expect(appliedContrastPreference()).toBe("high"));
    expect(window.localStorage.getItem(contrastPreferenceStorageKey)).toBe(
      "high"
    );
    const panel = document.querySelector(".panel");
    const settings = document.querySelector(".settings");
    const button = await buttonWithText("Close settings");
    expect(getComputedStyle(panel as Element).backgroundColor).toBe(
      "rgb(0, 0, 0)"
    );
    expect(getComputedStyle(settings as Element).borderTopColor).toBe(
      "rgb(255, 255, 255)"
    );
    expect(getComputedStyle(button).color).toBe("rgb(0, 0, 0)");
  });

  it("persists mouse-selected high contrast across remounts", async () => {
    renderApp();
    await userEvent.click(await buttonWithText("Settings"));
    const select = document.querySelector("#contrast-preference");
    expect(select).toBeInstanceOf(HTMLSelectElement);
    await userEvent.selectOptions(select as HTMLSelectElement, "high");
    expect(appliedContrastPreference()).toBe("high");

    root?.unmount();
    root = undefined;
    document.body.replaceChildren();
    renderApp();
    await vi.waitFor(() => expect(appliedContrastPreference()).toBe("high"));
  });

  it("falls back to standard contrast for malformed or unavailable storage", async () => {
    window.localStorage.setItem(contrastPreferenceStorageKey, "unexpected");
    renderApp();
    await vi.waitFor(() =>
      expect(appliedContrastPreference()).toBe("standard")
    );

    root?.unmount();
    root = undefined;
    document.body.replaceChildren();
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("blocked", "SecurityError");
    });
    renderApp();
    await vi.waitFor(() =>
      expect(appliedContrastPreference()).toBe("standard")
    );
  });
});

async function runWithPresentationFrames(
  presentationFrames: boolean
): Promise<Extract<WorkerMessage, { type: "result" }>> {
  const worker = new Worker(
    new URL("./simulation.worker.ts", import.meta.url),
    { type: "module" }
  );
  let frame = 0;
  try {
    const preparation = waitForMessage(
      worker,
      (message) =>
        message.type === "snapshot" && message.phase === "preparation"
    );
    worker.postMessage({
      protocolVersion: 3,
      type: "initialize"
    });
    await preparation;
    if (presentationFrames) {
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => resolve())
      );
      const animate = () => {
        frame = requestAnimationFrame(animate);
      };
      frame = requestAnimationFrame(animate);
    }
    const result = waitForMessage(
      worker,
      (message) => message.type === "result"
    );
    const paused = waitForMessage(
      worker,
      (message) =>
        message.type === "snapshot" &&
        message.phase === "running" &&
        message.protocolVersion !== 1 &&
        message.manualPaused
    );
    worker.postMessage({
      protocolVersion: 3,
      type: "command",
      requestId: presentationFrames ? "animated" : "idle",
      command: { type: "confirmPreparation" }
    });
    await paused;
    worker.postMessage({
      protocolVersion: 3,
      type: "command",
      requestId: "resume",
      command: { type: "setManualPause", paused: false }
    });
    worker.postMessage({
      protocolVersion: 3,
      type: "command",
      requestId: "commit-resume",
      command: { type: "commitManualResume", resumeRequestId: "resume" }
    });
    const message = await result;
    if (message.type !== "result") throw new Error("expected result");
    return message;
  } finally {
    if (frame !== 0) cancelAnimationFrame(frame);
    worker.terminate();
  }
}

describe("player-facing combat HUD", () => {
  it("projects health, wave, fortress, hostile, status, and pause summaries from one snapshot", async () => {
    const snapshot = {
      schemaVersion: 2,
      scenarioId: "scenario.shuttergate",
      levelId: "level.shuttergate_hall",
      mapId: "map.shuttergate_hall",
      tick: 24,
      previousTick: 23,
      phase: "running",
      nodes: [{ id: "node.gate", x: 0, y: 0 }],
      connections: [],
      entities: [
        {
          id: "entity.dwarf.warden",
          nodeId: "node.gate",
          faction: "dwarf",
          visualId: "visual.iron_warden",
          archetype: "character",
          position: { nodeId: "node.gate", x: 0, y: 0 },
          previousPosition: { nodeId: "node.gate", x: 0, y: 0 },
          currentHealth: 20,
          maximumHealth: 100,
          facing: "east",
          action: { kind: "idle", phase: "idle", abilityId: null },
          targetEntityId: null,
          statuses: [],
          transition: "active",
          elite: false,
          boss: false
        },
        {
          id: "entity.enemy.raider",
          nodeId: "node.gate",
          faction: "enemy",
          visualId: "visual.mine_raider",
          archetype: "elite",
          position: { nodeId: "node.gate", x: 0, y: 0 },
          previousPosition: { nodeId: "node.gate", x: 0, y: 0 },
          currentHealth: 40,
          maximumHealth: 60,
          facing: "west",
          action: { kind: "idle", phase: "idle", abilityId: null },
          targetEntityId: "entity.dwarf.warden",
          statuses: [
            {
              id: "status.staggered",
              appliedAtTick: 20,
              expiresAtTick: 30,
              magnitude: 1
            },
            {
              id: "status.slow",
              appliedAtTick: 22,
              expiresAtTick: 28,
              magnitude: 1
            }
          ],
          transition: "active",
          elite: true,
          boss: false
        }
      ],
      entityTransitions: [],
      encounter: {
        startedWaveIds: ["wave.shuttergate.one"],
        activeWaveId: "wave.shuttergate.one",
        pendingSpawnCount: 2,
        livingHostileCount: 1,
        terminalResult: null
      }
    } as const satisfies RenderSnapshot;
    const container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    root.render(<CombatHud snapshot={snapshot} manualPaused />);

    await vi.waitFor(() =>
      expect(document.querySelector(".combat-hud")?.textContent).toContain(
        "FortressHoldingWave1Hostiles1 active2 approaching"
      )
    );
    expect(document.querySelector(".combat-state-summary")?.textContent).toBe(
      "Combat paused. Fortress holding. Wave 1. 1 hostiles active, 2 approaching. Iron Warden health 20 of 100. Elite enemy is staggered, source Shield Slam, strength 1, from tick 20 through tick 30. Elite enemy is slowed, source slowing effect, strength 1, from tick 22 through tick 28."
    );
    expect(statusSignalKind("status.staggered")).toBe("stagger");
    expect(statusSignalKind("status.slow")).toBe("slow");
    expect(statusSignalKind("status.haste")).toBe("haste");
    expect(statusSignalKind("status.unknown")).toBe("unknown");
    expect(document.querySelector(".wave-signal")?.textContent).toBe(
      "Entrance watch Wave 1 · 2 approaching"
    );
    expect(document.querySelector(".wave-signal")).toHaveAttribute(
      "data-wave-signal",
      "approaching"
    );
    root.render(
      <CombatHud
        snapshot={{
          ...snapshot,
          entities: [
            snapshot.entities[0],
            {
              ...snapshot.entities[1],
              statuses: [
                {
                  id: "status.unknown",
                  appliedAtTick: 23,
                  expiresAtTick: 29,
                  magnitude: 1
                }
              ]
            }
          ]
        }}
      />
    );
    await vi.waitFor(() =>
      expect(
        document.querySelector(".combat-state-summary")?.textContent
      ).toContain(
        "Elite enemy is an unknown effect, source an unknown source, strength 1, from tick 23 through tick 29."
      )
    );
  });

  it("visibly distinguishes approaching hostiles and telegraphs elite arrivals", async () => {
    const snapshot = {
      schemaVersion: 2,
      scenarioId: "scenario.shuttergate",
      levelId: "level.shuttergate_hall",
      mapId: "map.shuttergate_hall",
      tick: 24,
      previousTick: 23,
      phase: "running",
      nodes: [],
      connections: [],
      entities: [
        {
          id: "entity.enemy.elite",
          nodeId: "node.entrance",
          faction: "enemy",
          visualId: "visual.gatebreaker_captain",
          archetype: "elite",
          position: { nodeId: "node.entrance", x: 0, y: 0 },
          previousPosition: { nodeId: "node.entrance", x: 0, y: 0 },
          currentHealth: 80,
          maximumHealth: 80,
          facing: "west",
          action: { kind: "idle", phase: "idle", abilityId: null },
          targetEntityId: null,
          statuses: [],
          transition: "spawned",
          elite: true,
          boss: false
        }
      ],
      entityTransitions: [
        { entityId: "entity.enemy.elite", kind: "spawned", atTick: 24 }
      ],
      encounter: {
        startedWaveIds: ["wave.shuttergate.one", "wave.shuttergate.two"],
        activeWaveId: "wave.shuttergate.two",
        pendingSpawnCount: 3,
        livingHostileCount: 1,
        terminalResult: null
      }
    } as const satisfies RenderSnapshot;
    const container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    root.render(<CombatHud snapshot={snapshot} />);

    await vi.waitFor(() =>
      expect(document.querySelector(".hud-plaque-right")?.textContent).toBe(
        "Hostiles1 active3 approaching"
      )
    );
    expect(document.querySelector(".wave-signal")?.textContent).toBe(
      "Elite breach Wave 2 · Reinforced hostile incoming"
    );
    expect(document.querySelector(".wave-signal")).toHaveAttribute(
      "data-wave-signal",
      "elite"
    );
  });

  it("announces an authoritative terminal result instead of active combat", async () => {
    const snapshot = {
      schemaVersion: 2,
      scenarioId: "scenario.shuttergate",
      levelId: "level.shuttergate_hall",
      mapId: "map.shuttergate_hall",
      tick: 50,
      previousTick: 49,
      phase: "terminal",
      nodes: [],
      connections: [],
      entities: [],
      entityTransitions: [],
      encounter: {
        startedWaveIds: ["wave.shuttergate.one"],
        activeWaveId: null,
        pendingSpawnCount: 0,
        livingHostileCount: 0,
        terminalResult: "defeat"
      }
    } as const satisfies RenderSnapshot;
    const container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    root.render(<CombatHud snapshot={snapshot} />);

    await vi.waitFor(() =>
      expect(document.querySelector(".combat-state-summary")?.textContent).toBe(
        "Combat ended in defeat. Fortress fallen. Wave Complete. 0 hostiles active."
      )
    );
  });
});

describe("semantic combat controls", () => {
  it("submits an authoritative stable dwarf and target-policy pair by keyboard", async () => {
    const onSetTargetPolicy = vi.fn();
    const container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    root.render(
      <CombatControls
        dwarves={[
          {
            entityId: "entity.dwarf.warden",
            characterId: "character.iron_warden",
            supportedTargetPolicies: ["nearest", "highest_armor"]
          }
        ]}
        onSetTargetPolicy={onSetTargetPolicy}
      />
    );

    await vi.waitFor(() =>
      expect(document.querySelectorAll("fieldset button")).toHaveLength(3)
    );
    const targetingTrigger = document.querySelector(
      ".character-portrait-button"
    );
    if (!(targetingTrigger instanceof HTMLButtonElement))
      throw new Error("expected character targeting trigger");
    await userEvent.click(targetingTrigger);
    const highestArmor = Array.from(document.querySelectorAll("button")).find(
      (button) => button.textContent === "Highest armor"
    );
    if (!(highestArmor instanceof HTMLButtonElement))
      throw new Error("expected target-policy button");
    highestArmor.focus();
    await userEvent.keyboard("{Enter}");
    expect(onSetTargetPolicy).toHaveBeenCalledWith(
      "entity.dwarf.warden",
      "highest_armor"
    );
  });

  it("locks targeting while an authoritative policy change is pending", async () => {
    const onSetTargetPolicy = vi.fn();
    const container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    root.render(
      <CombatControls
        dwarves={[
          {
            entityId: "entity.dwarf.warden",
            characterId: "character.iron_warden",
            supportedTargetPolicies: ["nearest", "highest_armor"]
          }
        ]}
        pendingTargetPolicies={
          new Map([["entity.dwarf.warden", "highest_armor"]])
        }
        onSetTargetPolicy={onSetTargetPolicy}
      />
    );

    const targetingTrigger = await vi.waitFor(() => {
      const candidate = document.querySelector(".character-portrait-button");
      expect(candidate).toBeInstanceOf(HTMLButtonElement);
      return candidate as HTMLButtonElement;
    });
    expect(targetingTrigger.disabled).toBe(true);
    expect(document.querySelector(".target-policy-label")?.textContent).toBe(
      "Highest armor"
    );
    expect(document.querySelector(".target-policy-menu")).not.toBeVisible();
    expect(onSetTargetPolicy).not.toHaveBeenCalled();
  });

  it("retains the policy lock until an acknowledged authoritative projection", async () => {
    const worker = new ControlledTargetPolicyWorker();
    const container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    root.render(<App createWorker={() => worker as unknown as Worker} />);

    await userEvent.click(await buttonWithText("Begin preparation"));
    await userEvent.click(await buttonWithText("Confirm preparation"));
    const targetingTrigger = await vi.waitFor(() => {
      const candidate = document.querySelector(".character-portrait-button");
      expect(candidate).toBeInstanceOf(HTMLButtonElement);
      return candidate as HTMLButtonElement;
    });
    await userEvent.click(targetingTrigger);
    await userEvent.click(await buttonWithText("Highest armor"));
    expect(worker.targetPolicyCommands).toEqual(["highest_armor"]);
    expect(targetingTrigger.disabled).toBe(true);

    worker.emitControls(10);
    await vi.waitFor(() => expect(targetingTrigger.disabled).toBe(true));
    expect(worker.targetPolicyCommands).toEqual(["highest_armor"]);

    worker.emitControls(11);
    await vi.waitFor(() => expect(targetingTrigger.disabled).toBe(true));
    const acknowledgedRequestId = worker.lastTargetPolicyRequestId;
    if (acknowledgedRequestId === undefined)
      throw new Error("expected target-policy request ID");
    worker.emitControls(10, [acknowledgedRequestId]);
    await vi.waitFor(() => expect(targetingTrigger.disabled).toBe(true));
    worker.emitControls(11, [acknowledgedRequestId], "highest_armor");
    await vi.waitFor(() => expect(targetingTrigger.disabled).toBe(false));
    expect(document.querySelector(".target-policy-label")?.textContent).toBe(
      "Highest armor"
    );
    await userEvent.click(targetingTrigger);
    const selectedPolicy = document.querySelector(
      '.target-policy-menu button[aria-pressed="true"]'
    );
    expect(selectedPolicy).toBeInstanceOf(HTMLButtonElement);
    expect(selectedPolicy?.textContent).toBe("Highest armor ✓");
    await userEvent.click(await buttonWithText("Nearest"));
    expect(worker.targetPolicyCommands).toEqual(["highest_armor", "nearest"]);
  });

  it("dismisses targeting with Escape without changing pause state", async () => {
    const worker = new ControlledTargetPolicyWorker();
    const container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    root.render(<App createWorker={() => worker as unknown as Worker} />);

    await userEvent.click(await buttonWithText("Begin preparation"));
    await userEvent.click(await buttonWithText("Confirm preparation"));
    const targetingTrigger = await vi.waitFor(() => {
      const candidate = document.querySelector(".character-portrait-button");
      expect(candidate).toBeInstanceOf(HTMLButtonElement);
      return candidate as HTMLButtonElement;
    });
    await userEvent.click(targetingTrigger);
    expect(document.querySelector(".target-policy-menu")).toBeVisible();
    await userEvent.keyboard("{Escape}");
    await vi.waitFor(() =>
      expect(document.querySelector(".target-policy-menu")).not.toBeVisible()
    );
    expect(document.querySelector(".combat-pause")).toHaveAttribute(
      "aria-label",
      "Resume combat"
    );
    expect(document.querySelector(".combat-pause")).toHaveAttribute(
      "aria-pressed",
      "true"
    );
  });

  it("submits the displayed Shield Slam shortcut and combat speed controls", async () => {
    const worker = new ControlledTargetPolicyWorker();
    const container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    root.render(<App createWorker={() => worker as unknown as Worker} />);

    await userEvent.click(await buttonWithText("Begin preparation"));
    await userEvent.click(await buttonWithText("Confirm preparation"));
    await vi.waitFor(() =>
      expect(
        document.querySelector('button[aria-label="Shield Slam"]')
      ).toBeEnabled()
    );
    await userEvent.keyboard("1");
    expect(worker.abilityCommands).toEqual(["ability.iron_warden.shield_slam"]);

    const doubleSpeed = document.querySelector(
      'button[aria-label="2× combat speed"]'
    );
    expect(doubleSpeed).toBeInstanceOf(HTMLButtonElement);
    expect(doubleSpeed).toHaveAttribute("aria-keyshortcuts", "+");
    await userEvent.click(doubleSpeed as HTMLButtonElement);
    await vi.waitFor(() => expect(doubleSpeed).toBeDisabled());

    const normalSpeed = document.querySelector(
      'button[aria-label="1× combat speed"]'
    );
    expect(normalSpeed).toBeInstanceOf(HTMLButtonElement);
    expect(normalSpeed).toHaveAttribute("aria-keyshortcuts", "-");
    await userEvent.keyboard("-");
    await vi.waitFor(() => expect(normalSpeed).toBeDisabled());
    await userEvent.keyboard("+");
    expect(worker.speedCommands).toEqual([2, 1, 2]);
    expect(
      document.querySelector(".combat-keyboard-hints")?.textContent
    ).toContain("Esc pause · 1 Shield Slam · −/+ speed · portrait targeting");
  });

  it("binds speed controls to one pending authoritative acknowledgement", async () => {
    const worker = new ControlledTargetPolicyWorker();
    worker.acknowledgeSpeedCommands = false;
    const container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    root.render(<App createWorker={() => worker as unknown as Worker} />);

    await userEvent.click(await buttonWithText("Begin preparation"));
    await userEvent.click(await buttonWithText("Confirm preparation"));
    await vi.waitFor(() =>
      expect(
        document.querySelector('button[aria-label="2× combat speed"]')
      ).toBeEnabled()
    );
    const doubleSpeed = document.querySelector(
      'button[aria-label="2× combat speed"]'
    ) as HTMLButtonElement;
    doubleSpeed.click();
    doubleSpeed.click();
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "+" }));
    await vi.waitFor(() => expect(doubleSpeed).toBeDisabled());

    expect(worker.speedCommands).toEqual([2]);
    expect(doubleSpeed).toBeDisabled();
    expect(
      document.querySelector('button[aria-label="1× combat speed"]')
    ).toBeDisabled();

    worker.emitSpeed(2);
    await vi.waitFor(() =>
      expect(
        document.querySelector('button[aria-label="1× combat speed"]')
      ).toBeEnabled()
    );
    await userEvent.keyboard("-");
    expect(worker.speedCommands).toEqual([2, 1]);
  });

  it("unlocks only the control bound to a rejected command and permits retry", async () => {
    const worker = new ControlledTargetPolicyWorker();
    const container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    root.render(<App createWorker={() => worker as unknown as Worker} />);

    await userEvent.click(await buttonWithText("Begin preparation"));
    await userEvent.click(await buttonWithText("Confirm preparation"));
    const targetingTrigger = await vi.waitFor(() => {
      const candidate = document.querySelector(".character-portrait-button");
      expect(candidate).toBeInstanceOf(HTMLButtonElement);
      return candidate as HTMLButtonElement;
    });
    const shieldSlam = await vi.waitFor(() => {
      const candidate = document.querySelector(
        'button[aria-label="Shield Slam"]'
      );
      expect(candidate).toBeInstanceOf(HTMLButtonElement);
      return candidate as HTMLButtonElement;
    });

    await userEvent.click(targetingTrigger);
    await userEvent.click(await buttonWithText("Highest armor"));
    await userEvent.click(shieldSlam);
    expect(targetingTrigger.disabled).toBe(true);
    expect(shieldSlam.disabled).toBe(true);

    worker.emit({
      protocolVersion: 4,
      type: "failure",
      code: "command_rejected",
      message: "Rejected.",
      requestId: "unrelated-command"
    });
    await vi.waitFor(() => expect(targetingTrigger.disabled).toBe(true));
    expect(shieldSlam.disabled).toBe(true);

    const targetRequestId = worker.lastTargetPolicyRequestId;
    if (targetRequestId === undefined)
      throw new Error("expected target-policy request ID");
    worker.emit({
      protocolVersion: 4,
      type: "failure",
      code: "command_rejected",
      message: "Rejected.",
      requestId: targetRequestId
    });
    await vi.waitFor(() => expect(targetingTrigger.disabled).toBe(false));
    expect(shieldSlam.disabled).toBe(true);
    expect(document.querySelector(".target-policy-label")?.textContent).toBe(
      "Change rejected — try again"
    );

    const abilityRequestId = worker.lastAbilityRequestId;
    if (abilityRequestId === undefined)
      throw new Error("expected ability request ID");
    worker.emit({
      protocolVersion: 4,
      type: "failure",
      code: "command_rejected",
      message: "Rejected.",
      requestId: abilityRequestId
    });
    await vi.waitFor(() => expect(shieldSlam.disabled).toBe(false));
    expect(document.querySelector(".ability-state")?.textContent).toBe(
      "Activation rejected — try again"
    );

    await userEvent.click(targetingTrigger);
    const currentPolicy = document.querySelector(
      '.target-policy-menu button[aria-pressed="true"]'
    );
    expect(currentPolicy).toBeInstanceOf(HTMLButtonElement);
    expect(currentPolicy?.textContent).toBe("Nearest ✓");
    await userEvent.click(currentPolicy as HTMLButtonElement);
    await userEvent.click(shieldSlam);
    expect(worker.targetPolicyCommands).toEqual(["highest_armor", "nearest"]);
    expect(worker.abilityCommands).toEqual([
      "ability.iron_warden.shield_slam",
      "ability.iron_warden.shield_slam"
    ]);
    expect(document.querySelector(".target-policy-label")?.textContent).toBe(
      "Nearest"
    );
    expect(document.querySelector(".ability-state")?.textContent).toBe(
      "Activation queued"
    );
  });

  it("submits Shield Slam accessibly and presents authoritative cooldown feedback", async () => {
    const onActivateAbility = vi.fn();
    const container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    root.render(
      <CombatControls
        dwarves={[
          {
            entityId: "entity.dwarf.warden",
            characterId: "character.iron_warden",
            supportedTargetPolicies: ["nearest"],
            activeAbilities: [
              {
                abilityId: "ability.iron_warden.shield_slam",
                cooldownCompleteAtTick: null,
                rejectionReason: null
              }
            ]
          }
        ]}
        onSetTargetPolicy={vi.fn()}
        onActivateAbility={onActivateAbility}
      />
    );
    const shieldSlam = await vi.waitFor(() => {
      const button = Array.from(document.querySelectorAll("button")).find(
        (candidate) => candidate.getAttribute("aria-label") === "Shield Slam"
      );
      expect(button).toBeInstanceOf(HTMLButtonElement);
      return button as HTMLButtonElement;
    });
    expect(shieldSlam.getAttribute("aria-describedby")).not.toBeNull();
    expect(document.querySelector('[role="status"]')?.textContent).toBe(
      "Ready"
    );
    shieldSlam.focus();
    await userEvent.keyboard("{Enter}");
    expect(onActivateAbility).toHaveBeenCalledWith(
      "entity.dwarf.warden",
      "ability.iron_warden.shield_slam"
    );
  });

  it("prevents repeated ability input while authoritative feedback is pending", async () => {
    const onActivateAbility = vi.fn();
    const container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    root.render(
      <CombatControls
        dwarves={[
          {
            entityId: "entity.dwarf.warden",
            characterId: "character.iron_warden",
            supportedTargetPolicies: ["nearest"],
            activeAbilities: [
              {
                abilityId: "ability.iron_warden.shield_slam",
                cooldownCompleteAtTick: null,
                rejectionReason: null
              }
            ]
          }
        ]}
        pendingAbilityKeys={
          new Set(["entity.dwarf.warden\u0000ability.iron_warden.shield_slam"])
        }
        onSetTargetPolicy={vi.fn()}
        onActivateAbility={onActivateAbility}
      />
    );

    const shieldSlam = await vi.waitFor(() => {
      const button = Array.from(document.querySelectorAll("button")).find(
        (candidate) => candidate.getAttribute("aria-label") === "Shield Slam"
      );
      expect(button).toBeInstanceOf(HTMLButtonElement);
      return button as HTMLButtonElement;
    });
    expect(shieldSlam.disabled).toBe(true);
    expect(document.querySelector('[role="status"]')?.textContent).toBe(
      "Activation queued"
    );
    expect(onActivateAbility).not.toHaveBeenCalled();
  });

  it("renders cooldown and rejection states with text and non-color state markers", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    root.render(
      <CombatControls
        currentTick={15}
        selectedDwarfHealth={{ current: 20, maximum: 100 }}
        dwarves={[
          {
            entityId: "entity.dwarf.warden",
            characterId: "character.iron_warden",
            supportedTargetPolicies: ["nearest"],
            activeAbilities: [
              {
                abilityId: "ability.iron_warden.shield_slam",
                cooldownCompleteAtTick: 25,
                rejectionReason: null
              }
            ]
          }
        ]}
        onSetTargetPolicy={vi.fn()}
      />
    );
    await vi.waitFor(() =>
      expect(document.querySelector(".ability-state")?.textContent).toBe(
        "Recharging · 10 ticks"
      )
    );
    expect(document.querySelector(".ability-control")).toHaveAttribute(
      "data-ability-state",
      "cooldown"
    );
    const health = document.querySelector('[aria-label="Iron Warden health"]');
    expect(health).toBeInstanceOf(HTMLMeterElement);
    expect((health as HTMLMeterElement).value).toBe(20);
    expect(health).toHaveAttribute("data-low-health", "true");
    root.render(
      <CombatControls
        currentTick={15}
        dwarves={[
          {
            entityId: "entity.dwarf.warden",
            characterId: "character.iron_warden",
            supportedTargetPolicies: ["nearest"],
            activeAbilities: [
              {
                abilityId: "ability.iron_warden.shield_slam",
                cooldownCompleteAtTick: null,
                rejectionReason: "no_valid_target"
              }
            ]
          }
        ]}
        onSetTargetPolicy={vi.fn()}
      />
    );
    await vi.waitFor(() =>
      expect(document.querySelector(".ability-state")?.textContent).toBe(
        "No valid target"
      )
    );
    expect(document.querySelector(".ability-control")).toHaveAttribute(
      "data-ability-state",
      "unavailable"
    );
  });

  it.each([
    ["owner_downed", "Iron Warden is down"],
    ["cooldown_active", "Recharging"],
    ["committed_action_conflict", "Finish current action first"],
    ["phase_unavailable", "Available during combat"],
    ["target_or_facing_unavailable", "No valid target"],
    ["unexpected_reason", "Ability unavailable"]
  ])(
    "presents the %s rejection without exposing its stable ID",
    async (reason, label) => {
      const container = document.createElement("div");
      document.body.append(container);
      root = createRoot(container);
      root.render(
        <CombatControls
          dwarves={[
            {
              entityId: "entity.dwarf.warden",
              characterId: "character.iron_warden",
              supportedTargetPolicies: ["nearest"],
              activeAbilities: [
                {
                  abilityId: "ability.iron_warden.shield_slam",
                  cooldownCompleteAtTick: null,
                  rejectionReason: reason
                }
              ]
            }
          ]}
          onSetTargetPolicy={vi.fn()}
        />
      );

      await vi.waitFor(() =>
        expect(document.querySelector(".ability-state")?.textContent).toBe(
          label
        )
      );
      expect(document.body.textContent).not.toContain(reason);
    }
  );
});

describe("authoritative web worker", () => {
  it.skip("matches the retired empty protocol-v4 result flow", async () => {
    const worker = new Worker(
      new URL("./simulation.worker.ts", import.meta.url),
      { type: "module" }
    );
    try {
      const preparation = waitForMessage(
        worker,
        (message) =>
          message.type === "snapshot" && message.phase === "preparation"
      );
      const renderPreparation = waitForMessage(
        worker,
        (message) =>
          message.type === "render_snapshot" &&
          message.snapshot.phase === "preparation"
      );
      const combatControls = waitForMessage(
        worker,
        (message) => message.type === "combat_controls"
      );
      worker.postMessage({
        protocolVersion: WEB_PROTOCOL_VERSION,
        type: "initialize"
      });
      const [preparationMessage, , combatControlsMessage] = await Promise.all([
        preparation,
        renderPreparation,
        combatControls
      ]);
      expect(preparationMessage).toMatchObject({
        levelId: "level.empty",
        deployableEntityCount: 0,
        placementPointCount: 0
      });
      expect(combatControlsMessage).toMatchObject({
        protocolVersion: WEB_PROTOCOL_VERSION,
        contentManifestHash: EMPTY_CONTENT_MANIFEST_HASH,
        dwarves: []
      });

      const resultPromise = waitForMessage(
        worker,
        (message) => message.type === "result"
      );
      const rejectionPromise = waitForMessage(
        worker,
        (message) =>
          message.type === "failure" && message.code === "command_rejected"
      );
      const command = {
        protocolVersion: WEB_PROTOCOL_VERSION,
        type: "command",
        requestId: "command-1",
        command: { type: "confirmPreparation" }
      } as const;
      worker.postMessage(command);
      worker.postMessage({ ...command, requestId: "command-2" });
      const paused = await waitForMessage(
        worker,
        (message) =>
          message.type === "snapshot" &&
          message.phase === "running" &&
          message.protocolVersion !== 1 &&
          message.manualPaused
      );
      expect(paused).toMatchObject({ manualPaused: true });
      const mixedVersionRejection = waitForMessage(
        worker,
        (message) =>
          message.type === "failure" && message.code === "invalid_message"
      );
      worker.postMessage({
        protocolVersion: 1,
        type: "command",
        requestId: "mixed-version-confirmation",
        command: { type: "confirmPreparation" }
      });
      await mixedVersionRejection;
      const duplicatePauseRejection = waitForMessage(
        worker,
        (message) =>
          message.type === "failure" && message.code === "command_rejected"
      );
      worker.postMessage({
        protocolVersion: WEB_PROTOCOL_VERSION,
        type: "command",
        requestId: "duplicate-pause",
        command: { type: "setManualPause", paused: true }
      });
      await duplicatePauseRejection;
      const unpaused = waitForMessage(
        worker,
        (message) =>
          message.type === "snapshot" &&
          message.phase === "running" &&
          message.protocolVersion !== 1 &&
          !message.manualPaused
      );
      worker.postMessage({
        protocolVersion: WEB_PROTOCOL_VERSION,
        type: "command",
        requestId: "stale-resume",
        command: { type: "setManualPause", paused: false }
      });
      await unpaused;
      const repaused = waitForMessage(
        worker,
        (message) =>
          message.type === "snapshot" &&
          message.phase === "running" &&
          message.protocolVersion !== 1 &&
          message.manualPaused
      );
      worker.postMessage({
        protocolVersion: WEB_PROTOCOL_VERSION,
        type: "command",
        requestId: "focus-pause",
        command: { type: "setManualPause", paused: true }
      });
      await repaused;
      const staleResumeRejection = waitForMessage(
        worker,
        (message) =>
          message.type === "failure" && message.code === "command_rejected"
      );
      worker.postMessage({
        protocolVersion: WEB_PROTOCOL_VERSION,
        type: "command",
        requestId: "stale-resume",
        command: { type: "setManualPause", paused: false }
      });
      await staleResumeRejection;
      const interruptedResume = waitForMessage(
        worker,
        (message) =>
          message.type === "snapshot" &&
          message.phase === "running" &&
          message.protocolVersion !== 1 &&
          !message.manualPaused
      );
      worker.postMessage({
        protocolVersion: WEB_PROTOCOL_VERSION,
        type: "command",
        requestId: "interrupted-resume",
        command: { type: "setManualPause", paused: false }
      });
      await interruptedResume;
      const interruptedResult = waitForMessage(
        worker,
        (message) => message.type === "result"
      ).then(() => true);
      const commitFocusPause = waitForMessage(
        worker,
        (message) =>
          message.type === "snapshot" &&
          message.phase === "running" &&
          message.protocolVersion !== 1 &&
          message.manualPaused
      );
      worker.postMessage({
        protocolVersion: WEB_PROTOCOL_VERSION,
        type: "command",
        requestId: "interrupted-commit",
        command: {
          type: "commitManualResume",
          resumeRequestId: "interrupted-resume"
        }
      });
      worker.postMessage({
        protocolVersion: WEB_PROTOCOL_VERSION,
        type: "command",
        requestId: "commit-focus-pause",
        command: { type: "setManualPause", paused: true }
      });
      await commitFocusPause;
      expect(
        await Promise.race([
          interruptedResult,
          new Promise<false>((resolve) => setTimeout(() => resolve(false), 50))
        ])
      ).toBe(false);
      worker.postMessage({
        protocolVersion: WEB_PROTOCOL_VERSION,
        type: "command",
        requestId: "resume",
        command: { type: "setManualPause", paused: false }
      });
      const terminalRender = waitForMessage(
        worker,
        (message) =>
          message.type === "render_snapshot" &&
          message.snapshot.phase === "terminal"
      );
      const postTerminalRejection = waitForMessage(
        worker,
        (message) =>
          message.type === "failure" && message.code === "command_rejected"
      );
      worker.postMessage({
        protocolVersion: WEB_PROTOCOL_VERSION,
        type: "command",
        requestId: "commit-resume",
        command: { type: "commitManualResume", resumeRequestId: "resume" }
      });
      await terminalRender;
      worker.postMessage({
        protocolVersion: WEB_PROTOCOL_VERSION,
        type: "command",
        requestId: "post-terminal-pause",
        command: { type: "setManualPause", paused: true }
      });
      await postTerminalRejection;
      const [result] = await Promise.all([resultPromise, rejectionPromise]);
      expect(result).toMatchObject(expected);
      if (result.type !== "result") throw new Error("expected result");
      expect(result.commands).toEqual([
        {
          tick: 0,
          sequence: 0,
          command: { atTick: 0, type: "confirmPreparation" }
        }
      ]);
    } finally {
      worker.terminate();
    }
  });

  it("publishes authoritative Shield Slam availability", async () => {
    const worker = new Worker(
      new URL("./simulation.worker.ts", import.meta.url),
      { type: "module" }
    );
    try {
      const controls = waitForMessage(
        worker,
        (message) =>
          message.type === "combat_controls" &&
          message.protocolVersion === 4 &&
          message.dwarves.length === 1
      );
      worker.postMessage({
        protocolVersion: 4,
        type: "initialize",
        runConfiguration: freshWorkerRunConfiguration()
      });
      await expect(controls).resolves.toMatchObject({
        dwarves: [
          {
            entityId: "entity.dwarf.warden",
            activeAbilities: [
              {
                abilityId: "ability.iron_warden.shield_slam",
                cooldownCompleteAtTick: null,
                rejectionReason: "phase_unavailable"
              }
            ]
          }
        ]
      });
      const prepared = waitForMessage(
        worker,
        (message) =>
          message.type === "snapshot" &&
          message.phase === "running" &&
          message.protocolVersion === 4 &&
          message.manualPaused
      );
      worker.postMessage({
        protocolVersion: 4,
        type: "command",
        requestId: "prepare-shield-slam",
        command: { type: "confirmPreparation" }
      });
      await prepared;
      const doubleSpeed = waitForMessage(
        worker,
        (message) =>
          message.type === "snapshot" &&
          message.phase === "running" &&
          message.protocolVersion === 4 &&
          message.simulationSpeed === 2
      );
      worker.postMessage({
        protocolVersion: 4,
        type: "command",
        requestId: "double-speed",
        command: { type: "setSimulationSpeed", speed: 2 }
      });
      await expect(doubleSpeed).resolves.toMatchObject({
        manualPaused: true,
        simulationSpeed: 2
      });
      const repeatedSpeed = waitForMessage(
        worker,
        (message) =>
          message.type === "snapshot" &&
          message.phase === "running" &&
          message.protocolVersion === 4 &&
          message.simulationSpeed === 2
      );
      worker.postMessage({
        protocolVersion: 4,
        type: "command",
        requestId: "double-speed-again",
        command: { type: "setSimulationSpeed", speed: 2 }
      });
      await expect(repeatedSpeed).resolves.toBeDefined();
      const combatTick = waitForMessage(
        worker,
        (message) =>
          message.type === "combat_controls" && message.protocolVersion === 4
      );
      worker.postMessage({
        protocolVersion: 4,
        type: "command",
        requestId: "resume-preparation",
        command: { type: "setManualPause", paused: false }
      });
      worker.postMessage({
        protocolVersion: 4,
        type: "command",
        requestId: "commit-preparation",
        command: {
          type: "commitManualResume",
          resumeRequestId: "resume-preparation"
        }
      });
      await combatTick;
      const paused = waitForMessage(
        worker,
        (message) =>
          message.type === "snapshot" &&
          message.phase === "running" &&
          message.protocolVersion === 4 &&
          message.manualPaused
      );
      worker.postMessage({
        protocolVersion: 4,
        type: "command",
        requestId: "pause-shield-slam",
        command: { type: "setManualPause", paused: true }
      });
      await paused;
      worker.postMessage({
        protocolVersion: 4,
        type: "command",
        requestId: "activate-shield-slam",
        command: {
          type: "activateAbility",
          dwarfEntityId: "entity.dwarf.warden",
          abilityId: "ability.iron_warden.shield_slam"
        }
      });
      const cooldown = waitForMessage(
        worker,
        (message) =>
          message.type === "combat_controls" &&
          message.protocolVersion === 4 &&
          message.dwarves[0]?.activeAbilities?.[0]?.cooldownCompleteAtTick !==
            null
      );
      worker.postMessage({
        protocolVersion: 4,
        type: "command",
        requestId: "resume-shield-slam",
        command: { type: "setManualPause", paused: false }
      });
      worker.postMessage({
        protocolVersion: 4,
        type: "command",
        requestId: "commit-shield-slam",
        command: {
          type: "commitManualResume",
          resumeRequestId: "resume-shield-slam"
        }
      });
      await expect(cooldown).resolves.toMatchObject({
        dwarves: [
          {
            activeAbilities: [
              {
                cooldownCompleteAtTick: expect.any(Number),
                rejectionReason: null
              }
            ]
          }
        ]
      });
    } finally {
      worker.terminate();
    }
  });

  it("rejects a target-policy command absent from worker capabilities", async () => {
    const worker = new Worker(
      new URL("./simulation.worker.ts", import.meta.url),
      { type: "module" }
    );
    try {
      const preparation = waitForMessage(
        worker,
        (message) =>
          message.type === "snapshot" && message.phase === "preparation"
      );
      worker.postMessage({
        protocolVersion: WEB_PROTOCOL_VERSION,
        type: "initialize",
        runConfiguration: freshWorkerRunConfiguration()
      });
      await preparation;
      const paused = waitForMessage(
        worker,
        (message) =>
          message.type === "snapshot" &&
          message.phase === "running" &&
          message.protocolVersion === 4 &&
          message.manualPaused
      );
      worker.postMessage({
        protocolVersion: WEB_PROTOCOL_VERSION,
        type: "command",
        requestId: "prepare-policy-rejection",
        command: { type: "confirmPreparation" }
      });
      await paused;
      const rejection = waitForMessage(
        worker,
        (message) =>
          message.type === "failure" && message.code === "command_rejected"
      );
      worker.postMessage({
        protocolVersion: WEB_PROTOCOL_VERSION,
        type: "command",
        requestId: "unavailable-policy",
        command: {
          type: "setTargetPolicy",
          dwarfEntityId: "entity.dwarf.absent",
          requestedPolicy: "nearest"
        }
      });
      await expect(rejection).resolves.toMatchObject({
        message: expect.stringContaining("unavailable")
      });
    } finally {
      worker.terminate();
    }
  });

  it("projects entities deterministically by stable ID", () => {
    const snapshot = {
      schemaVersion: 1,
      levelId: "level.test",
      mapId: "map.test",
      tick: 2,
      phase: "running",
      nodes: [
        { id: "node:1", x: 10, y: 0 },
        { id: "node.1", x: 0, y: 0 }
      ],
      connections: [
        { id: "connection.a-b", fromNodeId: "node.1", toNodeId: "node:1" }
      ],
      entities: [
        { id: "unit:2", nodeId: "node:1", faction: "enemy" },
        { id: "unit.1", nodeId: "node.1", faction: "dwarf" }
      ]
    } as const satisfies RenderSnapshot;
    const reversed = {
      ...snapshot,
      nodes: [...snapshot.nodes].reverse(),
      connections: [...snapshot.connections].reverse(),
      entities: [...snapshot.entities].reverse()
    };
    expect(buildBattlefieldPrimitives(snapshot)).toEqual(
      buildBattlefieldPrimitives(reversed)
    );
    expect(
      buildBattlefieldPrimitives(snapshot).entities.map((entity) => entity.id)
    ).toEqual(["unit.1", "unit:2"]);
    const occupiedSnapshot = {
      ...snapshot,
      entities: [
        { id: "unit.1", nodeId: "node.1", faction: "dwarf" },
        { id: "unit:2", nodeId: "node.1", faction: "enemy" }
      ]
    } as const satisfies RenderSnapshot;
    const occupied = buildBattlefieldPrimitives(occupiedSnapshot).entities;
    expect(occupied[0]?.x).not.toBe(occupied[1]?.x);
    expect(occupied.map((entity) => entity.faction)).toEqual([
      "dwarf",
      "enemy"
    ]);
    const survivorSnapshot = {
      ...occupiedSnapshot,
      tick: occupiedSnapshot.tick + 1,
      entities: [occupiedSnapshot.entities[0]]
    } as const satisfies RenderSnapshot;
    const departureFeedback = deriveCombatFeedback(
      occupiedSnapshot,
      survivorSnapshot
    );
    expect(departureFeedback).toBeDefined();
    if (departureFeedback === undefined)
      throw new Error("expected departure feedback");
    expect(
      buildDepartureFeedbackPrimitives(occupiedSnapshot, departureFeedback)[0]
    ).toEqual(occupied[1]);
    expect(occupied[1]?.x).not.toBe(
      buildBattlefieldPrimitives(survivorSnapshot).entities[0]?.x
    );
  });

  it("projects Shuttergate occupancy through stable anchor-local world slots", () => {
    const snapshot = {
      schemaVersion: 1,
      levelId: "level.shuttergate",
      mapId: "map.shuttergate_hall",
      tick: 2,
      phase: "running",
      nodes: [{ id: "node.shuttergate_gate", x: 0, y: 0 }],
      connections: [],
      entities: [
        {
          id: "unit.4",
          nodeId: "node.shuttergate_gate",
          faction: "enemy"
        },
        {
          id: "unit.2",
          nodeId: "node.shuttergate_gate",
          faction: "enemy"
        },
        {
          id: "unit.1",
          nodeId: "node.shuttergate_gate",
          faction: "dwarf"
        },
        {
          id: "unit.3",
          nodeId: "node.shuttergate_gate",
          faction: "dwarf"
        }
      ]
    } as const satisfies RenderSnapshot;
    const expected = [
      {
        id: "unit.1",
        faction: "dwarf",
        x: 625,
        y: 304,
        cameraDepth: 64.22694384082301
      },
      {
        id: "unit.2",
        faction: "enemy",
        x: 663,
        y: 304,
        cameraDepth: 64.22694377817474
      },
      {
        id: "unit.3",
        faction: "dwarf",
        x: 701,
        y: 304,
        cameraDepth: 64.22694371552649
      },
      {
        id: "unit.4",
        faction: "enemy",
        x: 625,
        y: 342,
        cameraDepth: 61.79816955952944
      }
    ];
    expect(buildBattlefieldPrimitives(snapshot).entities).toEqual(expected);
    expect(
      buildBattlefieldPrimitives({
        ...snapshot,
        entities: [...snapshot.entities].reverse()
      }).entities
    ).toEqual(expected);
    expect(
      buildBattlefieldPrimitives({
        ...snapshot,
        entities: [snapshot.entities[2]]
      }).entities
    ).toEqual([
      {
        id: "unit.1",
        faction: "dwarf",
        x: 663,
        y: 323,
        cameraDepth: 63.012556637527965
      }
    ]);
  });

  it("sorts shared-scene presentation by camera depth and stable ID", () => {
    const primitives = [
      { id: "entity.near.z", x: 0, y: 10, cameraDepth: 4 },
      { id: "entity.far", x: 0, y: 30, cameraDepth: 9 },
      { id: "entity.near.a", x: 0, y: 20, cameraDepth: 4 }
    ];
    expect([...primitives].sort(comparePresentationPrimitives)).toEqual([
      primitives[1],
      primitives[2],
      primitives[0]
    ]);
    expect(
      [...primitives].reverse().sort(comparePresentationPrimitives)
    ).toEqual([primitives[1], primitives[2], primitives[0]]);
  });

  it("derives snapshot-v2 interpolation and settles at the authoritative pivot", async () => {
    const snapshot = {
      schemaVersion: 2,
      scenarioId: "scenario.interpolation",
      levelId: "level.interpolation",
      mapId: "map.shuttergate_hall",
      tick: 8,
      previousTick: 7,
      phase: "running",
      nodes: [
        { id: "node.shuttergate_gate", x: 0, y: 0 },
        { id: "node.shuttergate_keep", x: 10, y: 0 }
      ],
      connections: [],
      entities: [
        {
          id: "entity.dwarf.warden",
          nodeId: "node.shuttergate_keep",
          faction: "dwarf",
          visualId: "visual.warden",
          archetype: "character",
          position: { nodeId: "node.shuttergate_keep", x: 10, y: 0 },
          previousPosition: { nodeId: "node.shuttergate_gate", x: 0, y: 0 },
          currentHealth: 10,
          maximumHealth: 10,
          facing: "east",
          action: { kind: "moving", phase: "idle", abilityId: null },
          targetEntityId: null,
          statuses: [],
          transition: "moving",
          elite: false,
          boss: false
        }
      ],
      entityTransitions: [],
      encounter: {
        startedWaveIds: [],
        activeWaveId: null,
        pendingSpawnCount: 0,
        livingHostileCount: 0,
        terminalResult: null
      }
    } as const satisfies RenderSnapshot;
    const current = buildBattlefieldPrimitives(snapshot).entities[0];
    const origin = buildInterpolationOrigins(snapshot).get(
      "entity.dwarf.warden"
    );
    expect([origin?.x, origin?.y]).not.toEqual([current?.x, current?.y]);
    expect(buildBattlefieldPrimitives(snapshot).entities[0]).toEqual(current);
    expect(
      buildInterpolationOrigins({ ...snapshot, schemaVersion: 1 })
    ).toEqual(new Map());
    const container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    const render = (reduceMotion: boolean): void =>
      root?.render(
        <Battlefield
          snapshot={snapshot}
          reduceMotion={reduceMotion}
          soundEnabled={false}
        />
      );
    render(false);
    await vi.waitFor(
      () => {
        const rendered = window.__DWARVEN_DEPTHS_RENDERER__?.entities.find(
          ({ id }) => id === "entity.dwarf.warden"
        );
        expect(rendered?.screenPosition).toEqual([current?.x, current?.y]);
      },
      { timeout: 10_000 }
    );
    render(true);
    await vi.waitFor(() =>
      expect(window.__DWARVEN_DEPTHS_RENDERER__?.activeTweens).toBe(0)
    );
  });

  it("scales interpolation cadence with the authoritative speed setting", () => {
    expect(interpolationDistanceForFrame(16, 1)).toBeCloseTo(14.4);
    expect(interpolationDistanceForFrame(16, 2)).toBeCloseTo(28.8);
    expect(interpolationDistanceForFrame(-1, 2)).toBe(0);
  });

  it("binds authored combat poses to authoritative snapshot-v2 action phases", () => {
    const entity = {
      id: "entity.dwarf.warden",
      nodeId: "node.shuttergate_gate",
      faction: "dwarf",
      visualId: "visual.warden",
      archetype: "character",
      position: { nodeId: "node.shuttergate_gate", x: 0, y: 0 },
      previousPosition: null,
      currentHealth: 10,
      maximumHealth: 10,
      facing: "east",
      action: {
        kind: "ability",
        phase: "impact",
        abilityId: "ability.iron_warden.shield_slam"
      },
      targetEntityId: null,
      statuses: [],
      transition: "active",
      elite: false,
      boss: false
    } as const;
    const snapshot = {
      schemaVersion: 2,
      scenarioId: "scenario.combat-pose",
      levelId: "level.shuttergate",
      mapId: "map.shuttergate_hall",
      tick: 4,
      previousTick: 3,
      phase: "running",
      nodes: [{ id: "node.shuttergate_gate", x: 0, y: 0 }],
      connections: [],
      entities: [entity],
      entityTransitions: [],
      encounter: {
        startedWaveIds: [],
        activeWaveId: null,
        pendingSpawnCount: 0,
        livingHostileCount: 0,
        terminalResult: null
      }
    } as const satisfies RenderSnapshot;
    expect(selectCombatPoseAsset(snapshot, entity.id)).toBe(
      "warden-shield-slam-source"
    );
    expect(
      selectCombatPoseTreatment(
        {
          ...snapshot,
          entities: [
            {
              ...entity,
              action: { kind: "moving", phase: "idle", abilityId: null },
              transition: "moving"
            }
          ]
        },
        entity.id
      )
    ).toMatchObject({ state: "moving", angle: 3 });
    expect(
      selectCombatPoseAsset(
        {
          ...snapshot,
          entities: [
            {
              ...entity,
              faction: "enemy",
              archetype: "basic",
              action: { kind: "basic_attack", phase: "windup", abilityId: null }
            }
          ]
        },
        entity.id
      )
    ).toBe("raider-attack-source");
    expect(
      selectCombatPoseTreatment(
        {
          ...snapshot,
          entities: [
            {
              ...entity,
              faction: "enemy",
              visualId: "enemy.goblin_slinger",
              archetype: "basic",
              facing: "north",
              action: {
                kind: "basic_attack",
                phase: "committed",
                abilityId: null
              }
            }
          ]
        },
        entity.id
      )
    ).toMatchObject({
      source: "slinger-attack-source",
      state: "committed",
      angle: 86,
      flipX: false
    });
    expect(
      selectCombatPoseAsset(
        {
          ...snapshot,
          entities: [
            { ...entity, action: { ...entity.action, phase: "recovery" } }
          ]
        },
        entity.id
      )
    ).toBe("warden-guard-source");
    const damaged = {
      ...snapshot,
      entities: [
        {
          ...entity,
          currentHealth: 7,
          statuses: [
            {
              id: "status.stagger.fixture",
              appliedAtTick: 4,
              expiresAtTick: 8,
              magnitude: 1
            }
          ]
        }
      ]
    } as const satisfies RenderSnapshot;
    const previous = {
      ...snapshot,
      tick: 3,
      previousTick: 2,
      entities: [{ ...entity, currentHealth: 10 }]
    } as const satisfies RenderSnapshot;
    expect(
      deriveCombatPresentationState(damaged, previous, entity.id)
    ).toMatchObject({ healthRatio: 0.7, damaged: true, status: true });
    expect(
      deriveCombatPresentationState(
        damaged,
        { ...previous, scenarioId: "scenario.stale" },
        entity.id
      )?.damaged
    ).toBe(false);
    const hostile = {
      ...entity,
      id: "entity.enemy.alpha",
      faction: "enemy",
      visualId: "enemy.goblin_cutter",
      archetype: "basic",
      currentHealth: 7,
      action: { kind: "idle", phase: "idle", abilityId: null }
    } as const;
    const elite = {
      ...hostile,
      id: "entity.enemy.beta",
      visualId: "enemy.goblin_bulwark",
      archetype: "elite",
      currentHealth: 6,
      elite: true
    } as const;
    const multiTarget = {
      ...snapshot,
      entities: [entity, hostile, elite]
    } as const satisfies RenderSnapshot;
    const multiTargetPrevious = {
      ...previous,
      entities: [
        entity,
        { ...hostile, currentHealth: 10 },
        { ...elite, currentHealth: 10 }
      ]
    } as const satisfies RenderSnapshot;
    expect(deriveShieldSlamImpactIds(multiTarget, multiTargetPrevious)).toEqual(
      ["entity.enemy.alpha", "entity.enemy.beta"]
    );
    expect(
      deriveShieldSlamImpactIds(
        {
          ...multiTarget,
          entities: [entity, hostile],
          entityTransitions: [
            {
              entityId: elite.id,
              kind: "destroyed",
              atTick: multiTarget.tick
            }
          ]
        },
        multiTargetPrevious
      )
    ).toEqual(["entity.enemy.alpha", "entity.enemy.beta"]);
    const roleFacings = [
      ["enemy.goblin_cutter", "north", "raider-north-source"],
      ["enemy.goblin_slinger", "east", "slinger-east-source"],
      ["enemy.goblin_bulwark", "south", "bulwark-source"],
      ["enemy.gatebreaker_captain", "west", "captain-west-source"]
    ] as const;
    for (const [visualId, facing, expected] of roleFacings)
      expect(
        selectCombatPoseAsset(
          {
            ...snapshot,
            entities: [
              {
                ...hostile,
                visualId,
                facing,
                action: { kind: "idle", phase: "idle", abilityId: null }
              }
            ]
          },
          hostile.id
        )
      ).toBe(expected);
    const directionalAttackTreatments = (
      ["north", "east", "south", "west"] as const
    ).map((facing) =>
      selectCombatPoseTreatment(
        {
          ...snapshot,
          entities: [
            {
              ...hostile,
              facing,
              action: {
                kind: "basic_attack",
                phase: "committed",
                abilityId: null
              }
            }
          ]
        },
        hostile.id
      )
    );
    expect(directionalAttackTreatments.map(({ source }) => source)).toEqual([
      "raider-attack-source",
      "raider-attack-source",
      "raider-attack-source",
      "raider-attack-source"
    ]);
    expect(
      new Set(
        directionalAttackTreatments.map(
          ({ angle, flipX }) => `${angle}:${String(flipX)}`
        )
      ).size
    ).toBe(4);
    const attackPhaseAngles = (["windup", "committed", "impact"] as const).map(
      (phase) =>
        selectCombatPoseTreatment(
          {
            ...snapshot,
            entities: [
              {
                ...hostile,
                facing: "east",
                action: { kind: "basic_attack", phase, abilityId: null }
              }
            ]
          },
          hostile.id
        ).angle
    );
    expect(new Set(attackPhaseAngles).size).toBe(3);
    const moving = {
      ...hostile,
      action: { kind: "moving", phase: "idle", abilityId: null },
      transition: "moving"
    } as const;
    const cadenceAt1x = deriveTemporalCombatTreatment(moving, 125, 1, false);
    const cadenceAt2x = deriveTemporalCombatTreatment(moving, 62.5, 2, false);
    expect(cadenceAt2x).toEqual(cadenceAt1x);
    expect(cadenceAt1x.verticalOffset).toBeLessThan(0);
    const reducedCadence = deriveTemporalCombatTreatment(moving, 125, 1, true);
    expect(Math.abs(reducedCadence.verticalOffset)).toBeLessThan(
      Math.abs(cadenceAt1x.verticalOffset)
    );
    const phaseTreatments = (
      ["windup", "committed", "impact", "recovery"] as const
    ).map((phase) =>
      deriveTemporalCombatTreatment(
        {
          ...hostile,
          action: { kind: "basic_attack", phase, abilityId: null }
        },
        0,
        1,
        false
      )
    );
    expect(new Set(phaseTreatments.map(({ scaleX }) => scaleX)).size).toBe(4);
    expect(
      selectCombatPoseTreatment(
        {
          ...snapshot,
          entities: [
            {
              ...hostile,
              facing: "west",
              action: {
                kind: "basic_attack",
                phase: "windup",
                abilityId: null
              }
            }
          ]
        },
        hostile.id
      )
    ).toMatchObject({
      source: "raider-attack-source",
      state: "windup",
      angle: 6,
      flipX: false
    });
    expect(
      selectCombatPoseTreatment(
        {
          ...snapshot,
          entities: [
            {
              ...hostile,
              facing: "east",
              action: {
                kind: "basic_attack",
                phase: "impact",
                abilityId: null
              }
            }
          ]
        },
        hostile.id
      )
    ).toMatchObject({
      source: "raider-attack-source",
      state: "impact",
      angle: 8,
      flipX: true
    });
    const slinger = {
      ...hostile,
      visualId: "enemy.goblin_slinger",
      action: { kind: "basic_attack", phase: "committed", abilityId: null },
      targetEntityId: entity.id
    } as const;
    const projectileSnapshot = {
      ...snapshot,
      entities: [entity, slinger]
    } as const satisfies RenderSnapshot;
    const projectilePrimitives = buildBattlefieldPrimitives(projectileSnapshot);
    expect(
      deriveSlingerProjectilePaths(
        projectileSnapshot,
        projectilePrimitives
      ).map(({ sourceId, targetId }) => [sourceId, targetId])
    ).toEqual([[slinger.id, entity.id]]);
    expect(
      deriveSlingerProjectilePaths(projectileSnapshot, projectilePrimitives)[0]
        ?.phase
    ).toBe("committed");
    expect(
      deriveSlingerProjectilePaths(
        {
          ...projectileSnapshot,
          entities: [
            {
              ...slinger,
              action: { ...slinger.action, phase: "recovery" }
            },
            entity
          ]
        },
        projectilePrimitives
      )
    ).toEqual([]);
  });

  it("aligns variable authoritative combatant counts by stable identity", () => {
    const snapshot = {
      schemaVersion: 1,
      levelId: "level.shuttergate",
      mapId: "map.shuttergate_hall",
      tick: 1801,
      phase: "running",
      nodes: [],
      connections: [],
      entities: [
        {
          id: "entity.dwarf.warden",
          nodeId: "node.shuttergate_north_guard",
          faction: "dwarf"
        },
        {
          id: "entity.enemy.shuttergate_006",
          nodeId: "node.shuttergate_east_hall",
          faction: "enemy"
        },
        {
          id: "entity.enemy.shuttergate_007",
          nodeId: "node.shuttergate_west_entry",
          faction: "enemy"
        }
      ]
    } as const satisfies RenderSnapshot;
    const registry = [...snapshot.entities].reverse();

    expect(
      buildTruthScreenAlignment(snapshot, registry, snapshot.entities)
    ).toEqual({
      snapshotCount: 3,
      registryCount: 3,
      renderedCount: 3,
      registryEntitiesMatch: true,
      renderedEntitiesMatch: true,
      authoritativeEntitiesMatch: true,
      valid: true
    });
    expect(
      buildTruthScreenAlignment(snapshot, registry.slice(1), snapshot.entities)
    ).toEqual({
      snapshotCount: 3,
      registryCount: 2,
      renderedCount: 3,
      registryEntitiesMatch: false,
      renderedEntitiesMatch: true,
      authoritativeEntitiesMatch: false,
      valid: false
    });
    expect(
      buildTruthScreenAlignment(snapshot, registry, [
        ...snapshot.entities.slice(0, 2),
        { id: "entity.enemy.substituted", faction: "enemy" }
      ])
    ).toMatchObject({
      registryEntitiesMatch: true,
      renderedEntitiesMatch: false,
      authoritativeEntitiesMatch: false,
      valid: false
    });
    expect(
      buildTruthScreenAlignment(snapshot, registry, [
        ...snapshot.entities,
        snapshot.entities[0]
      ])
    ).toMatchObject({ renderedCount: 4, valid: false });
    expect(
      buildTruthScreenAlignment(snapshot, registry, [
        { ...snapshot.entities[0], faction: "enemy" },
        ...snapshot.entities.slice(1)
      ])
    ).toMatchObject({ renderedEntitiesMatch: false, valid: false });
    expect(renderedFactionForSourceKey("warden-shield-slam-runtime")).toBe(
      "dwarf"
    );
    expect(renderedFactionForSourceKey("raider-attack-runtime")).toBe("enemy");
    expect(renderedFactionForSourceKey("subject-depth-forged")).toBeUndefined();
  });

  it("rejects malformed depth assets without exposing partial scene data", () => {
    expect(decodeBattlefieldDepthAsset(undefined)).toBeUndefined();
    expect(decodeBattlefieldDepthAsset(new ArrayBuffer(8))).toBeUndefined();
  });

  it("keeps reduced-motion feedback static and rejects stale replay effects in StrictMode", async () => {
    const initial = {
      schemaVersion: 1,
      levelId: "level.test",
      mapId: "map.shuttergate_hall",
      tick: 1,
      phase: "running",
      nodes: [{ id: "node.shuttergate_gate", x: 0, y: 0 }],
      connections: [],
      entities: [
        {
          id: "unit.1",
          nodeId: "node.shuttergate_gate",
          faction: "dwarf"
        }
      ]
    } as const satisfies RenderSnapshot;
    const changed = {
      ...initial,
      tick: 2,
      entities: [
        ...initial.entities,
        {
          id: "unit.2",
          nodeId: "node.shuttergate_gate",
          faction: "enemy"
        }
      ]
    } as const satisfies RenderSnapshot;
    const departed = {
      ...initial,
      tick: 3
    } as const satisfies RenderSnapshot;
    const container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    const render = (renderSnapshot: RenderSnapshot): void =>
      root?.render(
        <StrictMode>
          <Battlefield
            snapshot={renderSnapshot}
            reduceMotion={true}
            soundEnabled={false}
          />
        </StrictMode>
      );

    render(initial);
    await vi.waitFor(() =>
      expect(document.querySelector(".battlefield")).toBeInstanceOf(HTMLElement)
    );
    expect(document.querySelector(".combat-feedback")).toBeNull();
    render(changed);
    await vi.waitFor(
      () =>
        expect(document.querySelector(".combat-feedback")).toHaveAttribute(
          "data-motion",
          "static"
        ),
      { timeout: 10_000 }
    );
    await vi.waitFor(() =>
      expect(window.__DWARVEN_DEPTHS_RENDERER__?.updateCount).toBeGreaterThan(0)
    );
    expect(window.__DWARVEN_DEPTHS_RENDERER__?.activeTweens).toBe(0);
    expect(window.__DWARVEN_DEPTHS_RENDERER__?.entityObjects).toBe(6);
    render(departed);
    await vi.waitFor(() =>
      expect(document.querySelector(".combat-feedback")).toHaveTextContent(
        "1 combatant departed"
      )
    );
    await vi.waitFor(() =>
      expect(window.__DWARVEN_DEPTHS_RENDERER__?.activeEffects).toBe(1)
    );
    expect(window.__DWARVEN_DEPTHS_RENDERER__?.activeTweens).toBe(0);
    render(initial);
    await vi.waitFor(() =>
      expect(document.querySelector(".combat-feedback")).toBeNull()
    );
    render(changed);
    await new Promise((resolve) => window.setTimeout(resolve, 50));
    expect(document.querySelector(".combat-feedback")).toBeNull();

    root.unmount();
    root = createRoot(container);
    render(changed);
    await vi.waitFor(() =>
      expect(document.querySelector(".battlefield")).toBeInstanceOf(HTMLElement)
    );
    expect(document.querySelector(".combat-feedback")).toBeNull();
  });

  it("survives 100 persistent updates and retry teardown without retained renderer resources", async () => {
    const initial = {
      schemaVersion: 1,
      levelId: "level.shuttergate",
      mapId: "map.shuttergate_hall",
      tick: 1,
      phase: "running",
      nodes: [{ id: "node.shuttergate_gate", x: 0, y: 0 }],
      connections: [],
      entities: [
        {
          id: "entity.dwarf.warden",
          nodeId: "node.shuttergate_gate",
          faction: "dwarf"
        }
      ]
    } as const satisfies RenderSnapshot;
    const crowded = {
      ...initial,
      tick: 2,
      entities: [
        ...initial.entities,
        {
          id: "entity.enemy.raider",
          nodeId: "node.shuttergate_gate",
          faction: "enemy" as const
        }
      ]
    } as const satisfies RenderSnapshot;
    const container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    const render = (renderSnapshot: RenderSnapshot): void =>
      root?.render(
        <Battlefield
          snapshot={renderSnapshot}
          reduceMotion={false}
          soundEnabled={false}
        />
      );

    render(initial);
    await vi.waitFor(
      () => expect(window.__DWARVEN_DEPTHS_RENDERER__?.entityObjects).toBe(3),
      { timeout: 10_000 }
    );
    const canvas = document.querySelector(".battlefield-canvas canvas");
    expect(canvas).toBeInstanceOf(HTMLCanvasElement);

    for (let cycle = 0; cycle < 100; cycle += 1) {
      const before = window.__DWARVEN_DEPTHS_RENDERER__?.updateCount ?? 0;
      render({
        ...(cycle % 2 === 0 ? crowded : initial),
        tick: cycle + 2
      });
      await vi.waitFor(() =>
        expect(window.__DWARVEN_DEPTHS_RENDERER__?.updateCount).toBeGreaterThan(
          before
        )
      );
      expect(document.querySelector(".battlefield-canvas canvas")).toBe(canvas);
      expect(window.__DWARVEN_DEPTHS_RENDERER__?.entityObjects).toBe(
        cycle % 2 === 0 ? 6 : 3
      );
      expect(window.__DWARVEN_DEPTHS_RENDERER__?.staticObjects).toBe(7);
      expect(
        window.__DWARVEN_DEPTHS_RENDERER__?.pooledEffects
      ).toBeLessThanOrEqual(1);
      expect(window.__DWARVEN_DEPTHS_RENDERER__?.activeEffects).toBe(1);
      expect(window.__DWARVEN_DEPTHS_RENDERER__?.runtimeTextures).toBe(
        cycle % 2 === 0 ? 34 : 32
      );
      expect(
        window.__DWARVEN_DEPTHS_RENDERER__?.sceneObjects
      ).toBeLessThanOrEqual(14);
      expect(
        window.__DWARVEN_DEPTHS_RENDERER__?.activeTweens
      ).toBeLessThanOrEqual(1);
      expect(window.__DWARVEN_DEPTHS_RENDERER__?.timerEvents).toBe(0);
      expect(
        window.__DWARVEN_DEPTHS_RENDERER__?.loaderListeners
      ).toBeLessThanOrEqual(1);
      expect(window.__DWARVEN_DEPTHS_RENDERER__?.camera).toEqual({
        frame: [1280, 720],
        scaleMode: "fit",
        autoCenter: "both"
      });
    }

    root.unmount();
    expect(window.__DWARVEN_DEPTHS_RENDERER__).toBeUndefined();
    expect(document.querySelector(".battlefield-canvas canvas")).toBeNull();
    root = createRoot(container);
    render(initial);
    await vi.waitFor(() =>
      expect(window.__DWARVEN_DEPTHS_RENDERER__?.entityObjects).toBe(3)
    );
    expect(
      document.querySelectorAll(".battlefield-canvas canvas")
    ).toHaveLength(1);
  });

  it("preserves the protocol-v3 combat-control message sequence", async () => {
    const worker = new Worker(
      new URL("./simulation.worker.ts", import.meta.url),
      { type: "module" }
    );
    let combatControlCount = 0;
    worker.addEventListener("message", (event: MessageEvent<unknown>) => {
      const message = parseWorkerMessage(event.data);
      if (message?.type === "combat_controls") combatControlCount += 1;
    });
    try {
      const preparation = waitForMessage(
        worker,
        (message) =>
          message.protocolVersion === 3 &&
          message.type === "snapshot" &&
          message.phase === "preparation"
      );
      worker.postMessage({ protocolVersion: 3, type: "initialize" });
      await preparation;
      const paused = waitForMessage(
        worker,
        (message) =>
          message.protocolVersion === 3 &&
          message.type === "snapshot" &&
          message.phase === "running" &&
          message.manualPaused
      );
      worker.postMessage({
        protocolVersion: 3,
        type: "command",
        requestId: "v3-confirm",
        command: { type: "confirmPreparation" }
      });
      await paused;
      const result = waitForMessage(
        worker,
        (message) => message.type === "result"
      );
      worker.postMessage({
        protocolVersion: 3,
        type: "command",
        requestId: "v3-resume",
        command: { type: "setManualPause", paused: false }
      });
      worker.postMessage({
        protocolVersion: 3,
        type: "command",
        requestId: "v3-commit",
        command: { type: "commitManualResume", resumeRequestId: "v3-resume" }
      });
      await result;
      expect(combatControlCount).toBe(1);
    } finally {
      worker.terminate();
    }
  });

  {
    const runShuttergateEncounter = async () => {
      const worker = new Worker(
        new URL("./simulation.worker.ts", import.meta.url),
        { type: "module" }
      );
      const previousNodes = new Map<string, string>();
      const previousHealth = new Map<string, number>();
      const startedWaveIds = new Set<string>();
      let movementObserved = false;
      let basicAttackObserved = false;
      let abilityObserved = false;
      let damageObserved = false;
      let deathObserved = false;
      let eliteObserved = false;
      let maximumLivingHostiles = 0;
      let abilityRequestSequence = 0;
      let terminalSnapshot: RenderSnapshot | undefined;
      worker.addEventListener("message", (event: MessageEvent<unknown>) => {
        const message = parseWorkerMessage(event.data);
        if (
          message?.type !== "render_snapshot" ||
          message.snapshot.schemaVersion !== 2
        )
          return;
        const snapshot = message.snapshot;
        for (const waveId of snapshot.encounter.startedWaveIds)
          startedWaveIds.add(waveId);
        maximumLivingHostiles = Math.max(
          maximumLivingHostiles,
          snapshot.encounter.livingHostileCount
        );
        eliteObserved ||= snapshot.entities.some((entity) => entity.elite);
        deathObserved ||= snapshot.entityTransitions.some(
          (transition) => transition.kind === "destroyed"
        );
        for (const entity of snapshot.entities) {
          const previousNode = previousNodes.get(entity.id);
          movementObserved ||=
            entity.faction === "enemy" &&
            previousNode !== undefined &&
            previousNode !== entity.nodeId;
          previousNodes.set(entity.id, entity.nodeId);
          const health = previousHealth.get(entity.id);
          damageObserved ||=
            health !== undefined && entity.currentHealth < health;
          previousHealth.set(entity.id, entity.currentHealth);
          basicAttackObserved ||= entity.action.kind === "basic_attack";
          abilityObserved ||= entity.action.kind === "ability";
        }
        if (
          !abilityObserved &&
          snapshot.phase === "running" &&
          snapshot.tick % 5 === 0 &&
          snapshot.entities.some(
            (entity) =>
              entity.faction === "dwarf" && entity.targetEntityId !== null
          )
        )
          worker.postMessage({
            protocolVersion: 4,
            type: "command",
            requestId: `encounter-ability-${abilityRequestSequence++}`,
            command: {
              type: "activateAbility",
              dwarfEntityId: "entity.dwarf.warden",
              abilityId: "ability.iron_warden.shield_slam"
            }
          });
        if (snapshot.phase === "terminal") terminalSnapshot = snapshot;
      });
      try {
        const preparation = waitForMessage(
          worker,
          (message) =>
            message.protocolVersion === 4 &&
            message.type === "snapshot" &&
            message.phase === "preparation"
        );
        worker.postMessage({
          protocolVersion: 4,
          type: "initialize",
          runConfiguration: freshWorkerRunConfiguration()
        });
        await preparation;
        const paused = waitForMessage(
          worker,
          (message) =>
            message.protocolVersion === 4 &&
            message.type === "snapshot" &&
            message.phase === "running" &&
            message.manualPaused
        );
        worker.postMessage({
          protocolVersion: 4,
          type: "command",
          requestId: "encounter-confirm",
          command: { type: "confirmPreparation" }
        });
        await paused;
        const result = waitForMessage(
          worker,
          (message) =>
            message.protocolVersion === 4 && message.type === "result",
          60_000
        );
        worker.postMessage({
          protocolVersion: 4,
          type: "command",
          requestId: "encounter-resume",
          command: { type: "setManualPause", paused: false }
        });
        worker.postMessage({
          protocolVersion: 4,
          type: "command",
          requestId: "encounter-resume-commit",
          command: {
            type: "commitManualResume",
            resumeRequestId: "encounter-resume"
          }
        });
        await expect(result).resolves.toMatchObject({
          terminalResult: "defeat"
        });
        expect(movementObserved).toBe(true);
        expect(basicAttackObserved).toBe(true);
        expect(abilityObserved).toBe(true);
        expect(damageObserved).toBe(true);
        expect(deathObserved).toBe(true);
        expect(eliteObserved).toBe(true);
        expect(maximumLivingHostiles).toBeGreaterThan(1);
        expect([...startedWaveIds]).toEqual([
          "wave.shuttergate_1",
          "wave.shuttergate_2",
          "wave.shuttergate_3"
        ]);
        expect(terminalSnapshot).toMatchObject({
          phase: "terminal",
          encounter: { terminalResult: "defeat" }
        });
      } finally {
        worker.terminate();
      }
    };
    it(
      "runs one authoritative Shuttergate encounter through movement, combat, waves, and defeat",
      runShuttergateEncounter,
      70_000
    );
  }

  it("preserves the protocol-v1 preparation and result flow", async () => {
    const worker = new Worker(
      new URL("./simulation.worker.ts", import.meta.url),
      { type: "module" }
    );
    try {
      const preparation = waitForMessage(
        worker,
        (message) =>
          message.protocolVersion === 1 &&
          message.type === "snapshot" &&
          message.phase === "preparation"
      );
      worker.postMessage({ protocolVersion: 1, type: "initialize" });
      await preparation;
      const result = waitForMessage(
        worker,
        (message) => message.protocolVersion === 1 && message.type === "result"
      );
      worker.postMessage({
        protocolVersion: 1,
        type: "command",
        requestId: "legacy-confirmation",
        command: { type: "confirmPreparation" }
      });
      expect(await result).toMatchObject(expected);
    } finally {
      worker.terminate();
    }
  });

  it("keeps terminal evidence independent of presentation frames", async () => {
    const [idle, animated] = await Promise.all([
      runWithPresentationFrames(false),
      runWithPresentationFrames(true)
    ]);
    expect(idle).toMatchObject(expected);
    expect(animated).toMatchObject(expected);
    expect(animated.finalStateChecksum).toBe(idle.finalStateChecksum);
    expect(animated.eventStreamChecksum).toBe(idle.eventStreamChecksum);
  });

  it("returns from terminal evidence to a fresh deterministic checkpoint", async () => {
    const workers: ControlledResultWorker[] = [];
    const profileStore = new PersistentJourneyProfileStore();
    const outcomes = ["victory", "defeat"] as const;
    const createWorker = (): Worker => {
      const attemptNumber = workers.length + 1;
      const worker = new ControlledResultWorker(
        outcomes[workers.length],
        `attempt.shuttergate.web_${String(attemptNumber).padStart(6, "0")}`
      );
      workers.push(worker);
      return worker as unknown as Worker;
    };
    const container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    root.render(
      <App
        createWorker={createWorker}
        createProfileStore={() => profileStore}
      />
    );

    const firstEvidence = await completeAppAttempt();
    const victoryHeading = await resultHeading("Victory results");
    expect(document.activeElement).toBe(victoryHeading);
    const returnButton = Array.from(document.querySelectorAll("button")).find(
      (button) => button.textContent === "Return to checkpoint"
    );
    if (!(returnButton instanceof HTMLButtonElement))
      throw new Error("expected result checkpoint button");
    returnButton.focus();
    await userEvent.keyboard("{Enter}");

    await vi.waitFor(() =>
      expect(document.querySelector("button")?.textContent).toBe(
        "Begin preparation"
      )
    );
    expect(document.querySelector(".evidence")).toBeNull();
    expect(document.querySelector(".results")).toBeNull();
    expect(document.querySelector("figcaption")).toBeNull();
    expect(document.body.textContent).toContain("Checkpoint ready");
    expect(workers[0]?.terminated).toBe(true);
    workers[0]?.emit({
      protocolVersion: 4,
      type: "result",
      terminalResult: "victory",
      terminalTick: 1,
      finalStateChecksum: expected.finalStateChecksum,
      eventStreamChecksum: expected.eventStreamChecksum,
      commands: [
        {
          tick: 0,
          sequence: 0,
          command: { atTick: 0, type: "confirmPreparation" }
        }
      ]
    });
    await vi.waitFor(() => {
      expect(document.body.textContent).toContain("Checkpoint ready");
      expect(document.querySelector(".results")).toBeNull();
    });

    const secondEvidence = await completeAppAttempt();
    expect(secondEvidence.replace("defeat", "victory")).toBe(firstEvidence);
    const defeatHeading = await resultHeading("Defeat results");
    expect(document.activeElement).toBe(defeatHeading);
    await userEvent.click(
      Array.from(document.querySelectorAll("button")).find(
        (button) => button.textContent === "Return to checkpoint"
      ) as HTMLButtonElement
    );
    await vi.waitFor(() =>
      expect(document.body.textContent).toContain("Checkpoint ready")
    );
    expect(workers).toHaveLength(2);
    expect(workers[1]?.terminated).toBe(true);
  });

  it("recovers from authoritative failures by keyboard and mouse", async () => {
    const workers: ControlledFailureWorker[] = [];
    const createWorker = (): Worker => {
      const worker = new ControlledFailureWorker();
      workers.push(worker);
      return worker as unknown as Worker;
    };
    const container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    root.render(<App createWorker={createWorker} />);

    await userEvent.click(await buttonWithText("Begin preparation"));
    await userEvent.click(await buttonWithText("Confirm preparation"));
    const firstFailureHeading = await vi.waitFor(() => {
      const heading = document.querySelector("#failure-heading");
      expect(heading).toBeInstanceOf(HTMLHeadingElement);
      return heading as HTMLHeadingElement;
    });
    expect(document.activeElement).toBe(firstFailureHeading);
    expect(document.body.textContent).toContain(
      "The expedition could not continue. Return to the checkpoint and try again."
    );
    expect(document.body.textContent).not.toContain("level.shuttergate_hall");
    expect(document.body.textContent).not.toContain("character.iron_warden");
    const keyboardReturn = await buttonWithText("Return to checkpoint");
    keyboardReturn.focus();
    await userEvent.keyboard("{Enter}");
    await vi.waitFor(() =>
      expect(document.body.textContent).toContain("Checkpoint ready")
    );
    expect(workers[0]?.terminated).toBe(true);
    expect(document.querySelector("#failure-heading")).toBeNull();
    expect(document.querySelector("figcaption")).toBeNull();

    workers[0]?.emit({
      protocolVersion: 4,
      type: "failure",
      code: "runtime_failure",
      message: "stale worker failure"
    });
    expect(document.body.textContent).not.toContain("stale worker failure");

    await userEvent.click(await buttonWithText("Begin preparation"));
    await userEvent.click(await buttonWithText("Confirm preparation"));
    await buttonWithText("Return to checkpoint");
    await userEvent.click(await buttonWithText("Return to checkpoint"));
    await vi.waitFor(() =>
      expect(document.body.textContent).toContain("Checkpoint ready")
    );
    expect(workers).toHaveLength(2);
    expect(workers[1]?.terminated).toBe(true);
  });

  it("recovers from startup and transport failures without implementation language", async () => {
    const workers: ControlledFailureWorker[] = [];
    let creationAttempts = 0;
    const createWorker = (): Worker => {
      creationAttempts += 1;
      if (creationAttempts === 1)
        throw new DOMException("worker construction blocked", "SecurityError");
      const worker = new ControlledFailureWorker();
      workers.push(worker);
      return worker as unknown as Worker;
    };
    const container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    root.render(<App createWorker={createWorker} />);

    const expectPlayerFacingFailure = async (): Promise<void> => {
      await vi.waitFor(() =>
        expect(document.body.textContent).toContain(
          "The expedition could not continue. Return to the checkpoint and try again."
        )
      );
      const playerText = document.body.textContent?.toLowerCase();
      expect(playerText).not.toContain("worker");
      expect(playerText).not.toContain("invalid");
      expect(playerText).not.toContain("protocol");
    };

    await userEvent.click(await buttonWithText("Begin preparation"));
    await expectPlayerFacingFailure();
    await userEvent.click(await buttonWithText("Return to checkpoint"));

    await userEvent.click(await buttonWithText("Begin preparation"));
    workers[0]?.emit({ unexpected: "message" });
    await expectPlayerFacingFailure();
    workers[0]?.emit({
      protocolVersion: 4,
      type: "snapshot",
      phase: "preparation",
      levelId: "level.shuttergate_hall",
      deployableEntityCount: 0,
      placementPointCount: 2
    });
    expect(document.querySelector("#failure-heading")).toBeInstanceOf(
      HTMLHeadingElement
    );
    await userEvent.click(await buttonWithText("Return to checkpoint"));

    await userEvent.click(await buttonWithText("Begin preparation"));
    workers[1]?.emitError("simulation worker crashed");
    await expectPlayerFacingFailure();
    workers[1]?.emit({
      protocolVersion: 4,
      type: "snapshot",
      phase: "preparation",
      levelId: "level.shuttergate_hall",
      deployableEntityCount: 0,
      placementPointCount: 2
    });
    expect(document.querySelector("#failure-heading")).toBeInstanceOf(
      HTMLHeadingElement
    );
    await userEvent.click(await buttonWithText("Return to checkpoint"));
    await vi.waitFor(() =>
      expect(document.body.textContent).toContain("Checkpoint ready")
    );
    expect(creationAttempts).toBe(3);
    expect(workers.every((worker) => worker.terminated)).toBe(true);
  });

  it("retires the worker when confirmation transport throws", async () => {
    const worker = new ControlledFailureWorker();
    const container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    root.render(<App createWorker={() => worker as unknown as Worker} />);

    await userEvent.click(await buttonWithText("Begin preparation"));
    worker.throwOnConfirm = true;
    await userEvent.click(await buttonWithText("Confirm preparation"));

    await vi.waitFor(() =>
      expect(document.body.textContent).toContain(
        "The expedition could not continue. Return to the checkpoint and try again."
      )
    );
    expect(worker.terminated).toBe(true);
    expect(document.body.textContent).not.toContain("transport");

    worker.emit({
      protocolVersion: 4,
      type: "snapshot",
      phase: "running",
      levelId: "level.shuttergate_hall",
      manualPaused: false
    });
    expect(document.querySelector("#failure-heading")).toBeInstanceOf(
      HTMLHeadingElement
    );
  });

  it("downloads byte-identical versioned run evidence with keyboard input", async () => {
    window.history.replaceState(null, "", "/?inspection=1");
    const workers: ControlledResultWorker[] = [];
    const profileStore = new PersistentJourneyProfileStore();
    const createWorker = (): Worker => {
      const worker = new ControlledResultWorker(
        expected.terminalResult,
        "attempt.shuttergate.web_000001"
      );
      workers.push(worker);
      return worker as unknown as Worker;
    };
    const blobs: Blob[] = [];
    const createObjectUrl = vi
      .spyOn(URL, "createObjectURL")
      .mockImplementation((blob) => {
        expect(blob).toBeInstanceOf(Blob);
        if (
          !(blob instanceof Blob) ||
          !blob.type.startsWith("application/json")
        )
          return "blob:renderer-asset";
        blobs.push(blob as Blob);
        return `blob:run-evidence-${blobs.length}`;
      });
    const revokeObjectUrl = vi
      .spyOn(URL, "revokeObjectURL")
      .mockImplementation(() => undefined);
    const downloads: { readonly download: string; readonly href: string }[] =
      [];
    const anchorClick = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(function (this: HTMLAnchorElement) {
        downloads.push({ download: this.download, href: this.href });
      });
    const container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    root.render(
      <App
        createWorker={createWorker}
        createProfileStore={() => profileStore}
      />
    );

    await completeAppAttempt();
    // Phaser's browser loader also uses object URLs for the four runtime image
    // assets. Isolate the download assertion from those renderer-local loads.
    createObjectUrl.mockClear();
    revokeObjectUrl.mockClear();
    blobs.length = 0;
    await userEvent.click(
      document.querySelector(".result-inspection summary") as HTMLElement
    );
    const downloadButton = await buttonWithText("Download run evidence");
    downloadButton.focus();
    await userEvent.keyboard("{Enter}");

    await vi.waitFor(() => expect(blobs).toHaveLength(1));
    expect(anchorClick).toHaveBeenCalledOnce();
    expect(downloads).toEqual([
      {
        download: `dwarven-depths-run-evidence-v2-${expected.finalStateChecksum}.json`,
        href: "blob:run-evidence-1"
      }
    ]);
    expect(revokeObjectUrl).toHaveBeenCalledWith("blob:run-evidence-1");
    const firstBytes = await blobs[0]?.text();
    expect(firstBytes?.endsWith("\n")).toBe(true);
    expect(JSON.parse(firstBytes ?? "")).toMatchObject({
      schemaVersion: 2,
      runConfiguration: {
        schemaVersion: 1,
        attemptId: "attempt.shuttergate.web_000001",
        seed: "1",
        placementPointId: "placement.shuttergate_north_guard",
        profile: {
          schemaVersion: 1,
          revision: 0,
          forgeOre: 0,
          claimedRewardIds: []
        }
      },
      campaign: {
        schemaVersion: 1,
        attemptId: "attempt.shuttergate.web_000001",
        rewardId: "reward.attempt.shuttergate.web_000001",
        forgeOreAwarded: 8,
        profile: {
          revision: 1,
          forgeOre: 8,
          claimedRewardIds: ["reward.attempt.shuttergate.web_000001"]
        }
      },
      replay: {
        schemaVersion: 1,
        simulationSchemaVersion: 1,
        contentVersion: expect.any(String),
        contentManifestHash: expect.stringMatching(/^[a-f0-9]{64}$/),
        scenarioId: "scenario.conformance.shuttergate_web_truth",
        scenarioHash: expect.stringMatching(/^[a-f0-9]{64}$/),
        levelId: "level.shuttergate_hall",
        seed: "1",
        rngAlgorithm: "xorshift32-v1",
        commands: [
          {
            tick: 0,
            sequence: 0,
            command: { atTick: 0, type: "confirmPreparation" }
          }
        ],
        checkpoints: [
          {
            tick: 1,
            stateChecksum: expected.finalStateChecksum,
            eventStreamChecksum: expected.eventStreamChecksum
          }
        ],
        expectedTerminalResult: expected.terminalResult,
        expectedTerminalTick: 1
      }
    });

    await userEvent.click(downloadButton);
    await vi.waitFor(() => expect(blobs).toHaveLength(2));
    expect(await blobs[1]?.text()).toBe(firstBytes);
    expect(downloads[1]).toEqual({
      download: downloads[0]?.download,
      href: "blob:run-evidence-2"
    });
    expect(revokeObjectUrl).toHaveBeenLastCalledWith("blob:run-evidence-2");
  });

  it("supports keyboard-only confirmation and announces the result", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    root.render(
      <StrictMode>
        <App
          createProfileStore={() => ({
            load: async () => {
              throw new DOMException("blocked", "SecurityError");
            },
            write: vi.fn(),
            close: async () => undefined
          })}
        />
      </StrictMode>
    );

    await vi.waitFor(() => {
      expect(document.body.textContent).toContain("Checkpoint ready");
      expect(document.querySelector(".profile-summary")?.textContent).toContain(
        "Local progression storage is unavailable"
      );
    });
    expect(document.body.textContent).not.toContain("conformance");
    expect(
      document.querySelector(".checkpoint-command")?.textContent
    ).toContain("Shuttergate HallThe road is clear. Muster the company.");
    expect(document.querySelector(".inspection-surface")).toHaveAttribute(
      "hidden"
    );
    expect(document.querySelector("figcaption")).toBeNull();
    const beginButton = document.querySelector("button");
    if (beginButton === null) throw new Error("expected checkpoint button");
    expect(beginButton.textContent).toBe("Begin preparation");
    await userEvent.click(beginButton);

    await vi.waitFor(
      () =>
        expect(document.querySelector("button")?.textContent).toBe(
          "Confirm preparation"
        ),
      { timeout: 10_000 }
    );
    const preparationSummary = document.querySelector(
      '[aria-label="Preparation summary"]'
    );
    expect(preparationSummary?.textContent).toContain(
      "DefenceShuttergate Hall"
    );
    expect(preparationSummary?.textContent).toContain(
      "CompanyIron Warden ready"
    );
    expect(preparationSummary?.textContent).toContain(
      "Guard postNorth approach · locked"
    );
    const button = document.querySelector("button");
    if (button === null) throw new Error("expected preparation button");
    button.focus();
    await userEvent.keyboard("{Enter}");
    const resumeButton = await vi.waitFor(() => {
      const candidate = Array.from(document.querySelectorAll("button")).find(
        (button) => button.getAttribute("aria-label") === "Resume combat"
      );
      expect(candidate).toBeInstanceOf(HTMLButtonElement);
      return candidate as HTMLButtonElement;
    });
    expect(resumeButton.getAttribute("aria-pressed")).toBe("true");
    const combatControls = document.querySelector(
      '[aria-labelledby="combat-controls-heading"]'
    );
    expect(combatControls?.textContent).toContain("Combat controls");
    expect(combatControls?.textContent).toContain("Shield Slam");
    expect(combatControls?.textContent).toContain("Ready");
    expect(document.querySelector("figcaption")?.textContent).toContain(
      "Shuttergate battlefield, running"
    );
    await userEvent.click(resumeButton);
    await vi.waitFor(
      () => {
        expect(resumeButton.getAttribute("aria-label")).toBe("Pause combat");
        expect(combatControls?.textContent).toContain("Ready");
      },
      { timeout: 10_000 }
    );
    await userEvent.click(resumeButton);
    await vi.waitFor(
      () =>
        expect(resumeButton.getAttribute("aria-label")).toBe("Resume combat"),
      { timeout: 10_000 }
    );
    const shieldSlam = Array.from(document.querySelectorAll("button")).find(
      (candidate) => candidate.getAttribute("aria-label") === "Shield Slam"
    );
    if (!(shieldSlam instanceof HTMLButtonElement))
      throw new Error("expected Shield Slam button");
    await userEvent.click(shieldSlam);
    await vi.waitFor(() => expect(shieldSlam.disabled).toBe(true));
    expect(combatControls?.textContent).toContain("Activation queued");
    const targeting = Array.from(document.querySelectorAll("button")).find(
      (candidate) =>
        candidate.getAttribute("aria-label") === "Open Iron Warden targeting"
    );
    if (!(targeting instanceof HTMLButtonElement))
      throw new Error("expected Iron Warden targeting trigger");
    await userEvent.click(targeting);
    const highestArmor = Array.from(document.querySelectorAll("button")).find(
      (candidate) => candidate.textContent === "Highest armor"
    );
    if (!(highestArmor instanceof HTMLButtonElement))
      throw new Error("expected Highest armor target-policy button");
    await userEvent.click(highestArmor);
    await new Promise((resolve) => window.setTimeout(resolve, 100));
    expect(shieldSlam.disabled).toBe(true);
    expect(combatControls?.textContent).toContain("Activation queued");
    await userEvent.click(resumeButton);
    await vi.waitFor(
      () => {
        const controlsText = combatControls?.textContent ?? "";
        expect(controlsText).not.toContain("Activation queued");
        // A loaded browser runner can coalesce every transient cooldown frame
        // before React commits. Both states prove the worker acknowledged the
        // queued command; focused ability tests own exact cooldown timing.
        expect(controlsText).toMatch(/Recharging|Ready/);
      },
      { timeout: 10_000 }
    );
  });

  it("rejects terminal progression for a stale attempt", async () => {
    const worker = new ControlledResultWorker(
      "defeat",
      "attempt.shuttergate.web_000002"
    );
    const container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    root.render(
      <App
        createWorker={() => worker as unknown as Worker}
        createProfileStore={() => ({
          load: async () => {
            throw new DOMException("blocked", "SecurityError");
          },
          write: vi.fn(),
          close: async () => undefined
        })}
      />
    );

    await userEvent.click(
      page.getByRole("button", { name: "Begin preparation" })
    );
    await userEvent.click(
      page.getByRole("button", { name: "Confirm preparation" })
    );
    await vi.waitFor(() =>
      expect(document.body.textContent).toContain(
        "expedition could not continue"
      )
    );
    expect(worker.terminated).toBe(true);
  });

  it("rejects a configured terminal result without campaign progression", async () => {
    const worker = new ControlledResultWorker("defeat");
    const container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    root.render(
      <App
        createWorker={() => worker as unknown as Worker}
        createProfileStore={() => ({
          load: async () => {
            throw new DOMException("blocked", "SecurityError");
          },
          write: vi.fn(),
          close: async () => undefined
        })}
      />
    );

    await userEvent.click(
      page.getByRole("button", { name: "Begin preparation" })
    );
    await userEvent.click(
      page.getByRole("button", { name: "Confirm preparation" })
    );
    await vi.waitFor(() =>
      expect(document.body.textContent).toContain(
        "expedition could not continue"
      )
    );
    expect(worker.terminated).toBe(true);
  });

  it("pauses on focus loss or background suspension and never auto-resumes", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    root.render(<App />);

    await vi.waitFor(() =>
      expect(document.querySelector("button")?.textContent).toBe(
        "Begin preparation"
      )
    );
    await userEvent.click(
      document.querySelector("button") as HTMLButtonElement
    );
    await vi.waitFor(
      () =>
        expect(document.querySelector("button")?.textContent).toBe(
          "Confirm preparation"
        ),
      { timeout: 10_000 }
    );
    await userEvent.click(
      document.querySelector("button") as HTMLButtonElement
    );
    const resumeButton = await vi.waitFor(
      () => {
        const candidate = Array.from(document.querySelectorAll("button")).find(
          (button) => button.getAttribute("aria-label") === "Resume combat"
        );
        expect(candidate).toBeInstanceOf(HTMLButtonElement);
        return candidate as HTMLButtonElement;
      },
      { timeout: 10_000 }
    );

    resumeButton.click();
    window.dispatchEvent(new Event("blur"));
    window.dispatchEvent(new Event("focus"));
    await new Promise((resolve) => window.setTimeout(resolve, 100));
    const pausedButton = Array.from(document.querySelectorAll("button")).find(
      (button) => button.getAttribute("aria-label") === "Resume combat"
    );
    expect(pausedButton).toBeInstanceOf(HTMLButtonElement);
    expect(pausedButton?.getAttribute("aria-pressed")).toBe("true");

    pausedButton?.click();
    const documentHidden = vi
      .spyOn(document, "hidden", "get")
      .mockReturnValue(true);
    document.dispatchEvent(new Event("visibilitychange"));
    documentHidden.mockReturnValue(false);
    document.dispatchEvent(new Event("visibilitychange"));
    await vi.waitFor(() =>
      expect(pausedButton?.getAttribute("aria-pressed")).toBe("true")
    );
  });
});

describe("authoritative Shuttergate campaign journey", () => {
  it("persists rewards, purchases through the checkpoint, reloads, and presents victory", async () => {
    const store = new PersistentJourneyProfileStore();
    const workers: ControlledJourneyWorker[] = [];
    const createWorker = (): Worker => {
      const worker = new ControlledJourneyWorker();
      workers.push(worker);
      return worker as unknown as Worker;
    };
    const createProfileStore = (): CheckpointProfileStore => store;
    const container = document.createElement("div");
    document.body.append(container);
    const renderApp = (): void => {
      root = createRoot(container);
      root.render(
        <StrictMode>
          <App
            createWorker={createWorker}
            createProfileStore={createProfileStore}
          />
        </StrictMode>
      );
    };
    const completeAttempt = async (
      terminalResult: "victory" | "defeat"
    ): Promise<void> => {
      await userEvent.click(await buttonWithText("Begin preparation"));
      await userEvent.click(await buttonWithText("Confirm preparation"));
      await buttonWithText("Pause combat");
      workers.at(-1)?.finish(8, terminalResult);
      await resultHeading(
        terminalResult === "victory" ? "Victory results" : "Defeat results"
      );
    };
    const returnToCheckpoint = async (): Promise<void> => {
      await userEvent.click(await buttonWithText("Return to checkpoint"));
      await vi.waitFor(() =>
        expect(document.body.textContent).toContain("Checkpoint ready")
      );
    };
    const reloadApp = async (): Promise<void> => {
      root?.unmount();
      root = undefined;
      renderApp();
      await vi.waitFor(() =>
        expect(document.body.textContent).toContain("Checkpoint ready")
      );
    };

    renderApp();
    await vi.waitFor(() =>
      expect(document.body.textContent).toContain("Checkpoint ready")
    );
    await completeAttempt("defeat");
    await returnToCheckpoint();
    await reloadApp();
    expect(document.body.textContent).toContain("Forge Ore8");

    await completeAttempt("defeat");
    await returnToCheckpoint();
    expect(document.body.textContent).toContain("Forge Ore16");
    await userEvent.click(await buttonWithText("Upgrade inventory"));
    await userEvent.click(await buttonWithText("Purchase"));
    await vi.waitFor(() => {
      expect(document.body.textContent).toContain("Available Forge Ore: 6");
      expect(document.body.textContent).toContain("Rank 1/2");
    });
    await userEvent.click(await buttonWithText("Close upgrade inventory"));
    await reloadApp();
    expect(document.body.textContent).toContain("Forge Ore6");

    await userEvent.click(await buttonWithText("Begin preparation"));
    expect(
      workers.at(-1)?.runConfiguration?.profile.purchasedUpgrades
    ).toMatchObject([{ upgradeId: "upgrade.ability.shield_slam", rank: 1 }]);
    await userEvent.click(await buttonWithText("Confirm preparation"));
    await buttonWithText("Pause combat");
    workers.at(-1)?.finish(8, "victory");
    await resultHeading("Victory results");
    expect(document.querySelector(".result-summary")).toHaveTextContent(
      "Forge Ore earned+8New balance14 Forge Ore"
    );
    expect(store.envelope?.profile).toMatchObject({
      forgeOre: 14,
      claimedRewardIds: [
        "reward.attempt.shuttergate.web_000001",
        "reward.attempt.shuttergate.web_000002",
        "reward.attempt.shuttergate.web_000003"
      ],
      purchasedUpgrades: [{ upgradeId: "upgrade.ability.shield_slam", rank: 1 }]
    });
    expect(store.writes).toBeGreaterThanOrEqual(5);
  }, 30_000);

  it("rewards fresh defeats, applies a purchased build, and reaches victory", async () => {
    let profile = createInitialProfile("character.iron_warden" as never);
    const firstRun = await runCampaignAttempt(profile, 1);
    const first = firstRun.result;
    expect(first).toMatchObject({
      terminalResult: "defeat",
      campaign: { forgeOreAwarded: 8 }
    });
    if (first.campaign === undefined) throw new Error("missing first reward");
    profile = first.campaign.profile;

    const secondRun = await runCampaignAttempt(profile, 2);
    const second = secondRun.result;
    expect(second.terminalResult).toBe("defeat");
    if (second.campaign === undefined) throw new Error("missing second reward");
    profile = purchaseUpgradeRank({
      schemaVersion: 1,
      profile: second.campaign.profile,
      catalog: purchasedUpgradeCatalog,
      upgradeId: "upgrade.ability.shield_slam" as never
    }).profile;
    expect(profile.purchasedUpgrades).toMatchObject([
      { upgradeId: "upgrade.ability.shield_slam", rank: 1 }
    ]);

    const thirdRun = await runCampaignAttempt(profile, 3);
    const third = thirdRun.result;
    expect(thirdRun.abilityActivations).toBeGreaterThan(0);
    expect({
      terminalResult: third.terminalResult,
      maximumHealth: thirdRun.maximumHealth,
      abilityActivations: thirdRun.abilityActivations,
      campaign: third.campaign
    }).toMatchObject({
      terminalResult: "victory",
      maximumHealth: 1000,
      abilityActivations: expect.any(Number),
      campaign: {
        attemptId: "attempt.shuttergate.web_000003"
      }
    });
    expect(third.terminalTick).toBeLessThan(6000);
  }, 300_000);
});
