import type { StableId } from "@dwarven-depths/contracts";
import {
  type CharacterSkillEffect,
  createInitialProfile,
  deriveCharacterSkillEligibility,
  ironWardenSkillTree,
  type ProfileState,
  type PurchasedUpgradeDefinition,
  purchasedUpgradeCatalog
} from "@dwarven-depths/progression";
import {
  type KeyboardEvent as ReactKeyboardEvent,
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
  applyCheckpointAttemptResult,
  type CheckpointProfileResult,
  type CheckpointProfileStore,
  createCheckpointProfileStore,
  isCheckpointProfileSaveConflict,
  loadCheckpointProfile,
  purchaseCheckpointUpgrade,
  recycleCheckpointIronWardenSkills,
  recycleCheckpointUpgrades,
  selectCheckpointIronWardenSkill,
  validateCheckpointAttemptResult
} from "./checkpoint-profile.js";
import {
  parseWorkerMessage,
  type SimulationSpeed,
  type TargetPolicy,
  WEB_PROTOCOL_VERSION,
  type WorkerMessage
} from "./protocol.js";
import type { RenderSnapshot } from "./render-snapshot.js";
import { downloadRunEvidence } from "./run-evidence.js";

const TERMINAL_PRESENTATION_DURATION_MS = 720;

const checkpointBackdropUrl = new URL(
  "../../../assets/game-art/layered-map-poc/blender/outputs/environment-base.png",
  import.meta.url
).href;
const ironWardenPortraitUrl = new URL(
  "../../../assets/game-art/production-scene/exports/hud/warden-portrait.png",
  import.meta.url
).href;
const expeditionFailureMessage =
  "The expedition could not continue. Return to the checkpoint and try again.";

type ViewState =
  | { readonly phase: "checkpoint" }
  | {
      readonly phase: "preparation";
      readonly levelId: string;
      readonly deployableEntityCount: number;
      readonly placementPointCount: number;
    }
  | {
      readonly phase: "running";
      readonly manualPaused: boolean;
      readonly simulationSpeed: SimulationSpeed;
    }
  | {
      readonly phase: "result";
      readonly result: Extract<WorkerMessage, { type: "result" }>;
      readonly savedProfile?: ProfileState;
    }
  | {
      readonly phase: "failure";
      readonly message: string;
      readonly inspectionMessage?: string;
    };

const runJourneySteps = [
  {
    phase: "checkpoint",
    label: "Review the checkpoint",
    description:
      "Review company progression and upgrades, then begin preparation."
  },
  {
    phase: "preparation",
    label: "Prepare the company",
    description:
      "Review the roster and placement summary, then confirm preparation."
  },
  {
    phase: "running",
    label: "Follow the combat",
    description:
      "Use the combat controls as available. Press Escape or use the pause button to pause; changing windows pauses automatically."
  },
  {
    phase: "review",
    label: "Review the evidence",
    description:
      "Review the terminal outcome and download its authoritative run evidence."
  }
] as const;

function RunJourneyGuide({ phase }: { readonly phase: ViewState["phase"] }) {
  const currentIndex =
    phase === "checkpoint"
      ? 0
      : phase === "preparation"
        ? 1
        : phase === "running"
          ? 2
          : 3;

  return (
    <section className="run-journey" aria-labelledby="run-journey-heading">
      <h3 id="run-journey-heading">Your run journey</h3>
      <ol>
        {runJourneySteps.map((step, index) => {
          const state =
            index < currentIndex
              ? "complete"
              : index === currentIndex
                ? "current"
                : "upcoming";
          const description =
            phase === "failure" && index === currentIndex
              ? "Review the failure details, then return to the checkpoint to try again."
              : step.description;
          return (
            <li
              key={step.phase}
              className={`run-journey-step run-journey-step-${state}`}
              aria-current={state === "current" ? "step" : undefined}
              data-state={state}
            >
              <span className="run-journey-step-label">{step.label}</span>
              <span className="run-journey-step-state">
                {state === "complete"
                  ? "Complete"
                  : state === "current"
                    ? "Current step"
                    : "Upcoming"}
              </span>
              <p>{description}</p>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

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
const soundPreferenceStorageKey =
  "dwarven-depths.presentation.sound-preference.v1";
const soundPreferences = ["off", "on"] as const;
type SoundPreference = (typeof soundPreferences)[number];

const panelFocusableSelector =
  'button:not([disabled]), select:not([disabled]), input:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])';

function containPanelFocus(event: ReactKeyboardEvent<HTMLElement>): void {
  if (event.key !== "Tab") return;
  const focusable = Array.from(
    event.currentTarget.querySelectorAll<HTMLElement>(panelFocusableSelector)
  );
  const first = focusable[0];
  const last = focusable.at(-1);
  if (!first || !last) {
    event.preventDefault();
    return;
  }
  if (
    event.shiftKey &&
    (document.activeElement === first ||
      !focusable.some((element) => element === document.activeElement))
  ) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

function isolateDialogFromSiblings(dialog: HTMLElement): () => void {
  const siblings = Array.from(dialog.parentElement?.children ?? []).filter(
    (element): element is HTMLElement =>
      element instanceof HTMLElement && element !== dialog
  );
  const priorInertValues = siblings.map((element) => element.inert);
  for (const element of siblings) element.inert = true;
  return () => {
    for (const [index, element] of siblings.entries())
      element.inert = priorInertValues[index] ?? false;
  };
}

type UpgradePurchaseStatus =
  | { readonly kind: "idle" }
  | { readonly kind: "pending"; readonly upgradeId: StableId }
  | { readonly kind: "success"; readonly message: string }
  | { readonly kind: "failure"; readonly message: string };

function describeEffect(effect: CharacterSkillEffect): string {
  switch (effect.kind) {
    case "maximum_health_add":
      return `+${effect.value} maximum health`;
    case "attack_damage_add":
      return `+${effect.value} attack damage`;
    case "attack_range_add":
      return `+${effect.value} attack range`;
    case "future_cooldown_reduction_ticks":
      return `-${effect.value} future cooldown ticks`;
  }
}

function describeEffects(effects: readonly CharacterSkillEffect[]): string {
  return effects.length === 0
    ? "No passive battlefield modifiers."
    : `${effects.map(describeEffect).join("; ")}.`;
}

function describePrerequisites(
  prerequisiteNodeIds: readonly StableId[]
): string {
  return prerequisiteNodeIds.length === 0
    ? "none."
    : `${prerequisiteNodeIds.map(playerFacingName).join(", ")}.`;
}

function playerFacingName(id: StableId): string {
  switch (id) {
    case "character.iron_warden":
      return "Iron Warden";
    case "item.powder_cask":
      return "Powder Cask";
    case "upgrade.ability.shield_slam":
      return "Shield Slam Training";
    case "upgrade.item.powder_cask":
      return "Powder Cask Reinforcement";
    case "skill.iron_warden.disciplined_slam":
      return "Disciplined Slam";
    case "skill.iron_warden.long_reach":
      return "Long Reach";
    case "skill.iron_warden.stone_guard":
      return "Stone Guard";
    default:
      return "Locked company training";
  }
}

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
    unavailableReason = `Requires ${playerFacingName(definition.ownerId)}.`;
  else if (nextCost === undefined) unavailableReason = "Maximum rank owned.";
  else {
    const missingPrerequisite = definition.prerequisiteUpgradeIds.find(
      (upgradeId) =>
        !profile.purchasedUpgrades.some(
          (candidate) => candidate.upgradeId === upgradeId
        )
    );
    if (missingPrerequisite !== undefined)
      unavailableReason = `Requires ${playerFacingName(missingPrerequisite)}.`;
    else if (profile.forgeOre < nextCost)
      unavailableReason = `Requires ${nextCost} Forge Ore.`;
  }
  return { currentRank, nextCost, unavailableReason };
}

function createRunConfiguration(profile: ProfileState) {
  const completedAttempts = profile.claimedRewardIds.filter((rewardId) =>
    /^reward\.attempt\.shuttergate\.web_[0-9]{6}$/.test(rewardId)
  ).length;
  const attemptNumber = completedAttempts + 1;
  if (attemptNumber > 999_999)
    throw new RangeError("The Shuttergate campaign attempt limit was reached.");
  return Object.freeze({
    schemaVersion: 1 as const,
    attemptId:
      `attempt.shuttergate.web_${String(attemptNumber).padStart(6, "0")}` as StableId,
    seed: String(attemptNumber),
    placementPointId: "placement.shuttergate_north_guard" as StableId,
    profile
  });
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

function isSoundPreference(value: unknown): value is SoundPreference {
  return soundPreferences.some((preference) => preference === value);
}

function readSoundPreference(): SoundPreference {
  try {
    const stored = window.localStorage.getItem(soundPreferenceStorageKey);
    return isSoundPreference(stored) ? stored : "off";
  } catch {
    return "off";
  }
}

function storeSoundPreference(preference: SoundPreference): void {
  try {
    window.localStorage.setItem(soundPreferenceStorageKey, preference);
  } catch {
    // The in-memory presentation preference remains usable without storage.
  }
}

function readsReducedMotion(): boolean {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
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
  const [pendingTargetPolicies, setPendingTargetPolicies] = useState<
    ReadonlyMap<string, TargetPolicy>
  >(new Map());
  const [rejectedAbilityKeys, setRejectedAbilityKeys] = useState<
    ReadonlySet<string>
  >(new Set());
  const [rejectedTargetPolicies, setRejectedTargetPolicies] = useState<
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
  const [soundPreference, setSoundPreference] =
    useState<SoundPreference>(readSoundPreference);
  const [deviceReducedMotion, setDeviceReducedMotion] =
    useState(readsReducedMotion);
  const workerRef = useRef<Worker | undefined>(undefined);
  const runConfigurationRef = useRef<
    ReturnType<typeof createRunConfiguration> | undefined
  >(undefined);
  const workerFailureRef = useRef<
    ((inspectionMessage: string) => void) | undefined
  >(undefined);
  const profileStoreRef = useRef<CheckpointProfileStore | undefined>(undefined);
  const runStartingProfileRef = useRef<ProfileState | undefined>(undefined);
  const appliedTerminalRewardIdsRef = useRef(new Set<string>());
  const latestRenderSnapshotRef = useRef<RenderSnapshot | undefined>(undefined);
  const terminalPresentationDeadlineRef = useRef(0);
  const terminalPresentationTimerRef = useRef<number | undefined>(undefined);
  const terminalResultPendingRef = useRef(false);
  const upgradePurchasePendingRef = useRef(false);
  const initializedRef = useRef(false);
  const submittedRef = useRef(false);
  const manualPauseRequestedRef = useRef<boolean | undefined>(undefined);
  const latestCombatControlsTickRef = useRef(-1);
  const pendingAbilityKeysRef = useRef(
    new Map<
      string,
      { readonly requestId: string; readonly submittedAtTick: number }
    >()
  );
  const pendingTargetPoliciesRef = useRef(
    new Map<
      string,
      {
        readonly policy: TargetPolicy;
        readonly requestId: string;
        readonly submittedAtTick: number;
      }
    >()
  );
  const resultHeadingRef = useRef<HTMLHeadingElement>(null);
  const failureHeadingRef = useRef<HTMLHeadingElement>(null);
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
  const focusSkillAfterSelectionRef = useRef<StableId | undefined>(undefined);
  const focusUpgradeAfterPurchaseRef = useRef<StableId | undefined>(undefined);

  function clearPendingAbilities(): void {
    pendingAbilityKeysRef.current.clear();
    setPendingAbilityKeys(new Set());
  }

  function clearPendingTargetPolicies(): void {
    pendingTargetPoliciesRef.current.clear();
    setPendingTargetPolicies(new Map());
  }

  function clearCombatCommandRejections(): void {
    setRejectedAbilityKeys(new Set());
    setRejectedTargetPolicies(new Set());
  }

  const postCurrentWorkerMessage = useCallback(
    (message: unknown, fallbackInspectionMessage: string): boolean => {
      const worker = workerRef.current;
      if (worker === undefined) return false;
      try {
        worker.postMessage(message);
        return true;
      } catch (error) {
        workerFailureRef.current?.(
          error instanceof Error ? error.message : fallbackInspectionMessage
        );
        return false;
      }
    },
    []
  );

  useEffect(
    () => () => {
      if (terminalPresentationTimerRef.current !== undefined)
        window.clearTimeout(terminalPresentationTimerRef.current);
      workerRef.current?.terminate();
      workerRef.current = undefined;
      workerFailureRef.current = undefined;
    },
    []
  );

  useEffect(() => {
    let query: MediaQueryList;
    try {
      query = window.matchMedia("(prefers-reduced-motion: reduce)");
    } catch {
      return;
    }
    const update = (event: MediaQueryListEvent): void =>
      setDeviceReducedMotion(event.matches);
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

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
          "Local progression storage is unavailable. You can still enter Shuttergate."
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
      focusUpgradeAfterPurchaseRef.current = upgradeId;
      setCheckpointProfile({ status: "ready", profile });
      setUpgradePurchaseStatus({
        kind: "success",
        message: `${playerFacingName(upgradeId)} rank purchased. ${profile.forgeOre} Forge Ore remains.`
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
      focusSkillAfterSelectionRef.current = nodeId;
      setCheckpointProfile({ status: "ready", profile });
      setUpgradePurchaseStatus({
        kind: "success",
        message: `${playerFacingName(nodeId)} selected for Iron Warden.`
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
    if (
      initializedRef.current ||
      view.phase !== "checkpoint" ||
      checkpointProfile.status === "loading"
    )
      return;
    const startingProfile =
      checkpointProfile.status === "ready"
        ? checkpointProfile.profile
        : createInitialProfile("character.iron_warden" as StableId);
    const runConfiguration = createRunConfiguration(startingProfile);
    runConfigurationRef.current = runConfiguration;
    runStartingProfileRef.current =
      checkpointProfile.status === "ready" ? startingProfile : undefined;
    latestRenderSnapshotRef.current = undefined;
    terminalPresentationDeadlineRef.current = 0;
    terminalResultPendingRef.current = false;
    if (terminalPresentationTimerRef.current !== undefined) {
      window.clearTimeout(terminalPresentationTimerRef.current);
      terminalPresentationTimerRef.current = undefined;
    }
    initializedRef.current = true;
    latestCombatControlsTickRef.current = -1;
    let worker: Worker;
    try {
      worker = createWorker();
    } catch (error) {
      setView({
        phase: "failure",
        message: expeditionFailureMessage,
        inspectionMessage:
          error instanceof Error ? error.message : "Worker creation failed."
      });
      return;
    }
    workerRef.current = worker;
    const beginTerminalPresentation = (): void => {
      const latestSnapshot = latestRenderSnapshotRef.current;
      terminalPresentationDeadlineRef.current =
        latestSnapshot?.schemaVersion === 2 &&
        latestSnapshot.phase === "terminal"
          ? Date.now() + TERMINAL_PRESENTATION_DURATION_MS
          : 0;
      terminalResultPendingRef.current = true;
    };
    const presentAfterTerminal = (nextView: ViewState): void => {
      const delay = Math.max(
        0,
        terminalPresentationDeadlineRef.current - Date.now()
      );
      if (delay === 0) {
        setView(nextView);
        return;
      }
      terminalPresentationTimerRef.current = window.setTimeout(() => {
        terminalPresentationTimerRef.current = undefined;
        if (workerRef.current === worker) setView(nextView);
      }, delay);
    };
    const failWorker = (inspectionMessage: string): void => {
      if (workerRef.current !== worker) return;
      worker.terminate();
      workerRef.current = undefined;
      workerFailureRef.current = undefined;
      latestCombatControlsTickRef.current = -1;
      clearPendingAbilities();
      clearPendingTargetPolicies();
      clearCombatCommandRejections();
      setCombatControls(undefined);
      setRenderSnapshot(undefined);
      setView({
        phase: "failure",
        message: expeditionFailureMessage,
        inspectionMessage
      });
    };
    workerFailureRef.current = failWorker;
    worker.addEventListener("message", (event: MessageEvent<unknown>) => {
      if (workerRef.current !== worker) return;
      const message = parseWorkerMessage(event.data);
      if (message === undefined) {
        failWorker("Invalid worker response.");
      } else if (message.type === "render_snapshot") {
        latestRenderSnapshotRef.current = message.snapshot;
        setRenderSnapshot(message.snapshot);
      } else if (message.type === "combat_controls") {
        if (
          message.protocolVersion === 4 &&
          message.authoritativeTick < latestCombatControlsTickRef.current
        )
          return;
        if (message.protocolVersion === 4) {
          latestCombatControlsTickRef.current = message.authoritativeTick;
          const acknowledgedRequestIds = new Set(
            message.acknowledgedRequestIds
          );
          for (const [key, pending] of pendingAbilityKeysRef.current) {
            if (
              acknowledgedRequestIds.has(pending.requestId) &&
              pending.submittedAtTick < message.authoritativeTick
            )
              pendingAbilityKeysRef.current.delete(key);
          }
          setPendingAbilityKeys(new Set(pendingAbilityKeysRef.current.keys()));
          for (const [
            dwarfEntityId,
            pending
          ] of pendingTargetPoliciesRef.current) {
            if (
              acknowledgedRequestIds.has(pending.requestId) &&
              pending.submittedAtTick < message.authoritativeTick
            )
              pendingTargetPoliciesRef.current.delete(dwarfEntityId);
          }
          setPendingTargetPolicies(
            new Map(
              [...pendingTargetPoliciesRef.current].map(
                ([dwarfEntityId, pending]) => [dwarfEntityId, pending.policy]
              )
            )
          );
        } else {
          clearPendingAbilities();
          clearPendingTargetPolicies();
        }
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
            postCurrentWorkerMessage(
              {
                protocolVersion: WEB_PROTOCOL_VERSION,
                type: "command",
                requestId: crypto.randomUUID(),
                command: {
                  type: "commitManualResume",
                  resumeRequestId: message.resumeRequestId
                }
              },
              "Worker resume command failed."
            );
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
                  message.protocolVersion !== 1 && message.manualPaused,
                simulationSpeed:
                  message.protocolVersion === 4 ? message.simulationSpeed : 1
              }
        );
      } else if (message.type === "result") {
        if (terminalResultPendingRef.current) return;
        latestCombatControlsTickRef.current = -1;
        clearPendingAbilities();
        clearPendingTargetPolicies();
        clearCombatCommandRejections();
        const startingProfile = runStartingProfileRef.current;
        const store = profileStoreRef.current;
        if (message.protocolVersion !== 4) {
          beginTerminalPresentation();
          presentAfterTerminal({ phase: "result", result: message });
          return;
        }
        const campaign = message.campaign;
        if (campaign === undefined) {
          failWorker(
            "Terminal progression was missing from the active attempt."
          );
          return;
        }
        if (campaign.attemptId !== runConfiguration.attemptId) {
          failWorker("Terminal progression did not match the active attempt.");
          return;
        }
        try {
          validateCheckpointAttemptResult(runConfiguration.profile, campaign);
        } catch {
          failWorker("Terminal progression contradicted the active attempt.");
          return;
        }
        if (startingProfile === undefined || store === undefined) {
          beginTerminalPresentation();
          presentAfterTerminal({ phase: "result", result: message });
          return;
        }
        if (appliedTerminalRewardIdsRef.current.has(campaign.rewardId)) return;
        beginTerminalPresentation();
        appliedTerminalRewardIdsRef.current.add(campaign.rewardId);
        void applyCheckpointAttemptResult(store, startingProfile, campaign)
          .then((profile) => {
            if (workerRef.current !== worker) return;
            setCheckpointProfile({ status: "ready", profile });
            presentAfterTerminal({
              phase: "result",
              result: message,
              savedProfile: profile
            });
          })
          .catch((error) => {
            if (workerRef.current !== worker) return;
            appliedTerminalRewardIdsRef.current.delete(campaign.rewardId);
            presentAfterTerminal({
              phase: "failure",
              message:
                "The battle ended, but its progression was not saved. Return to the checkpoint and retry.",
              inspectionMessage:
                error instanceof Error
                  ? error.message
                  : "Progression save failed."
            });
          });
      } else if (message.code === "command_rejected") {
        const requestId = message.requestId;
        if (requestId === undefined) return;
        for (const [key, pending] of pendingAbilityKeysRef.current) {
          if (pending.requestId !== requestId) continue;
          pendingAbilityKeysRef.current.delete(key);
          setPendingAbilityKeys(new Set(pendingAbilityKeysRef.current.keys()));
          setRejectedAbilityKeys((current) => new Set(current).add(key));
          return;
        }
        for (const [
          dwarfEntityId,
          pending
        ] of pendingTargetPoliciesRef.current) {
          if (pending.requestId !== requestId) continue;
          pendingTargetPoliciesRef.current.delete(dwarfEntityId);
          setPendingTargetPolicies(
            new Map(
              [...pendingTargetPoliciesRef.current].map(([entityId, value]) => [
                entityId,
                value.policy
              ])
            )
          );
          setRejectedTargetPolicies((current) =>
            new Set(current).add(dwarfEntityId)
          );
          return;
        }
      } else {
        failWorker(message.message);
      }
    });
    worker.addEventListener("error", (event) => {
      failWorker(event.message || "Worker error.");
    });
    postCurrentWorkerMessage(
      {
        protocolVersion: WEB_PROTOCOL_VERSION,
        type: "initialize",
        runConfiguration
      },
      "Worker initialization failed."
    );
  }

  function confirmPreparation(): void {
    if (submittedRef.current || view.phase !== "preparation") return;
    submittedRef.current = true;
    postCurrentWorkerMessage(
      {
        protocolVersion: WEB_PROTOCOL_VERSION,
        type: "command",
        requestId: crypto.randomUUID(),
        command: { type: "confirmPreparation" }
      },
      "Worker confirmation command failed."
    );
  }

  function returnToCheckpoint(): void {
    if (view.phase !== "result" && view.phase !== "failure") return;
    workerRef.current?.terminate();
    workerRef.current = undefined;
    workerFailureRef.current = undefined;
    initializedRef.current = false;
    submittedRef.current = false;
    manualPauseRequestedRef.current = undefined;
    runStartingProfileRef.current = undefined;
    latestRenderSnapshotRef.current = undefined;
    terminalPresentationDeadlineRef.current = 0;
    terminalResultPendingRef.current = false;
    if (terminalPresentationTimerRef.current !== undefined) {
      window.clearTimeout(terminalPresentationTimerRef.current);
      terminalPresentationTimerRef.current = undefined;
    }
    latestCombatControlsTickRef.current = -1;
    clearPendingAbilities();
    clearPendingTargetPolicies();
    clearCombatCommandRejections();
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
      postCurrentWorkerMessage(
        {
          protocolVersion: WEB_PROTOCOL_VERSION,
          type: "command",
          requestId: crypto.randomUUID(),
          command: { type: "setManualPause", paused }
        },
        "Worker pause command failed."
      );
    },
    [postCurrentWorkerMessage, view]
  );

  const setSimulationSpeed = useCallback(
    (speed: SimulationSpeed): void => {
      if (view.phase !== "running" || view.simulationSpeed === speed) return;
      postCurrentWorkerMessage(
        {
          protocolVersion: WEB_PROTOCOL_VERSION,
          type: "command",
          requestId: crypto.randomUUID(),
          command: { type: "setSimulationSpeed", speed }
        },
        "Worker combat-speed command failed."
      );
    },
    [postCurrentWorkerMessage, view]
  );

  const setTargetPolicy = useCallback(
    (dwarfEntityId: string, requestedPolicy: TargetPolicy): void => {
      if (view.phase !== "running" || combatControls?.protocolVersion !== 4)
        return;
      const dwarf = combatControls.dwarves.find(
        (candidate) => candidate.entityId === dwarfEntityId
      );
      if (
        !dwarf?.supportedTargetPolicies.includes(requestedPolicy) ||
        pendingTargetPoliciesRef.current.has(dwarfEntityId)
      )
        return;
      const nextPendingTargetPolicies = new Map(
        pendingTargetPoliciesRef.current
      );
      const requestId = crypto.randomUUID();
      setRejectedTargetPolicies((current) => {
        const next = new Set(current);
        next.delete(dwarfEntityId);
        return next;
      });
      nextPendingTargetPolicies.set(dwarfEntityId, {
        policy: requestedPolicy,
        requestId,
        submittedAtTick: latestCombatControlsTickRef.current
      });
      pendingTargetPoliciesRef.current = nextPendingTargetPolicies;
      setPendingTargetPolicies(
        new Map(
          [...nextPendingTargetPolicies].map(([entityId, pending]) => [
            entityId,
            pending.policy
          ])
        )
      );
      postCurrentWorkerMessage(
        {
          protocolVersion: WEB_PROTOCOL_VERSION,
          type: "command",
          requestId,
          command: {
            type: "setTargetPolicy",
            dwarfEntityId,
            requestedPolicy
          }
        },
        "Worker target policy command failed."
      );
    },
    [combatControls, postCurrentWorkerMessage, view]
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
      const requestId = crypto.randomUUID();
      setRejectedAbilityKeys((current) => {
        const next = new Set(current);
        next.delete(pendingKey);
        return next;
      });
      pendingAbilityKeysRef.current.set(pendingKey, {
        requestId,
        submittedAtTick: latestCombatControlsTickRef.current
      });
      setPendingAbilityKeys(new Set(pendingAbilityKeysRef.current.keys()));
      postCurrentWorkerMessage(
        {
          protocolVersion: WEB_PROTOCOL_VERSION,
          type: "command",
          requestId,
          command: { type: "activateAbility", dwarfEntityId, abilityId }
        },
        "Worker ability command failed."
      );
    },
    [combatControls, postCurrentWorkerMessage, view]
  );

  useLayoutEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat || view.phase !== "running") return;
      if (
        event.key === "1" &&
        !event.altKey &&
        !event.ctrlKey &&
        !event.metaKey
      ) {
        const target = event.target;
        if (
          target instanceof HTMLElement &&
          (target.isContentEditable ||
            target.matches("input, select, textarea"))
        )
          return;
        const dwarf = combatControls?.dwarves.find(
          (candidate) => candidate.activeAbilities?.length
        );
        const ability = dwarf?.activeAbilities?.[0];
        if (dwarf === undefined || ability === undefined) return;
        event.preventDefault();
        activateAbility(dwarf.entityId, ability.abilityId);
        return;
      }
      if (event.key !== "Escape") return;
      if (document.querySelector(".target-policy-menu:not([hidden])") !== null)
        return;
      event.preventDefault();
      setManualPause(!(manualPauseRequestedRef.current ?? view.manualPaused));
    };
    const onBackground = () => {
      if (view.phase === "running" && manualPauseRequestedRef.current === false)
        setManualPause(true);
    };
    const onVisibilityChange = () => {
      if (document.hidden) onBackground();
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("blur", onBackground);
    window.addEventListener("pagehide", onBackground);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("blur", onBackground);
      window.removeEventListener("pagehide", onBackground);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [activateAbility, combatControls, view, setManualPause]);

  useLayoutEffect(() => {
    const onCheckpointEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.repeat || view.phase !== "checkpoint")
        return;
      if (recycleConfirmationOpen) {
        if (upgradePurchaseStatus.kind === "pending") return;
        event.preventDefault();
        setRecycleConfirmationOpen(false);
      } else if (skillRecycleConfirmationOpen) {
        if (upgradePurchaseStatus.kind === "pending") return;
        event.preventDefault();
        setSkillRecycleConfirmationOpen(false);
      } else if (upgradeInventoryOpen) {
        if (upgradePurchaseStatus.kind === "pending") return;
        event.preventDefault();
        setUpgradePurchaseStatus({ kind: "idle" });
        setUpgradeInventoryOpen(false);
      } else if (settingsOpen) {
        event.preventDefault();
        setSettingsOpen(false);
      }
    };
    window.addEventListener("keydown", onCheckpointEscape);
    return () => window.removeEventListener("keydown", onCheckpointEscape);
  }, [
    recycleConfirmationOpen,
    settingsOpen,
    skillRecycleConfirmationOpen,
    upgradeInventoryOpen,
    upgradePurchaseStatus.kind,
    view.phase
  ]);

  useLayoutEffect(() => {
    if (view.phase === "result") resultHeadingRef.current?.focus();
    else if (view.phase === "failure") failureHeadingRef.current?.focus();
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
      (recycleButtonRef.current ?? upgradeInventoryHeadingRef.current)?.focus();
    recycleConfirmationWasOpenRef.current = recycleConfirmationOpen;
  }, [recycleConfirmationOpen]);

  useLayoutEffect(() => {
    if (skillRecycleConfirmationOpen) skillRecycleHeadingRef.current?.focus();
    else if (skillRecycleConfirmationWasOpenRef.current)
      (skillRecycleButtonRef.current ?? skillTreeHeadingRef.current)?.focus();
    skillRecycleConfirmationWasOpenRef.current = skillRecycleConfirmationOpen;
  }, [skillRecycleConfirmationOpen]);

  useLayoutEffect(() => {
    if (upgradePurchaseStatus.kind !== "pending") return;
    if (recycleConfirmationOpen) recycleHeadingRef.current?.focus();
    else if (skillRecycleConfirmationOpen)
      skillRecycleHeadingRef.current?.focus();
  }, [
    recycleConfirmationOpen,
    skillRecycleConfirmationOpen,
    upgradePurchaseStatus.kind
  ]);

  useLayoutEffect(() => {
    const heading = recycleConfirmationOpen
      ? recycleHeadingRef.current
      : skillRecycleConfirmationOpen
        ? skillRecycleHeadingRef.current
        : null;
    const dialog = heading?.parentElement;
    if (dialog === undefined || dialog === null) return;
    return isolateDialogFromSiblings(dialog);
  }, [recycleConfirmationOpen, skillRecycleConfirmationOpen]);

  useLayoutEffect(() => {
    const upgradeId = focusUpgradeAfterPurchaseRef.current;
    if (upgradeId === undefined) return;
    focusUpgradeAfterPurchaseRef.current = undefined;
    document
      .getElementById(`${upgradeId.replaceAll(".", "-")}-heading`)
      ?.focus();
  });

  useLayoutEffect(() => {
    const nodeId = focusSkillAfterSelectionRef.current;
    if (nodeId === undefined) return;
    focusSkillAfterSelectionRef.current = undefined;
    document
      .getElementById(`${nodeId.replaceAll(".", "-")}-selected-heading`)
      ?.focus();
  });

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
  const shellView =
    view.phase === "checkpoint"
      ? settingsOpen
        ? "settings"
        : upgradeInventoryOpen
          ? "forge"
          : "checkpoint"
      : view.phase;
  const inspectionEnabled =
    new URLSearchParams(window.location.search).get("inspection") === "1";

  return (
    <main
      aria-labelledby="app-heading"
      data-contrast-preference={contrastPreference}
      data-motion-preference={motionPreference}
      data-sound-preference={soundPreference}
      data-text-scale={textScale}
      data-view-phase={view.phase}
      data-shell-view={shellView}
    >
      <header className="game-masthead">
        <p className="eyebrow">The Company Muster</p>
        <h1 id="app-heading">Dwarven Depths</h1>
        <p className="masthead-subtitle">
          Hold the ancient roads below the mountain.
        </p>
      </header>
      <section className="panel" aria-labelledby="run-heading">
        <h2 id="run-heading">Shuttergate Hall</h2>
        <details className="inspection-surface" hidden={!inspectionEnabled}>
          <summary>Developer inspection</summary>
          <RunJourneyGuide phase={view.phase} />
          {view.phase === "preparation" && (
            <p className="inspection-metadata">Level ID: {view.levelId}</p>
          )}
        </details>
        {(view.phase === "checkpoint" ||
          view.phase === "result" ||
          view.phase === "failure") && (
          <div
            className="checkpoint-backdrop"
            style={{ backgroundImage: `url(${checkpointBackdropUrl})` }}
            aria-hidden="true"
          />
        )}
        {view.phase === "checkpoint" &&
          !settingsOpen &&
          !upgradeInventoryOpen && (
            <>
              <div className="checkpoint-command">
                <p className="checkpoint-kicker">Company Muster</p>
                <h3>Shuttergate Hall</h3>
                <p className="checkpoint-readiness">
                  The road is clear. Muster the company.
                </p>
                <button
                  className="primary-action"
                  type="button"
                  disabled={checkpointProfile.status === "loading"}
                  onClick={startPreparation}
                >
                  Begin preparation
                </button>
              </div>
              <nav className="checkpoint-menu" aria-label="Company checkpoint">
                <div className="checkpoint-menu-current" aria-current="page">
                  <span>Company</span>
                  <small>Muster ready</small>
                </div>
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
                <button
                  type="button"
                  ref={settingsButtonRef}
                  onClick={() => setSettingsOpen(true)}
                >
                  Settings
                </button>
              </nav>
              <section
                className="profile-summary"
                aria-labelledby="profile-summary-heading"
              >
                <h3 id="profile-summary-heading">Company roster</h3>
                {checkpointProfile.status === "loading" && (
                  <p>Loading local progression…</p>
                )}
                {checkpointProfile.status === "unavailable" && (
                  <p>{checkpointProfile.message}</p>
                )}
                {checkpointProfile.status === "ready" && (
                  <>
                    <div className="warden-portrait">
                      <img src={ironWardenPortraitUrl} alt="" />
                      <div>
                        <strong>Iron Warden</strong>
                        <span>Ready</span>
                      </div>
                    </div>
                    <dl>
                      <div className="profile-summary-row">
                        <dt>Forge Ore</dt>
                        <dd className="profile-summary-value">
                          {checkpointProfile.profile.forgeOre}
                        </dd>
                      </div>
                      <div className="profile-summary-row">
                        <dt>Company strength</dt>
                        <dd className="profile-summary-value">
                          {
                            checkpointProfile.profile.unlockedCharacterIds
                              .length
                          }
                        </dd>
                      </div>
                    </dl>
                  </>
                )}
              </section>
            </>
          )}
        {renderSnapshot !== undefined && view.phase === "running" && (
          <section
            className="active-combat-screen"
            aria-label="Shuttergate active combat"
          >
            <Battlefield
              snapshot={renderSnapshot}
              simulationSpeed={view.simulationSpeed}
              reduceMotion={
                motionPreference === "reduce" ||
                (motionPreference === "device" && deviceReducedMotion)
              }
              soundEnabled={soundPreference === "on"}
            />
            <div className="combat-top-overlay">
              <CombatHud
                snapshot={renderSnapshot}
                manualPaused={view.manualPaused}
              />
            </div>
            {combatControls !== undefined && (
              <div className="combat-bottom-overlay">
                <CombatControls
                  dwarves={combatControls.dwarves}
                  currentTick={renderSnapshot.tick}
                  selectedDwarfHealth={
                    renderSnapshot.schemaVersion === 2
                      ? (() => {
                          const warden = renderSnapshot.entities.find(
                            (entity) => entity.faction === "dwarf"
                          );
                          return warden === undefined
                            ? undefined
                            : {
                                current: warden.currentHealth,
                                maximum: warden.maximumHealth
                              };
                        })()
                      : undefined
                  }
                  pendingAbilityKeys={pendingAbilityKeys}
                  pendingTargetPolicies={pendingTargetPolicies}
                  rejectedAbilityKeys={rejectedAbilityKeys}
                  rejectedTargetPolicies={rejectedTargetPolicies}
                  onSetTargetPolicy={setTargetPolicy}
                  onActivateAbility={activateAbility}
                />
              </div>
            )}
            <button
              className="combat-pause"
              type="button"
              aria-label={view.manualPaused ? "Resume combat" : "Pause combat"}
              aria-pressed={view.manualPaused}
              onClick={() => setManualPause(!view.manualPaused)}
            >
              <span aria-hidden="true">{view.manualPaused ? "▶" : "Ⅱ"}</span>
            </button>
            <fieldset className="combat-speed">
              <legend className="visually-hidden">Combat speed</legend>
              {([1, 2] as const).map((speed) => (
                <button
                  key={speed}
                  type="button"
                  aria-label={`${speed}× combat speed`}
                  aria-pressed={view.simulationSpeed === speed}
                  disabled={view.simulationSpeed === speed}
                  onClick={() => setSimulationSpeed(speed)}
                >
                  {speed}×
                </button>
              ))}
            </fieldset>
            {view.manualPaused && (
              <div className="combat-pause-banner" role="status">
                <strong>Combat paused</strong>
                <span>Press Escape or resume when ready</span>
              </div>
            )}
          </section>
        )}
        {renderSnapshot !== undefined && view.phase !== "running" && (
          <Battlefield
            snapshot={renderSnapshot}
            reduceMotion={
              motionPreference === "reduce" ||
              (motionPreference === "device" && deviceReducedMotion)
            }
            soundEnabled={soundPreference === "on"}
          />
        )}
        {renderSnapshot !== undefined &&
          renderSnapshot.phase === "terminal" && (
            <CombatHud snapshot={renderSnapshot} />
          )}
        {view.phase === "preparation" && (
          <dl className="preparation-summary" aria-label="Preparation summary">
            <div>
              <dt>Defence</dt>
              <dd>Shuttergate Hall</dd>
            </div>
            <div>
              <dt>Company roster</dt>
              <dd>
                {view.deployableEntityCount === 0
                  ? "Empty — no dwarves require placement"
                  : view.deployableEntityCount === 1
                    ? "1 dwarf"
                    : `${view.deployableEntityCount} dwarves`}
              </dd>
            </div>
            <div>
              <dt>Deployment</dt>
              <dd>Fixed tutorial guard post</dd>
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
                : "Combat is underway…"}
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
            role="dialog"
            aria-modal="true"
            aria-labelledby="presentation-settings-heading"
            onKeyDown={containPanelFocus}
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
            <label htmlFor="sound-preference">Sound effects</label>
            <select
              id="sound-preference"
              value={soundPreference}
              onChange={(event) => {
                const preference = event.currentTarget.value;
                if (!isSoundPreference(preference)) return;
                setSoundPreference(preference);
                storeSoundPreference(preference);
              }}
            >
              <option value="off">Off</option>
              <option value="on">On</option>
            </select>
            <p className="settings-help">
              These preferences affect presentation only and never change the
              expedition outcome. Sound is off until you opt in.
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
              role="dialog"
              aria-modal={
                !recycleConfirmationOpen && !skillRecycleConfirmationOpen
              }
              aria-labelledby="upgrade-inventory-heading"
              onKeyDown={
                recycleConfirmationOpen || skillRecycleConfirmationOpen
                  ? undefined
                  : containPanelFocus
              }
            >
              <h3
                id="upgrade-inventory-heading"
                ref={upgradeInventoryHeadingRef}
                tabIndex={-1}
              >
                Ancestral Forge
              </h3>
              <button
                className="primary-action forge-return"
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
              <p>Available Forge Ore: {checkpointProfile.profile.forgeOre}</p>
              {checkpointProfile.profile.purchasedUpgrades.length === 0 ? (
                <p>No upgrades purchased.</p>
              ) : (
                <dl className="upgrade-inventory-list">
                  {checkpointProfile.profile.purchasedUpgrades.map(
                    (upgrade) => (
                      <div key={upgrade.upgradeId}>
                        <dt>{playerFacingName(upgrade.upgradeId)}</dt>
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
                  const headingId = `${definition.upgradeId.replaceAll(".", "-")}-heading`;
                  const descriptionId = `${definition.upgradeId.replaceAll(".", "-")}-purchase-status`;
                  const effectsId = `${definition.upgradeId.replaceAll(".", "-")}-effects`;
                  const pending =
                    upgradePurchaseStatus.kind === "pending" &&
                    upgradePurchaseStatus.upgradeId === definition.upgradeId;
                  return (
                    <section key={definition.upgradeId}>
                      <h5 id={headingId} tabIndex={-1}>
                        {playerFacingName(definition.upgradeId)}
                      </h5>
                      <p>
                        Rank {state.currentRank} of{" "}
                        {definition.rankCosts.length}
                      </p>
                      <p id={descriptionId}>
                        {state.unavailableReason ??
                          `Next rank costs ${state.nextCost} Forge Ore.`}
                      </p>
                      <div id={effectsId}>
                        {state.currentRank === 0 ? (
                          <p>Owned effects: none.</p>
                        ) : (
                          <>
                            <p>Owned effects:</p>
                            <ul>
                              {definition.passiveEffectsByRank
                                .slice(0, state.currentRank)
                                .map((effects, rankIndex) => (
                                  <li
                                    key={`${definition.upgradeId}-rank-${definition.passiveEffectsByRank.indexOf(effects) + 1}`}
                                  >
                                    Rank {rankIndex + 1}:{" "}
                                    {describeEffects(effects)}
                                  </li>
                                ))}
                            </ul>
                          </>
                        )}
                        {state.nextCost === undefined ? (
                          <p>No further rank effects.</p>
                        ) : (
                          <p>
                            Rank {state.currentRank + 1} effects:{" "}
                            {describeEffects(
                              definition.passiveEffectsByRank[
                                state.currentRank
                              ] ?? []
                            )}
                          </p>
                        )}
                      </div>
                      <button
                        type="button"
                        aria-describedby={`${descriptionId} ${effectsId}`}
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
                          <section
                            aria-labelledby={`${selection.nodeId.replaceAll(".", "-")}-selected-heading`}
                          >
                            <h5
                              id={`${selection.nodeId.replaceAll(".", "-")}-selected-heading`}
                              tabIndex={-1}
                            >
                              {playerFacingName(selection.nodeId)} selected at
                              level {selection.spentSkillPointLevel}.
                            </h5>{" "}
                            <p>
                              Effects:{" "}
                              {describeEffects(
                                ironWardenSkillTree.nodes.find(
                                  (node) => node.nodeId === selection.nodeId
                                )?.effects ?? []
                              )}{" "}
                              Prerequisites:{" "}
                              {describePrerequisites(
                                ironWardenSkillTree.nodes.find(
                                  (node) => node.nodeId === selection.nodeId
                                )?.prerequisiteNodeIds ?? []
                              )}
                            </p>
                          </section>
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
                        (nodeId) => {
                          const node = ironWardenSkillTree.nodes.find(
                            (candidate) => candidate.nodeId === nodeId
                          );
                          const effectsId = `${nodeId.replaceAll(".", "-")}-effects`;
                          return (
                            <section key={nodeId}>
                              <p id={effectsId}>
                                Effects: {describeEffects(node?.effects ?? [])}{" "}
                                Prerequisites:{" "}
                                {describePrerequisites(
                                  node?.prerequisiteNodeIds ?? []
                                )}
                              </p>
                              <button
                                type="button"
                                aria-describedby={effectsId}
                                disabled={
                                  upgradePurchaseStatus.kind === "pending"
                                }
                                onClick={() =>
                                  void selectIronWardenSkill(nodeId)
                                }
                              >
                                {upgradePurchaseStatus.kind === "pending" &&
                                upgradePurchaseStatus.upgradeId === nodeId
                                  ? "Saving skill selection…"
                                  : `Select ${playerFacingName(nodeId)}`}
                              </button>
                            </section>
                          );
                        }
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
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby="recycle-confirmation-heading"
                  onKeyDown={containPanelFocus}
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
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby="skill-recycle-confirmation-heading"
                  onKeyDown={containPanelFocus}
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
            </section>
          )}

        {view.phase === "preparation" && (
          <button
            className="preparation-confirm primary-action"
            type="button"
            onClick={confirmPreparation}
          >
            Confirm preparation
          </button>
        )}
        {view.phase === "running" && renderSnapshot === undefined && (
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
            <p className="result-message">
              {view.result.terminalResult === "victory"
                ? "Shuttergate stands. The company returns to the forge."
                : "Shuttergate has fallen. Rally the company and return stronger."}
            </p>
            {view.result.protocolVersion === 4 &&
              view.result.campaign !== undefined && (
                <p className="result-reward">
                  Forge award: {view.result.campaign.forgeOreAwarded} ore.
                  Company balance:{" "}
                  {(view.savedProfile ?? view.result.campaign.profile).forgeOre}{" "}
                  Forge Ore.
                </p>
              )}
            <div className="result-actions">
              <button type="button" onClick={returnToCheckpoint}>
                Return to checkpoint
              </button>
            </div>
            <details
              className="inspection-surface result-inspection"
              hidden={!inspectionEnabled}
            >
              <summary>Developer inspection</summary>
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
              <button
                type="button"
                onClick={() =>
                  void downloadRunEvidence(
                    view.result,
                    runConfigurationRef.current
                  )
                }
              >
                Download run evidence
              </button>
            </details>
          </section>
        )}
        {view.phase === "failure" && (
          <section className="results" aria-labelledby="failure-heading">
            <h3 id="failure-heading" ref={failureHeadingRef} tabIndex={-1}>
              Run failed
            </h3>
            <p>{view.message}</p>
            <div className="result-actions">
              <button type="button" onClick={returnToCheckpoint}>
                Return to checkpoint
              </button>
            </div>
            {inspectionEnabled && view.inspectionMessage !== undefined && (
              <details className="inspection-surface failure-inspection">
                <summary>Developer inspection</summary>
                <p>{view.inspectionMessage}</p>
              </details>
            )}
          </section>
        )}
      </section>
    </main>
  );
}
