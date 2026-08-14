import { useEffect, useState } from "react";
import type { CombatControlDwarf, TargetPolicy } from "./protocol.js";

const TARGET_POLICY_LABELS: Readonly<Record<TargetPolicy, string>> = {
  nearest: "Nearest",
  lowest_health: "Lowest health",
  highest_health: "Highest health",
  highest_armor: "Highest armor",
  fastest: "Fastest",
  boss_or_elite_first: "Boss or elite first"
};

const ABILITY_REJECTION_LABELS: Readonly<Record<string, string>> = {
  ability_committed: "Activation committed",
  duplicate_ability_command: "Activation already queued",
  owner_unavailable: "Iron Warden unavailable",
  owner_downed: "Iron Warden is down",
  ability_unsupported: "Ability unavailable for Iron Warden",
  phase_unavailable: "Available during combat",
  target_or_facing_unavailable: "No valid target",
  no_valid_target: "No valid target",
  cooldown_active: "Recharging",
  committed_action_conflict: "Finish current action first"
};

function abilityRejectionLabel(reason: string): string {
  return ABILITY_REJECTION_LABELS[reason] ?? "Ability unavailable";
}

const wardenPortraitUrl = new URL(
  "../../../assets/game-art/production-scene/exports/hud/warden-portrait.png",
  import.meta.url
).href;
const shieldSlamIconUrl = new URL(
  "../../../assets/game-art/visual-direction/exports/hud/ability-shield-slam.png",
  import.meta.url
).href;

const ABILITY_PRESENTATION: Readonly<
  Record<
    string,
    { readonly label: string; readonly key: string; readonly rune: string }
  >
> = {
  "ability.iron_warden.linebreaker": {
    label: "Linebreaker",
    key: "2",
    rune: "⚒"
  },
  "ability.iron_warden.rallying_roar": {
    label: "Rallying Roar",
    key: "3",
    rune: "◆"
  },
  "ability.iron_warden.shield_slam": {
    label: "Shield Slam",
    key: "1",
    rune: ""
  }
};

interface CombatControlsProps {
  readonly dwarves: readonly CombatControlDwarf[];
  readonly pendingAbilityKeys?: ReadonlySet<string>;
  readonly pendingTargetPolicies?: ReadonlyMap<string, TargetPolicy>;
  readonly rejectedAbilityKeys?: ReadonlySet<string>;
  readonly rejectedTargetPolicies?: ReadonlySet<string>;
  readonly currentTick?: number;
  readonly selectedDwarfHealth?:
    | {
        readonly current: number;
        readonly maximum: number;
      }
    | undefined;
  readonly onSetTargetPolicy: (
    dwarfEntityId: string,
    requestedPolicy: TargetPolicy
  ) => void;
  readonly onActivateAbility?: (
    dwarfEntityId: string,
    abilityId: string
  ) => void;
}

export function CombatControls({
  dwarves,
  pendingAbilityKeys = new Set(),
  pendingTargetPolicies = new Map(),
  rejectedAbilityKeys = new Set(),
  rejectedTargetPolicies = new Set(),
  currentTick = 0,
  selectedDwarfHealth,
  onSetTargetPolicy,
  onActivateAbility
}: CombatControlsProps) {
  const [openTargetingFor, setOpenTargetingFor] = useState<string>();

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || openTargetingFor === undefined) return;
      event.preventDefault();
      event.stopPropagation();
      setOpenTargetingFor(undefined);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [openTargetingFor]);

  return (
    <section
      className="combat-controls"
      aria-labelledby="combat-controls-heading"
    >
      <h3 id="combat-controls-heading" className="visually-hidden">
        Combat controls
      </h3>
      {dwarves.length === 0 ? (
        <p className="combat-controls-unavailable">
          Target policies and abilities are unavailable because no dwarves are
          deployed.
        </p>
      ) : (
        <ul className="character-dock" aria-label="Deployed dwarves">
          {dwarves.map((dwarf, index) => {
            const menuId = `target-policy-menu-${index}`;
            const menuHeadingId = `${menuId}-heading`;
            const menuOpen = openTargetingFor === dwarf.entityId;
            const pendingPolicy = pendingTargetPolicies.get(dwarf.entityId);
            const currentPolicy =
              dwarf.currentTargetPolicy ??
              dwarf.supportedTargetPolicies[0] ??
              "nearest";
            const selectedPolicy = pendingPolicy ?? currentPolicy;
            return (
              <li key={dwarf.entityId}>
                <fieldset
                  className="character-controls"
                  data-entity-id={dwarf.entityId}
                >
                  <legend className="visually-hidden">Iron Warden</legend>
                  <div className="character-portrait-cluster">
                    <button
                      className="character-portrait-button"
                      type="button"
                      disabled={pendingPolicy !== undefined}
                      aria-label="Open Iron Warden targeting"
                      aria-expanded={menuOpen}
                      aria-controls={menuId}
                      onClick={() =>
                        setOpenTargetingFor(
                          menuOpen ? undefined : dwarf.entityId
                        )
                      }
                    >
                      <img src={wardenPortraitUrl} alt="" aria-hidden="true" />
                      <span
                        className="character-selection-rune"
                        aria-hidden="true"
                      >
                        ◆
                      </span>
                    </button>
                    <div className="character-nameplate">
                      <strong>Iron Warden</strong>
                      <span className="target-policy-label">
                        {pendingPolicy !== undefined
                          ? TARGET_POLICY_LABELS[pendingPolicy]
                          : rejectedTargetPolicies.has(dwarf.entityId)
                            ? "Change rejected — try again"
                            : TARGET_POLICY_LABELS[currentPolicy]}
                      </span>
                      {selectedDwarfHealth !== undefined && (
                        <>
                          <meter
                            className="warden-health-track"
                            data-low-health={
                              selectedDwarfHealth.current /
                                selectedDwarfHealth.maximum <=
                              0.3
                            }
                            aria-label="Iron Warden health"
                            min={0}
                            max={selectedDwarfHealth.maximum}
                            value={selectedDwarfHealth.current}
                          />
                          <span className="warden-health-value">
                            {selectedDwarfHealth.current} /{" "}
                            {selectedDwarfHealth.maximum}
                          </span>
                        </>
                      )}
                    </div>
                    <div
                      id={menuId}
                      className="target-policy-menu"
                      hidden={!menuOpen}
                      role="dialog"
                      aria-labelledby={menuHeadingId}
                    >
                      <p id={menuHeadingId}>Target priority</p>
                      <div className="target-policy-controls">
                        {dwarf.supportedTargetPolicies.map((policy) => (
                          <button
                            key={policy}
                            type="button"
                            aria-pressed={selectedPolicy === policy}
                            onClick={() => {
                              onSetTargetPolicy(dwarf.entityId, policy);
                              setOpenTargetingFor(undefined);
                            }}
                          >
                            {TARGET_POLICY_LABELS[policy]}
                            {selectedPolicy === policy ? " ✓" : ""}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className="ability-rack">
                    <span className="visually-hidden">
                      Iron Warden abilities
                    </span>
                    {(dwarf.activeAbilities ?? []).map((ability) => {
                      const presentation = ABILITY_PRESENTATION[
                        ability.abilityId
                      ] ?? {
                        label: "Iron Warden ability",
                        key: "?",
                        rune: "◆"
                      };
                      const feedbackId = `${dwarf.entityId}-${ability.abilityId}-feedback`;
                      const pending = pendingAbilityKeys.has(
                        `${dwarf.entityId}\u0000${ability.abilityId}`
                      );
                      const commandRejected = rejectedAbilityKeys.has(
                        `${dwarf.entityId}\u0000${ability.abilityId}`
                      );
                      const disabled =
                        pending ||
                        ability.cooldownCompleteAtTick !== null ||
                        ability.rejectionReason !== null;
                      const cooldownTicks =
                        ability.cooldownCompleteAtTick === null
                          ? null
                          : Math.max(
                              0,
                              ability.cooldownCompleteAtTick - currentTick
                            );
                      const state = pending
                        ? "queued"
                        : ability.rejectionReason !== null
                          ? "unavailable"
                          : commandRejected
                            ? "rejected"
                            : cooldownTicks === null
                              ? "ready"
                              : "cooldown";
                      return (
                        <div
                          className="ability-control"
                          key={ability.abilityId}
                          data-ability-state={state}
                        >
                          <button
                            className="ability-slot"
                            type="button"
                            disabled={disabled}
                            aria-describedby={feedbackId}
                            aria-label={presentation.label}
                            onClick={() =>
                              onActivateAbility?.(
                                dwarf.entityId,
                                ability.abilityId
                              )
                            }
                          >
                            <span className="visually-hidden">
                              {presentation.label}
                            </span>
                            {ability.abilityId ===
                            "ability.iron_warden.shield_slam" ? (
                              <img
                                src={shieldSlamIconUrl}
                                alt=""
                                aria-hidden="true"
                              />
                            ) : (
                              <span className="ability-rune" aria-hidden="true">
                                {presentation.rune}
                              </span>
                            )}
                            <span className="ability-key" aria-hidden="true">
                              {presentation.key}
                            </span>
                          </button>
                          <span
                            id={feedbackId}
                            className="ability-state"
                            role="status"
                            data-cooldown-complete-at-tick={
                              ability.cooldownCompleteAtTick ?? undefined
                            }
                          >
                            {pending
                              ? "Activation queued"
                              : ability.rejectionReason !== null
                                ? abilityRejectionLabel(ability.rejectionReason)
                                : commandRejected
                                  ? "Activation rejected — try again"
                                  : cooldownTicks === null
                                    ? "Ready"
                                    : `Recharging · ${cooldownTicks} ticks`}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </fieldset>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
