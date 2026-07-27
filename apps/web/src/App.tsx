import type { StableId } from "@dwarven-depths/contracts";
import {
  deriveCharacterSkillEligibility,
  ironWardenSkillTree,
  type ProfileState,
  type PurchasedUpgradeDefinition,
  purchasedUpgradeCatalog
} from "@dwarven-depths/progression";
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
  isCheckpointProfileSaveConflict,
  loadCheckpointProfile,
  purchaseCheckpointUpgrade,
  recycleCheckpointIronWardenSkills,
  recycleCheckpointUpgrades,
  selectCheckpointIronWardenSkill
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

type UpgradePurchaseStatus =
  | { readonly kind: "idle" }
  | { readonly kind: "pending"; readonly upgradeId: StableId }
  | { readonly kind: "success"; readonly message: string }
  | { readonly kind: "failure"; readonly message: string };

function upgradePurchaseState(
  profile: ProfileState,
  definition: PurchasedUpgradeDefinition
): {
  readonly currentRank: number;
  readonly nextCost: number | undefined;
  readonly unavailableReason: string | undefined;
} {
  const purchase = profile.purchasedUpgrades.find(
    (candidate) => candidate.upgradeId === definition.upgradeId
  );
  const currentRank = purchase?.rank ?? 0;
  const nextCost = definition.rankCosts[currentRank];
  const ownerIds =
    definition.kind === "ability_rank"
      ? profile.unlockedCharacterIds
      : profile.unlockedItemIds;
  let unavailableReason: string | undefined;
  if (!ownerIds.includes(definition.ownerId))
    unavailableReason = `Requires unlocked owner ${definition.ownerId}.`;
  else if (nextCost === undefined) unavailableReason = "Maximum rank owned.";
  else {
    const missingPrerequisite = definition.prerequisiteUpgradeIds.find(
      (upgradeId) =>
        !profile.purchasedUpgrades.some(
          (candidate) => candidate.upgradeId === upgradeId
        )
    );
    if (missingPrerequisite !== undefined)
      unavailableReason = `Requires ${missingPrerequisite}.`;
    else if (profile.forgeOre < nextCost)
      unavailableReason = `Requires ${nextCost} Forge Ore.`;
  }
  return { currentRank, nextCost, unavailableReason };
}

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
  const [recycleConfirmationOpen, setRecycleConfirmationOpen] = useState(false);
  const [skillRecycleConfirmationOpen, setSkillRecycleConfirmationOpen] =
    useState(false);
  const [upgradePurchaseStatus, setUpgradePurchaseStatus] =
    useState<UpgradePurchaseStatus>({ kind: "idle" });
  const [checkpointProfile, setCheckpointProfile] = useState<
    CheckpointProfileResult | { readonly status: "loading" }
  >({ status: "loading" });
  const [motionPreference, setMotionPreference] =
    useState<MotionPreference>(readMotionPreference);
  const [textScale, setTextScale] = useState<TextScale>(readTextScale);
  const [contrastPreference, setContrastPreference] =
    useState<ContrastPreference>(readContrastPreference);
  const workerRef = useRef<Worker | undefined>(undefined);
  const profileStoreRef = useRef<CheckpointProfileStore | undefined>(undefined);
  const upgradePurchasePendingRef = useRef(false);
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
  const recycleButtonRef = useRef<HTMLButtonElement>(null);
  const recycleHeadingRef = useRef<HTMLHeadingElement>(null);
  const recycleConfirmationWasOpenRef = useRef(false);
  const skillRecycleButtonRef = useRef<HTMLButtonElement>(null);
  const skillRecycleHeadingRef = useRef<HTMLHeadingElement>(null);
  const skillRecycleConfirmationWasOpenRef = useRef(false);
  const skillTreeHeadingRef = useRef<HTMLHeadingElement>(null);
  const focusSkillTreeAfterSelectionRef = useRef(false);

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
      profileStoreRef.current = store;
    } catch {
      setCheckpointProfile({
        status: "unavailable",
        message:
          "Local progression storage is unavailable. You can still run the conformance level."
      });
      return;
    }
    void loadCheckpointProfile(store, Date.now, false).then((result) => {
      if (active) setCheckpointProfile(result);
    });
    return () => {
      active = false;
      if (profileStoreRef.current === store)
        profileStoreRef.current = undefined;
      void store.close().catch(() => undefined);
    };
  }, [createProfileStore]);

  async function purchaseUpgrade(upgradeId: StableId): Promise<void> {
    if (
      upgradePurchasePendingRef.current ||
      checkpointProfile.status !== "ready" ||
      profileStoreRef.current === undefined
    )
      return;
    upgradePurchasePendingRef.current = true;
    setUpgradePurchaseStatus({ kind: "pending", upgradeId });
    try {
      const profile = await purchaseCheckpointUpgrade(
        profileStoreRef.current,
        checkpointProfile.profile,
        upgradeId
      );
      setCheckpointProfile({ status: "ready", profile });
      setUpgradePurchaseStatus({
        kind: "success",
        message: `${upgradeId} rank purchased. ${profile.forgeOre} Forge Ore remains.`
      });
    } catch (error) {
      if (isCheckpointProfileSaveConflict(error)) {
        const refreshed = await loadCheckpointProfile(
          profileStoreRef.current,
          Date.now,
          false
        );
        if (refreshed.status === "ready") {
          setCheckpointProfile(refreshed);
          setUpgradePurchaseStatus({
            kind: "failure",
            message:
              "Progression changed in another tab. The latest saved progression is loaded; review it and retry."
          });
          return;
        }
      }
      setUpgradePurchaseStatus({
        kind: "failure",
        message:
          "The upgrade was not saved. Your last confirmed progression is unchanged; retry after checking local storage."
      });
    } finally {
      upgradePurchasePendingRef.current = false;
    }
  }

  async function recycleUpgrades(): Promise<void> {
    if (
      upgradePurchasePendingRef.current ||
      checkpointProfile.status !== "ready" ||
      profileStoreRef.current === undefined
    )
      return;
    upgradePurchasePendingRef.current = true;
    setUpgradePurchaseStatus({
      kind: "pending",
      upgradeId: "upgrade.recycle" as StableId
    });
    try {
      const profile = await recycleCheckpointUpgrades(
        profileStoreRef.current,
        checkpointProfile.profile
      );
      setCheckpointProfile({ status: "ready", profile });
      setRecycleConfirmationOpen(false);
      setUpgradePurchaseStatus({
        kind: "success",
        message: `Shared upgrades recycled. ${profile.forgeOre} Forge Ore is now available.`
      });
    } catch (error) {
      if (isCheckpointProfileSaveConflict(error)) {
        const refreshed = await loadCheckpointProfile(
          profileStoreRef.current,
          Date.now,
          false
        );
        if (refreshed.status === "ready") {
          setCheckpointProfile(refreshed);
          setRecycleConfirmationOpen(false);
          setUpgradePurchaseStatus({
            kind: "failure",
            message:
              "Progression changed in another tab. The latest saved progression is loaded; review it before recycling."
          });
          return;
        }
      }
      setUpgradePurchaseStatus({
        kind: "failure",
        message:
          "The recycle was not saved. Your last confirmed progression is unchanged; retry after checking local storage."
      });
    } finally {
      upgradePurchasePendingRef.current = false;
    }
  }

  async function recycleIronWardenSkills(): Promise<void> {
    if (
      upgradePurchasePendingRef.current ||
      checkpointProfile.status !== "ready" ||
      profileStoreRef.current === undefined
    )
      return;
    upgradePurchasePendingRef.current = true;
    setUpgradePurchaseStatus({
      kind: "pending",
      upgradeId: "skill.recycle.iron_warden" as StableId
    });
    try {
      const profile = await recycleCheckpointIronWardenSkills(
        profileStoreRef.current,
        checkpointProfile.profile
      );
      setCheckpointProfile({ status: "ready", profile });
      setSkillRecycleConfirmationOpen(false);
      setUpgradePurchaseStatus({
        kind: "success",
        message:
          "Iron Warden skill tree recycled. Spent skill points are available again."
      });
    } catch (error) {
      if (isCheckpointProfileSaveConflict(error)) {
        const refreshed = await loadCheckpointProfile(
          profileStoreRef.current,
          Date.now,
          false
        );
        if (refreshed.status === "ready") {
          setCheckpointProfile(refreshed);
          setSkillRecycleConfirmationOpen(false);
          setUpgradePurchaseStatus({
            kind: "failure",
            message:
              "Progression changed in another tab. The latest saved progression is loaded; review it before recycling."
          });
          return;
        }
      }
      setUpgradePurchaseStatus({
        kind: "failure",
        message:
          "The skill recycle was not saved. Your last confirmed progression is unchanged; retry after checking local storage."
      });
    } finally {
      upgradePurchasePendingRef.current = false;
    }
  }

  async function selectIronWardenSkill(nodeId: StableId): Promise<void> {
    if (
      upgradePurchasePendingRef.current ||
      checkpointProfile.status !== "ready" ||
      profileStoreRef.current === undefined
    )
      return;
    upgradePurchasePendingRef.current = true;
    setUpgradePurchaseStatus({ kind: "pending", upgradeId: nodeId });
    try {
      const profile = await selectCheckpointIronWardenSkill(
        profileStoreRef.current,
        checkpointProfile.profile,
        nodeId
      );
      focusSkillTreeAfterSelectionRef.current = true;
      setCheckpointProfile({ status: "ready", profile });
      setUpgradePurchaseStatus({
        kind: "success",
        message: `${nodeId} selected for Iron Warden.`
      });
    } catch (error) {
      if (isCheckpointProfileSaveConflict(error)) {
        const refreshed = await loadCheckpointProfile(
          profileStoreRef.current,
          Date.now,
          false
        );
        if (refreshed.status === "ready") {
          focusSkillTreeAfterSelectionRef.current = true;
          setCheckpointProfile(refreshed);
          setUpgradePurchaseStatus({
            kind: "failure",
            message:
              "Progression changed in another tab. The latest saved progression is loaded; review the eligible skills and retry."
          });
          return;
        }
      }
      setUpgradePurchaseStatus({
        kind: "failure",
        message:
          "The skill selection was not saved. Your last confirmed progression is unchanged; retry after checking local storage."
      });
    } finally {
      upgradePurchasePendingRef.current = false;
    }
  }

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

  useLayoutEffect(() => {
    if (recycleConfirmationOpen) recycleHeadingRef.current?.focus();
    else if (recycleConfirmationWasOpenRef.current)
      recycleButtonRef.current?.focus();
    recycleConfirmationWasOpenRef.current = recycleConfirmationOpen;
  }, [recycleConfirmationOpen]);

  useLayoutEffect(() => {
    if (skillRecycleConfirmationOpen) skillRecycleHeadingRef.current?.focus();
    else if (skillRecycleConfirmationWasOpenRef.current)
      skillRecycleButtonRef.current?.focus();
    skillRecycleConfirmationWasOpenRef.current = skillRecycleConfirmationOpen;
  }, [skillRecycleConfirmationOpen]);

  useLayoutEffect(() => {
    if (!focusSkillTreeAfterSelectionRef.current) return;
    focusSkillTreeAfterSelectionRef.current = false;
    skillTreeHeadingRef.current?.focus();
  });

  const ironWardenSkillEligibility =
    checkpointProfile.status === "ready"
      ? deriveCharacterSkillEligibility({
          schemaVersion: 1,
          profile: checkpointProfile.profile,
          tree: ironWardenSkillTree
        })
      : undefined;

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
              <h4>Available upgrades</h4>
              <div className="upgrade-catalog">
                {purchasedUpgradeCatalog.upgrades.map((definition) => {
                  const state = upgradePurchaseState(
                    checkpointProfile.profile,
                    definition
                  );
                  const descriptionId = `${definition.upgradeId.replaceAll(".", "-")}-purchase-status`;
                  const pending =
                    upgradePurchaseStatus.kind === "pending" &&
                    upgradePurchaseStatus.upgradeId === definition.upgradeId;
                  return (
                    <section key={definition.upgradeId}>
                      <h5>
                        <code>{definition.upgradeId}</code>
                      </h5>
                      <p>
                        Rank {state.currentRank} of{" "}
                        {definition.rankCosts.length}
                      </p>
                      <p id={descriptionId}>
                        {state.unavailableReason ??
                          `Next rank costs ${state.nextCost} Forge Ore.`}
                      </p>
                      <button
                        type="button"
                        aria-describedby={descriptionId}
                        disabled={
                          state.unavailableReason !== undefined ||
                          upgradePurchaseStatus.kind === "pending"
                        }
                        onClick={() =>
                          void purchaseUpgrade(definition.upgradeId)
                        }
                      >
                        {pending
                          ? "Saving purchase…"
                          : state.nextCost === undefined
                            ? "Maximum rank owned"
                            : `Purchase rank ${state.currentRank + 1} for ${state.nextCost} Forge Ore`}
                      </button>
                    </section>
                  );
                })}
              </div>
              <section aria-labelledby="iron-warden-skills-heading">
                <h4
                  id="iron-warden-skills-heading"
                  ref={skillTreeHeadingRef}
                  tabIndex={-1}
                >
                  Iron Warden skills
                </h4>
                {checkpointProfile.profile.selectedSkillNodes.some(
                  (selection) =>
                    selection.characterId === "character.iron_warden"
                ) ? (
                  <ul>
                    {checkpointProfile.profile.selectedSkillNodes
                      .filter(
                        (selection) =>
                          selection.characterId === "character.iron_warden"
                      )
                      .map((selection) => (
                        <li key={selection.nodeId}>
                          <code>{selection.nodeId}</code> selected at level{" "}
                          {selection.spentSkillPointLevel}
                        </li>
                      ))}
                  </ul>
                ) : (
                  <p>No Iron Warden skills selected.</p>
                )}
                {ironWardenSkillEligibility?.pendingSkillPointLevel === null ? (
                  <p>No pending Iron Warden skill points.</p>
                ) : (
                  <>
                    <p>
                      Pending skill point from level{" "}
                      {ironWardenSkillEligibility?.pendingSkillPointLevel}.
                    </p>
                    <div className="upgrade-catalog">
                      {ironWardenSkillEligibility?.eligibleNodeIds.map(
                        (nodeId) => (
                          <button
                            type="button"
                            key={nodeId}
                            disabled={upgradePurchaseStatus.kind === "pending"}
                            onClick={() => void selectIronWardenSkill(nodeId)}
                          >
                            {upgradePurchaseStatus.kind === "pending" &&
                            upgradePurchaseStatus.upgradeId === nodeId
                              ? "Saving skill selection…"
                              : `Select ${nodeId}`}
                          </button>
                        )
                      )}
                    </div>
                  </>
                )}
              </section>
              {checkpointProfile.profile.purchasedUpgrades.length > 0 &&
                !recycleConfirmationOpen && (
                  <button
                    type="button"
                    ref={recycleButtonRef}
                    disabled={upgradePurchaseStatus.kind === "pending"}
                    onClick={() => {
                      skillRecycleConfirmationWasOpenRef.current = false;
                      setSkillRecycleConfirmationOpen(false);
                      setRecycleConfirmationOpen(true);
                    }}
                  >
                    Recycle all shared upgrades
                  </button>
                )}
              {recycleConfirmationOpen && (
                <section
                  className="recycle-confirmation"
                  aria-labelledby="recycle-confirmation-heading"
                >
                  <h4
                    id="recycle-confirmation-heading"
                    ref={recycleHeadingRef}
                    tabIndex={-1}
                  >
                    Confirm shared upgrade recycle
                  </h4>
                  <p>
                    This removes every shared purchased upgrade and refunds
                    exactly{" "}
                    {checkpointProfile.profile.purchasedUpgrades.reduce(
                      (total, purchase) => total + purchase.forgeOreSpent,
                      0
                    )}{" "}
                    Forge Ore. Campaign access returns to the first level.
                    Characters, experience, unlocks, items, rewards, settings,
                    and unspent Forge Ore remain.
                  </p>
                  <div className="recycle-actions">
                    <button
                      type="button"
                      disabled={upgradePurchaseStatus.kind === "pending"}
                      onClick={() => void recycleUpgrades()}
                    >
                      {upgradePurchaseStatus.kind === "pending"
                        ? "Saving recycle…"
                        : "Confirm recycle"}
                    </button>
                    <button
                      type="button"
                      disabled={upgradePurchaseStatus.kind === "pending"}
                      onClick={() => setRecycleConfirmationOpen(false)}
                    >
                      Cancel recycle
                    </button>
                  </div>
                </section>
              )}
              {checkpointProfile.profile.selectedSkillNodes.some(
                (selection) => selection.characterId === "character.iron_warden"
              ) &&
                !skillRecycleConfirmationOpen && (
                  <button
                    type="button"
                    ref={skillRecycleButtonRef}
                    disabled={upgradePurchaseStatus.kind === "pending"}
                    onClick={() => {
                      setRecycleConfirmationOpen(false);
                      setSkillRecycleConfirmationOpen(true);
                    }}
                  >
                    Recycle Iron Warden skill tree
                  </button>
                )}
              {skillRecycleConfirmationOpen && (
                <section
                  className="recycle-confirmation"
                  aria-labelledby="skill-recycle-confirmation-heading"
                >
                  <h4
                    id="skill-recycle-confirmation-heading"
                    ref={skillRecycleHeadingRef}
                    tabIndex={-1}
                  >
                    Confirm Iron Warden skill recycle
                  </h4>
                  <p>
                    This removes only the Iron Warden selected skill nodes and
                    restores spent skill-point levels{" "}
                    {checkpointProfile.profile.selectedSkillNodes
                      .filter(
                        (selection) =>
                          selection.characterId === "character.iron_warden"
                      )
                      .map((selection) => selection.spentSkillPointLevel)
                      .sort((left, right) => left - right)
                      .join(", ")}
                    . Campaign access returns to the first level. Shared
                    upgrades, Forge Ore, other characters, unlocks, rewards,
                    experience, presentation settings, and already pending skill
                    points remain.
                  </p>
                  <div className="recycle-actions">
                    <button
                      type="button"
                      disabled={upgradePurchaseStatus.kind === "pending"}
                      onClick={() => void recycleIronWardenSkills()}
                    >
                      {upgradePurchaseStatus.kind === "pending"
                        ? "Saving skill recycle…"
                        : "Confirm skill recycle"}
                    </button>
                    <button
                      type="button"
                      disabled={upgradePurchaseStatus.kind === "pending"}
                      onClick={() => setSkillRecycleConfirmationOpen(false)}
                    >
                      Cancel skill recycle
                    </button>
                  </div>
                </section>
              )}
              {upgradePurchaseStatus.kind !== "idle" &&
                upgradePurchaseStatus.kind !== "pending" && (
                  <p
                    className={`purchase-${upgradePurchaseStatus.kind}`}
                    role="status"
                    aria-live="polite"
                  >
                    {upgradePurchaseStatus.message}
                  </p>
                )}
              <button
                type="button"
                onClick={() => {
                  setUpgradePurchaseStatus({ kind: "idle" });
                  setRecycleConfirmationOpen(false);
                  setSkillRecycleConfirmationOpen(false);
                  setUpgradeInventoryOpen(false);
                }}
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
                  onClick={() => {
                    setUpgradePurchaseStatus({ kind: "idle" });
                    setRecycleConfirmationOpen(false);
                    setSkillRecycleConfirmationOpen(false);
                    setUpgradeInventoryOpen(true);
                  }}
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
