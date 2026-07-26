import { StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { App } from "./App.js";
import { buildBattlefieldPrimitives } from "./Battlefield.js";
import { CombatControls } from "./CombatControls.js";
import {
  EMPTY_CONTENT_MANIFEST_HASH,
  parseWorkerMessage,
  WEB_PROTOCOL_VERSION,
  type WorkerMessage
} from "./protocol.js";
import type { RenderSnapshot } from "./render-snapshot.js";

const expected = {
  terminalResult: "victory",
  finalStateChecksum:
    "3273b044b92e0941e35341de5aaef023db045af7c97983a7bd947c040e60fb33",
  eventStreamChecksum:
    "d081b5fbde5b7d474a38545e401939cbd0b63ecc6ad2558aedeaea0be4fb0d59"
} as const;

let root: Root | undefined;
afterEach(() => {
  root?.unmount();
  root = undefined;
  document.body.replaceChildren();
});

function waitForMessage(
  worker: Worker,
  predicate: (message: WorkerMessage) => boolean
): Promise<WorkerMessage> {
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(
      () => reject(new Error("worker response timed out")),
      10_000
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
      expect(document.querySelectorAll("fieldset button")).toHaveLength(2)
    );
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
        (candidate) => candidate.textContent === "Shield Slam"
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

  it("publishes authoritative Shield Slam readiness", async () => {
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
      worker.postMessage({ protocolVersion: 4, type: "initialize" });
      await expect(controls).resolves.toMatchObject({
        dwarves: [
          {
            entityId: "entity.dwarf.warden",
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
              { cooldownCompleteAtTick: 91, rejectionReason: null }
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
        type: "initialize"
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

  it("supports keyboard-only confirmation and announces the result", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    root.render(
      <StrictMode>
        <App />
      </StrictMode>
    );

    await vi.waitFor(() =>
      expect(document.body.textContent).toContain("Checkpoint ready")
    );
    expect(document.body.textContent).toContain("Current levelEmpty Level");
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
      "Authoritative levellevel.shuttergate_hall"
    );
    expect(preparationSummary?.textContent).toContain(
      "Company rosterEmpty — no dwarves require placement"
    );
    expect(preparationSummary?.textContent).toContain("Placement points2");
    const button = document.querySelector("button");
    if (button === null) throw new Error("expected preparation button");
    button.focus();
    await userEvent.keyboard("{Enter}");
    const resumeButton = await vi.waitFor(() => {
      const candidate = Array.from(document.querySelectorAll("button")).find(
        (button) => button.textContent === "Resume combat"
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
      "Battlefield level.shuttergate_hall"
    );
  });

  it("pauses on focus loss and never resumes on focus restoration", async () => {
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
          (button) => button.textContent === "Resume combat"
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
      (button) => button.textContent === "Resume combat"
    );
    expect(pausedButton).toBeInstanceOf(HTMLButtonElement);
    expect(pausedButton?.getAttribute("aria-pressed")).toBe("true");
  });
});
