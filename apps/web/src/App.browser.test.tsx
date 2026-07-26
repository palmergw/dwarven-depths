import { StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
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
const motionPreferenceStorageKey =
  "dwarven-depths.presentation.motion-preference.v1";
const textScaleStorageKey = "dwarven-depths.presentation.text-scale.v1";
const contrastPreferenceStorageKey =
  "dwarven-depths.presentation.contrast-preference.v1";

let root: Root | undefined;
afterEach(async () => {
  root?.unmount();
  root = undefined;
  document.body.replaceChildren();
  window.localStorage.removeItem(motionPreferenceStorageKey);
  window.localStorage.removeItem(textScaleStorageKey);
  window.localStorage.removeItem(contrastPreferenceStorageKey);
  vi.restoreAllMocks();
  await page.viewport(1280, 720);
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

class ControlledResultWorker {
  readonly listeners = new Set<(event: MessageEvent<unknown>) => void>();
  terminated = false;

  constructor(
    readonly terminalResult: "victory" | "defeat" = expected.terminalResult
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
        protocolVersion: 4,
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
      this.emit({
        protocolVersion: 4,
        type: "result",
        terminalResult: this.terminalResult,
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

    const closeButton = await buttonWithText("Close settings");
    closeButton.focus();
    await userEvent.keyboard("{Enter}");
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
        (candidate) => candidate.textContent === "Shield Slam"
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
      worker.postMessage({ protocolVersion: 4, type: "initialize" });
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

  it("returns from terminal evidence to a fresh deterministic checkpoint", async () => {
    const workers: ControlledResultWorker[] = [];
    const outcomes = ["victory", "defeat"] as const;
    const createWorker = (): Worker => {
      const worker = new ControlledResultWorker(outcomes[workers.length]);
      workers.push(worker);
      return worker as unknown as Worker;
    };
    const container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    root.render(<App createWorker={createWorker} />);

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

  it("downloads byte-identical versioned run evidence with keyboard input", async () => {
    const workers: ControlledResultWorker[] = [];
    const createWorker = (): Worker => {
      const worker = new ControlledResultWorker();
      workers.push(worker);
      return worker as unknown as Worker;
    };
    const blobs: Blob[] = [];
    const createObjectUrl = vi
      .spyOn(URL, "createObjectURL")
      .mockImplementation((blob) => {
        expect(blob).toBeInstanceOf(Blob);
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
    root.render(<App createWorker={createWorker} />);

    await completeAppAttempt();
    const downloadButton = await buttonWithText("Download run evidence");
    downloadButton.focus();
    await userEvent.keyboard("{Enter}");

    expect(createObjectUrl).toHaveBeenCalledOnce();
    expect(anchorClick).toHaveBeenCalledOnce();
    expect(downloads).toEqual([
      {
        download: `dwarven-depths-run-evidence-v1-${expected.finalStateChecksum}.json`,
        href: "blob:run-evidence-1"
      }
    ]);
    expect(revokeObjectUrl).toHaveBeenCalledWith("blob:run-evidence-1");
    const firstBytes = await blobs[0]?.text();
    expect(firstBytes).toBe(
      `${JSON.stringify(
        {
          schemaVersion: 1,
          terminalResult: expected.terminalResult,
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
        },
        null,
        2
      )}\n`
    );

    await userEvent.click(await buttonWithText("Return to checkpoint"));
    await vi.waitFor(() =>
      expect(document.body.textContent).toContain("Checkpoint ready")
    );
    expect(document.body.textContent).not.toContain("Download run evidence");
    await completeAppAttempt();
    await userEvent.click(await buttonWithText("Download run evidence"));
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
    expect(combatControls?.textContent).toContain("phase_unavailable");
    expect(document.querySelector("figcaption")?.textContent).toContain(
      "Battlefield level.shuttergate_hall"
    );
    await userEvent.click(resumeButton);
    await vi.waitFor(
      () => {
        expect(resumeButton.textContent).toBe("Pause combat");
        expect(combatControls?.textContent).toContain("Ready");
      },
      { timeout: 10_000 }
    );
    await userEvent.click(resumeButton);
    await vi.waitFor(
      () => expect(resumeButton.textContent).toBe("Resume combat"),
      { timeout: 10_000 }
    );
    const shieldSlam = Array.from(document.querySelectorAll("button")).find(
      (candidate) => candidate.textContent === "Shield Slam"
    );
    if (!(shieldSlam instanceof HTMLButtonElement))
      throw new Error("expected Shield Slam button");
    shieldSlam.focus();
    await userEvent.keyboard("{Enter}");
    expect(shieldSlam.disabled).toBe(true);
    expect(combatControls?.textContent).toContain("Activation queued");
    const nearest = Array.from(document.querySelectorAll("button")).find(
      (candidate) => candidate.textContent === "Nearest"
    );
    if (!(nearest instanceof HTMLButtonElement))
      throw new Error("expected Nearest target-policy button");
    await userEvent.click(nearest);
    await userEvent.click(nearest);
    await new Promise((resolve) => window.setTimeout(resolve, 100));
    expect(shieldSlam.disabled).toBe(true);
    expect(combatControls?.textContent).toContain("Activation queued");
    await userEvent.click(resumeButton);
    await vi.waitFor(
      () =>
        expect(combatControls?.textContent).toMatch(/Cooldown until tick \d+/),
      { timeout: 10_000 }
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
