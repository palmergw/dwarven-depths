import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState
} from "react";
import { Battlefield } from "./Battlefield.js";
import { CombatControls } from "./CombatControls.js";
import { CombatHud } from "./CombatHud.js";
import {
  parseWorkerMessage,
  type TargetPolicy,
  WEB_PROTOCOL_VERSION,
  type WorkerMessage
} from "./protocol.js";
import type { RenderSnapshot } from "./render-snapshot.js";

type ViewState =
  | { readonly phase: "checkpoint" }
  | {
      readonly phase: "preparation";
      readonly levelId: string;
      readonly deployableEntityCount: number;
      readonly placementPointCount: number;
    }
  | { readonly phase: "running"; readonly manualPaused: boolean }
  | {
      readonly phase: "result";
      readonly result: Extract<WorkerMessage, { type: "result" }>;
    }
  | { readonly phase: "failure"; readonly message: string };

function createSimulationWorker(): Worker {
  return new Worker(new URL("./simulation.worker.ts", import.meta.url), {
    type: "module"
  });
}

export function App({
  createWorker = createSimulationWorker
}: {
  readonly createWorker?: () => Worker;
}) {
  const [view, setView] = useState<ViewState>({ phase: "checkpoint" });
  const [renderSnapshot, setRenderSnapshot] = useState<RenderSnapshot>();
  const [combatControls, setCombatControls] = useState<
    Extract<WorkerMessage, { type: "combat_controls" }> | undefined
  >();
  const [pendingAbilityKeys, setPendingAbilityKeys] = useState<
    ReadonlySet<string>
  >(new Set());
  const workerRef = useRef<Worker | undefined>(undefined);
  const initializedRef = useRef(false);
  const submittedRef = useRef(false);
  const manualPauseRequestedRef = useRef<boolean | undefined>(undefined);
  const pendingAbilityKeysRef = useRef(new Set<string>());

  function clearPendingAbilities(): void {
    pendingAbilityKeysRef.current.clear();
    setPendingAbilityKeys(new Set());
  }

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
    const worker = createWorker();
    workerRef.current = worker;
    worker.addEventListener("message", (event: MessageEvent<unknown>) => {
      if (workerRef.current !== worker) return;
      const message = parseWorkerMessage(event.data);
      if (message === undefined) {
        setView({
          phase: "failure",
          message: "The application rejected an invalid worker response."
        });
      } else if (message.type === "render_snapshot") {
        setRenderSnapshot(message.snapshot);
      } else if (message.type === "combat_controls") {
        clearPendingAbilities();
        setCombatControls(message);
      } else if (message.type === "snapshot") {
        if (message.phase === "running" && message.protocolVersion !== 1) {
          if (manualPauseRequestedRef.current === undefined)
            manualPauseRequestedRef.current = message.manualPaused;
          if (
            !message.manualPaused &&
            message.resumeRequestId !== null &&
            manualPauseRequestedRef.current === false
          ) {
            worker.postMessage({
              protocolVersion: WEB_PROTOCOL_VERSION,
              type: "command",
              requestId: crypto.randomUUID(),
              command: {
                type: "commitManualResume",
                resumeRequestId: message.resumeRequestId
              }
            });
          }
        }
        setView(
          message.phase === "preparation"
            ? {
                phase: "preparation",
                levelId: message.levelId,
                deployableEntityCount: message.deployableEntityCount,
                placementPointCount: message.placementPointCount
              }
            : {
                phase: "running",
                manualPaused:
                  message.protocolVersion !== 1 && message.manualPaused
              }
        );
      } else if (message.type === "result") {
        clearPendingAbilities();
        setView({ phase: "result", result: message });
      } else if (message.code !== "command_rejected") {
        setView({ phase: "failure", message: message.message });
      }
    });
    worker.addEventListener("error", () => {
      if (workerRef.current !== worker) return;
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

  function returnToCheckpoint(): void {
    if (view.phase !== "result") return;
    workerRef.current?.terminate();
    workerRef.current = undefined;
    initializedRef.current = false;
    submittedRef.current = false;
    manualPauseRequestedRef.current = undefined;
    clearPendingAbilities();
    setCombatControls(undefined);
    setRenderSnapshot(undefined);
    setView({ phase: "checkpoint" });
  }

  const setManualPause = useCallback(
    (paused: boolean): void => {
      if (
        view.phase !== "running" ||
        manualPauseRequestedRef.current === paused
      )
        return;
      manualPauseRequestedRef.current = paused;
      workerRef.current?.postMessage({
        protocolVersion: WEB_PROTOCOL_VERSION,
        type: "command",
        requestId: crypto.randomUUID(),
        command: { type: "setManualPause", paused }
      });
    },
    [view]
  );

  const setTargetPolicy = useCallback(
    (dwarfEntityId: string, requestedPolicy: TargetPolicy): void => {
      if (view.phase !== "running" || combatControls?.protocolVersion !== 4)
        return;
      const dwarf = combatControls.dwarves.find(
        (candidate) => candidate.entityId === dwarfEntityId
      );
      if (!dwarf?.supportedTargetPolicies.includes(requestedPolicy)) return;
      workerRef.current?.postMessage({
        protocolVersion: WEB_PROTOCOL_VERSION,
        type: "command",
        requestId: crypto.randomUUID(),
        command: {
          type: "setTargetPolicy",
          dwarfEntityId,
          requestedPolicy
        }
      });
    },
    [combatControls, view]
  );

  const activateAbility = useCallback(
    (dwarfEntityId: string, abilityId: string): void => {
      if (view.phase !== "running" || combatControls?.protocolVersion !== 4)
        return;
      const ability = combatControls.dwarves
        .find((dwarf) => dwarf.entityId === dwarfEntityId)
        ?.activeAbilities?.find(
          (candidate) => candidate.abilityId === abilityId
        );
      if (
        ability === undefined ||
        ability.cooldownCompleteAtTick !== null ||
        ability.rejectionReason !== null
      )
        return;
      const pendingKey = `${dwarfEntityId}\u0000${abilityId}`;
      if (pendingAbilityKeysRef.current.has(pendingKey)) return;
      pendingAbilityKeysRef.current.add(pendingKey);
      setPendingAbilityKeys(new Set(pendingAbilityKeysRef.current));
      workerRef.current?.postMessage({
        protocolVersion: WEB_PROTOCOL_VERSION,
        type: "command",
        requestId: crypto.randomUUID(),
        command: { type: "activateAbility", dwarfEntityId, abilityId }
      });
    },
    [combatControls, view]
  );

  useLayoutEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.repeat || view.phase !== "running")
        return;
      event.preventDefault();
      setManualPause(!(manualPauseRequestedRef.current ?? view.manualPaused));
    };
    const onBlur = () => {
      if (view.phase === "running" && manualPauseRequestedRef.current === false)
        setManualPause(true);
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("blur", onBlur);
    };
  }, [view, setManualPause]);

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
        {renderSnapshot !== undefined &&
          (renderSnapshot.phase === "running" ||
            renderSnapshot.phase === "terminal") && (
            <CombatHud snapshot={renderSnapshot} />
          )}
        {view.phase === "running" && combatControls !== undefined && (
          <CombatControls
            dwarves={combatControls.dwarves}
            pendingAbilityKeys={pendingAbilityKeys}
            onSetTargetPolicy={setTargetPolicy}
            onActivateAbility={activateAbility}
          />
        )}
        {view.phase === "preparation" && (
          <dl className="preparation-summary" aria-label="Preparation summary">
            <div>
              <dt>Authoritative level</dt>
              <dd>{view.levelId}</dd>
            </div>
            <div>
              <dt>Company roster</dt>
              <dd>
                {view.deployableEntityCount === 0
                  ? "Empty — no dwarves require placement"
                  : `${view.deployableEntityCount} dwarves`}
              </dd>
            </div>
            <div>
              <dt>Placement points</dt>
              <dd>{view.placementPointCount}</dd>
            </div>
          </dl>
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
            <p>
              {view.manualPaused
                ? "Combat is manually paused."
                : "The authoritative worker is resolving the run…"}
            </p>
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
        {view.phase === "running" && (
          <button
            type="button"
            aria-pressed={view.manualPaused}
            onClick={() => setManualPause(!view.manualPaused)}
          >
            {view.manualPaused ? "Resume combat" : "Pause combat"}
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
        {view.phase === "result" && (
          <button type="button" onClick={returnToCheckpoint}>
            Return to checkpoint
          </button>
        )}
      </section>
    </main>
  );
}
