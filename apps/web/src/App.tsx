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
  type CheckpointProfileResult,
  type CheckpointProfileStore,
  createCheckpointProfileStore,
  loadCheckpointProfile
} from "./checkpoint-profile.js";
import {
  parseWorkerMessage,
  type TargetPolicy,
  WEB_PROTOCOL_VERSION,
  type WorkerMessage
} from "./protocol.js";
import type { RenderSnapshot } from "./render-snapshot.js";
import { downloadRunEvidence } from "./run-evidence.js";

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

const motionPreferenceStorageKey =
  "dwarven-depths.presentation.motion-preference.v1";
const motionPreferences = ["device", "reduce", "allow"] as const;
type MotionPreference = (typeof motionPreferences)[number];
const textScaleStorageKey = "dwarven-depths.presentation.text-scale.v1";
const textScales = ["default", "large", "extra-large"] as const;
type TextScale = (typeof textScales)[number];
const contrastPreferenceStorageKey =
  "dwarven-depths.presentation.contrast-preference.v1";
const contrastPreferences = ["standard", "high"] as const;
type ContrastPreference = (typeof contrastPreferences)[number];

function isMotionPreference(value: unknown): value is MotionPreference {
  return motionPreferences.some((preference) => preference === value);
}

function readMotionPreference(): MotionPreference {
  try {
    const stored = window.localStorage.getItem(motionPreferenceStorageKey);
    return isMotionPreference(stored) ? stored : "device";
  } catch {
    return "device";
  }
}

function storeMotionPreference(preference: MotionPreference): void {
  try {
    window.localStorage.setItem(motionPreferenceStorageKey, preference);
  } catch {
    // The in-memory presentation preference remains usable without storage.
  }
}

function isTextScale(value: unknown): value is TextScale {
  return textScales.some((scale) => scale === value);
}

function readTextScale(): TextScale {
  try {
    const stored = window.localStorage.getItem(textScaleStorageKey);
    return isTextScale(stored) ? stored : "default";
  } catch {
    return "default";
  }
}

function storeTextScale(scale: TextScale): void {
  try {
    window.localStorage.setItem(textScaleStorageKey, scale);
  } catch {
    // The in-memory presentation preference remains usable without storage.
  }
}

function isContrastPreference(value: unknown): value is ContrastPreference {
  return contrastPreferences.some((preference) => preference === value);
}

function readContrastPreference(): ContrastPreference {
  try {
    const stored = window.localStorage.getItem(contrastPreferenceStorageKey);
    return isContrastPreference(stored) ? stored : "standard";
  } catch {
    return "standard";
  }
}

function storeContrastPreference(preference: ContrastPreference): void {
  try {
    window.localStorage.setItem(contrastPreferenceStorageKey, preference);
  } catch {
    // The in-memory presentation preference remains usable without storage.
  }
}

function createSimulationWorker(): Worker {
  return new Worker(new URL("./simulation.worker.ts", import.meta.url), {
    type: "module"
  });
}

export function App({
  createWorker = createSimulationWorker,
  createProfileStore = createCheckpointProfileStore
}: {
  readonly createWorker?: () => Worker;
  readonly createProfileStore?: () => CheckpointProfileStore;
}) {
  const [view, setView] = useState<ViewState>({ phase: "checkpoint" });
  const [renderSnapshot, setRenderSnapshot] = useState<RenderSnapshot>();
  const [combatControls, setCombatControls] = useState<
    Extract<WorkerMessage, { type: "combat_controls" }> | undefined
  >();
  const [pendingAbilityKeys, setPendingAbilityKeys] = useState<
    ReadonlySet<string>
  >(new Set());
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [upgradeInventoryOpen, setUpgradeInventoryOpen] = useState(false);
  const [checkpointProfile, setCheckpointProfile] = useState<
    CheckpointProfileResult | { readonly status: "loading" }
  >({ status: "loading" });
  const [motionPreference, setMotionPreference] =
    useState<MotionPreference>(readMotionPreference);
  const [textScale, setTextScale] = useState<TextScale>(readTextScale);
  const [contrastPreference, setContrastPreference] =
    useState<ContrastPreference>(readContrastPreference);
  const workerRef = useRef<Worker | undefined>(undefined);
  const initializedRef = useRef(false);
  const submittedRef = useRef(false);
  const manualPauseRequestedRef = useRef<boolean | undefined>(undefined);
  const pendingAbilityKeysRef = useRef(new Set<string>());
  const resultHeadingRef = useRef<HTMLHeadingElement>(null);
  const settingsButtonRef = useRef<HTMLButtonElement>(null);
  const settingsHeadingRef = useRef<HTMLHeadingElement>(null);
  const settingsWasOpenRef = useRef(false);
  const upgradeInventoryButtonRef = useRef<HTMLButtonElement>(null);
  const upgradeInventoryHeadingRef = useRef<HTMLHeadingElement>(null);
  const upgradeInventoryWasOpenRef = useRef(false);

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

  useEffect(() => {
    let active = true;
    let store: CheckpointProfileStore;
    try {
      store = createProfileStore();
    } catch {
      setCheckpointProfile({
        status: "unavailable",
        message:
          "Local progression storage is unavailable. You can still run the conformance level."
      });
      return;
    }
    void loadCheckpointProfile(store).then((result) => {
      if (active) setCheckpointProfile(result);
    });
    return () => {
      active = false;
    };
  }, [createProfileStore]);

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

  useLayoutEffect(() => {
    if (view.phase === "result") resultHeadingRef.current?.focus();
  }, [view]);

  useLayoutEffect(() => {
    if (settingsOpen) settingsHeadingRef.current?.focus();
    else if (settingsWasOpenRef.current) settingsButtonRef.current?.focus();
    settingsWasOpenRef.current = settingsOpen;
  }, [settingsOpen]);

  useLayoutEffect(() => {
    if (upgradeInventoryOpen) upgradeInventoryHeadingRef.current?.focus();
    else if (upgradeInventoryWasOpenRef.current)
      upgradeInventoryButtonRef.current?.focus();
    upgradeInventoryWasOpenRef.current = upgradeInventoryOpen;
  }, [upgradeInventoryOpen]);

  return (
    <main
      data-contrast-preference={contrastPreference}
      data-motion-preference={motionPreference}
      data-text-scale={textScale}
    >
      <p className="eyebrow">Authoritative checkpoint</p>
      <h1>Dwarven Depths</h1>
      <section className="panel" aria-labelledby="run-heading">
        <h2 id="run-heading">Empty Level Conformance Run</h2>
        {view.phase === "checkpoint" &&
          !settingsOpen &&
          !upgradeInventoryOpen && (
            <>
              <dl
                className="checkpoint-context"
                aria-label="Current checkpoint"
              >
                <div>
                  <dt>Current level</dt>
                  <dd>Empty Level</dd>
                </div>
                <div>
                  <dt>Next step</dt>
                  <dd>Prepare the company</dd>
                </div>
              </dl>
              <section
                className="profile-summary"
                aria-labelledby="profile-summary-heading"
              >
                <h3 id="profile-summary-heading">Company progression</h3>
                {checkpointProfile.status === "loading" && (
                  <p>Loading local progression…</p>
                )}
                {checkpointProfile.status === "unavailable" && (
                  <p>{checkpointProfile.message}</p>
                )}
                {checkpointProfile.status === "ready" && (
                  <dl>
                    <div className="profile-summary-row">
                      <dt>Profile status</dt>
                      <dd className="profile-summary-value">Ready</dd>
                    </div>
                    <div className="profile-summary-row">
                      <dt>Forge Ore</dt>
                      <dd className="profile-summary-value">
                        {checkpointProfile.profile.forgeOre}
                      </dd>
                    </div>
                    <div className="profile-summary-row">
                      <dt>Unlocked dwarves</dt>
                      <dd className="profile-summary-value">
                        {checkpointProfile.profile.unlockedCharacterIds.length}
                      </dd>
                    </div>
                  </dl>
                )}
              </section>
            </>
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
          {view.phase === "checkpoint" &&
            !settingsOpen &&
            !upgradeInventoryOpen && (
              <p>Checkpoint ready. Begin when you are ready to prepare.</p>
            )}
          {view.phase === "checkpoint" && settingsOpen && (
            <p>Presentation settings are open.</p>
          )}
          {view.phase === "checkpoint" && upgradeInventoryOpen && (
            <p>Upgrade inventory is open.</p>
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
        {view.phase === "checkpoint" && settingsOpen && (
          <section
            className="settings"
            aria-labelledby="presentation-settings-heading"
          >
            <h3
              id="presentation-settings-heading"
              ref={settingsHeadingRef}
              tabIndex={-1}
            >
              Presentation settings
            </h3>
            <label htmlFor="motion-preference">Motion preference</label>
            <select
              id="motion-preference"
              value={motionPreference}
              onChange={(event) => {
                const preference = event.currentTarget.value;
                if (!isMotionPreference(preference)) return;
                setMotionPreference(preference);
                storeMotionPreference(preference);
              }}
            >
              <option value="device">Use device setting</option>
              <option value="reduce">Reduce motion</option>
              <option value="allow">Allow motion</option>
            </select>
            <label htmlFor="text-scale">Text size</label>
            <select
              id="text-scale"
              value={textScale}
              onChange={(event) => {
                const scale = event.currentTarget.value;
                if (!isTextScale(scale)) return;
                setTextScale(scale);
                storeTextScale(scale);
              }}
            >
              <option value="default">Default</option>
              <option value="large">Large</option>
              <option value="extra-large">Extra large</option>
            </select>
            <label htmlFor="contrast-preference">Contrast</label>
            <select
              id="contrast-preference"
              value={contrastPreference}
              onChange={(event) => {
                const preference = event.currentTarget.value;
                if (!isContrastPreference(preference)) return;
                setContrastPreference(preference);
                storeContrastPreference(preference);
              }}
            >
              <option value="standard">Standard</option>
              <option value="high">High contrast</option>
            </select>
            <p className="settings-help">
              This preference affects presentation only and never changes the
              authoritative simulation.
            </p>
            <button type="button" onClick={() => setSettingsOpen(false)}>
              Close settings
            </button>
          </section>
        )}
        {view.phase === "checkpoint" &&
          upgradeInventoryOpen &&
          checkpointProfile.status === "ready" && (
            <section
              className="upgrades"
              aria-labelledby="upgrade-inventory-heading"
            >
              <h3
                id="upgrade-inventory-heading"
                ref={upgradeInventoryHeadingRef}
                tabIndex={-1}
              >
                Upgrade inventory
              </h3>
              <p>Available Forge Ore: {checkpointProfile.profile.forgeOre}</p>
              {checkpointProfile.profile.purchasedUpgrades.length === 0 ? (
                <p>No upgrades purchased.</p>
              ) : (
                <dl className="upgrade-inventory-list">
                  {checkpointProfile.profile.purchasedUpgrades.map(
                    (upgrade) => (
                      <div key={upgrade.upgradeId}>
                        <dt>
                          <code>{upgrade.upgradeId}</code>
                        </dt>
                        <dd>
                          Rank {upgrade.rank}; {upgrade.forgeOreSpent} Forge Ore
                          spent
                        </dd>
                      </div>
                    )
                  )}
                </dl>
              )}
              <button
                type="button"
                onClick={() => setUpgradeInventoryOpen(false)}
              >
                Close upgrade inventory
              </button>
            </section>
          )}
        {view.phase === "checkpoint" &&
          !settingsOpen &&
          !upgradeInventoryOpen && (
            <div className="checkpoint-actions">
              <button type="button" onClick={startPreparation}>
                Begin preparation
              </button>
              <button
                type="button"
                ref={settingsButtonRef}
                onClick={() => setSettingsOpen(true)}
              >
                Settings
              </button>
              {checkpointProfile.status === "ready" && (
                <button
                  type="button"
                  ref={upgradeInventoryButtonRef}
                  onClick={() => setUpgradeInventoryOpen(true)}
                >
                  Upgrade inventory
                </button>
              )}
            </div>
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
          <section className="results" aria-labelledby="results-heading">
            <h3 id="results-heading" ref={resultHeadingRef} tabIndex={-1}>
              {view.result.terminalResult === "victory"
                ? "Victory results"
                : "Defeat results"}
            </h3>
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
            <div className="result-actions">
              <button
                type="button"
                onClick={() => downloadRunEvidence(view.result)}
              >
                Download run evidence
              </button>
              <button type="button" onClick={returnToCheckpoint}>
                Return to checkpoint
              </button>
            </div>
          </section>
        )}
      </section>
    </main>
  );
}
