import { StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { App } from "./App.js";
import { buildBattlefieldPrimitives } from "./Battlefield.js";
import {
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
      protocolVersion: WEB_PROTOCOL_VERSION,
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
    worker.postMessage({
      protocolVersion: WEB_PROTOCOL_VERSION,
      type: "command",
      requestId: presentationFrames ? "animated" : "idle",
      command: { type: "confirmPreparation" }
    });
    const message = await result;
    if (message.type !== "result") throw new Error("expected result");
    return message;
  } finally {
    if (frame !== 0) cancelAnimationFrame(frame);
    worker.terminate();
  }
}

describe("authoritative web worker", () => {
  it("matches the pinned CLI/runtime result and rejects duplicate authority", async () => {
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
      worker.postMessage({
        protocolVersion: WEB_PROTOCOL_VERSION,
        type: "initialize"
      });
      await Promise.all([preparation, renderPreparation]);

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

    await vi.waitFor(
      () =>
        expect(document.querySelector("button")?.textContent).toBe(
          "Confirm preparation"
        ),
      { timeout: 10_000 }
    );
    const button = document.querySelector("button");
    if (button === null) throw new Error("expected preparation button");
    button.focus();
    await userEvent.keyboard("{Enter}");
    await vi.waitFor(
      () =>
        expect(
          document.querySelector('[role="status"]')?.textContent
        ).toContain("Run complete: victory"),
      { timeout: 10_000 }
    );
    expect(document.body.textContent).toContain(expected.finalStateChecksum);
    expect(document.querySelector("figcaption")?.textContent).toContain(
      "Battlefield level.empty: terminal at tick 0; 0 entities"
    );
    expect(
      document.querySelectorAll(".battlefield-canvas canvas")
    ).toHaveLength(1);
    expect(document.querySelectorAll("button")).toHaveLength(0);
  });
});
