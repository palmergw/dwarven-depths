import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { App } from "./App.js";
import {
  parseWorkerMessage,
  WEB_PROTOCOL_VERSION,
  type WorkerMessage
} from "./protocol.js";

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
      worker.postMessage({
        protocolVersion: WEB_PROTOCOL_VERSION,
        type: "initialize"
      });
      await preparation;

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

  it("supports keyboard-only confirmation and announces the result", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    root.render(<App />);

    await vi.waitFor(() =>
      expect(document.querySelector("button")?.textContent).toBe(
        "Confirm preparation"
      )
    );
    const button = document.querySelector("button");
    if (button === null) throw new Error("expected preparation button");
    button.focus();
    await userEvent.keyboard("{Enter}");
    await vi.waitFor(() =>
      expect(document.querySelector('[role="status"]')?.textContent).toContain(
        "Run complete: victory"
      )
    );
    expect(document.body.textContent).toContain(expected.finalStateChecksum);
    expect(document.querySelectorAll("button")).toHaveLength(0);
  });
});
