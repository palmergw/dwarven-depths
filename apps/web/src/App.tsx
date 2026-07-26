import { useEffect, useRef, useState } from "react";
import { Battlefield } from "./Battlefield.js";
import {
  parseWorkerMessage,
  WEB_PROTOCOL_VERSION,
  type WorkerMessage
} from "./protocol.js";
import type { RenderSnapshot } from "./render-snapshot.js";

type ViewState =
  | { readonly phase: "checkpoint" }
  | { readonly phase: "preparation" }
  | { readonly phase: "running" }
  | {
      readonly phase: "result";
      readonly result: Extract<WorkerMessage, { type: "result" }>;
    }
  | { readonly phase: "failure"; readonly message: string };

export function App() {
  const [view, setView] = useState<ViewState>({ phase: "checkpoint" });
  const [renderSnapshot, setRenderSnapshot] = useState<RenderSnapshot>();
  const workerRef = useRef<Worker | undefined>(undefined);
  const initializedRef = useRef(false);
  const submittedRef = useRef(false);

  useEffect(
    () => () => {
      workerRef.current?.terminate();
      workerRef.current = undefined;
    },
    []
  );

  function startPreparation(): void {
    if (initializedRef.current || view.phase !== "checkpoint") return;
    initializedRef.current = true;
    const worker = new Worker(
      new URL("./simulation.worker.ts", import.meta.url),
      { type: "module" }
    );
    workerRef.current = worker;
    worker.addEventListener("message", (event: MessageEvent<unknown>) => {
      const message = parseWorkerMessage(event.data);
      if (message === undefined) {
        setView({
          phase: "failure",
          message: "The application rejected an invalid worker response."
        });
      } else if (message.type === "render_snapshot") {
        setRenderSnapshot(message.snapshot);
      } else if (message.type === "snapshot") {
        setView({ phase: message.phase });
      } else if (message.type === "result") {
        setView({ phase: "result", result: message });
      } else {
        setView({ phase: "failure", message: message.message });
      }
    });
    worker.addEventListener("error", () => {
      setView({
        phase: "failure",
        message: "The simulation worker could not start."
      });
    });
    worker.postMessage({
      protocolVersion: WEB_PROTOCOL_VERSION,
      type: "initialize"
    });
  }

  function confirmPreparation(): void {
    if (submittedRef.current || view.phase !== "preparation") return;
    submittedRef.current = true;
    workerRef.current?.postMessage({
      protocolVersion: WEB_PROTOCOL_VERSION,
      type: "command",
      requestId: crypto.randomUUID(),
      command: { type: "confirmPreparation" }
    });
  }

  return (
    <main>
      <p className="eyebrow">Authoritative checkpoint</p>
      <h1>Dwarven Depths</h1>
      <section className="panel" aria-labelledby="run-heading">
        <h2 id="run-heading">Empty Level Conformance Run</h2>
        {view.phase === "checkpoint" && (
          <dl className="checkpoint-context" aria-label="Current checkpoint">
            <div>
              <dt>Current level</dt>
              <dd>Empty Level</dd>
            </div>
            <div>
              <dt>Next step</dt>
              <dd>Prepare the company</dd>
            </div>
          </dl>
        )}
        {renderSnapshot !== undefined && (
          <Battlefield snapshot={renderSnapshot} />
        )}
        <div
          className="status"
          role="status"
          aria-live="polite"
          aria-atomic="true"
        >
          {view.phase === "checkpoint" && (
            <p>Checkpoint ready. Begin when you are ready to prepare.</p>
          )}
          {view.phase === "preparation" && (
            <p>Preparation is ready. Confirm when your company is prepared.</p>
          )}
          {view.phase === "running" && (
            <p>The authoritative worker is resolving the run…</p>
          )}
          {view.phase === "failure" && <p>Run failed: {view.message}</p>}
          {view.phase === "result" && (
            <p>Run complete: {view.result.terminalResult}.</p>
          )}
        </div>
        {view.phase === "checkpoint" && (
          <button type="button" onClick={startPreparation}>
            Begin preparation
          </button>
        )}
        {view.phase === "preparation" && (
          <button type="button" onClick={confirmPreparation}>
            Confirm preparation
          </button>
        )}
        {view.phase === "result" && (
          <dl className="evidence">
            <div>
              <dt>Terminal result</dt>
              <dd>{view.result.terminalResult}</dd>
            </div>
            <div>
              <dt>Terminal tick</dt>
              <dd>{view.result.terminalTick}</dd>
            </div>
            <div>
              <dt>Final state checksum</dt>
              <dd>
                <code>{view.result.finalStateChecksum}</code>
              </dd>
            </div>
            <div>
              <dt>Event checksum</dt>
              <dd>
                <code>{view.result.eventStreamChecksum}</code>
              </dd>
            </div>
            <div>
              <dt>Replay commands</dt>
              <dd>{view.result.commands.length}</dd>
            </div>
          </dl>
        )}
      </section>
    </main>
  );
}
