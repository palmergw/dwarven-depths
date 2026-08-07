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

const wardenPortraitUrl = new URL(
  "../../../assets/game-art/production-scene/exports/hud/warden-portrait.png",
  import.meta.url
).href;
const shieldSlamIconUrl = new URL(
  "../../../assets/game-art/visual-direction/exports/hud/ability-shield-slam.png",
  import.meta.url
).href;

interface CombatControlsProps {
  readonly dwarves: readonly CombatControlDwarf[];
  readonly pendingAbilityKeys?: ReadonlySet<string>;
  readonly pendingTargetPolicies?: ReadonlyMap<string, TargetPolicy>;
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
  currentTick = 0,
  selectedDwarfHealth,
  onSetTargetPolicy,
  onActivateAbility
}: CombatControlsProps) {
  const [openTargetingFor, setOpenTargetingFor] = useState<string>();

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpenTargetingFor(undefined);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, []);

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
            const selectedPolicy = pendingTargetPolicies.get(dwarf.entityId);
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
                        {selectedPolicy
                          ? TARGET_POLICY_LABELS[selectedPolicy]
                          : "Targeting"}
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
                      const feedbackId = `${dwarf.entityId}-${ability.abilityId}-feedback`;
                      const pending = pendingAbilityKeys.has(
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
                            aria-label="Shield Slam"
                            onClick={() =>
                              onActivateAbility?.(
                                dwarf.entityId,
                                ability.abilityId
                              )
                            }
                          >
                            <span className="visually-hidden">Shield Slam</span>
                            <img
                              src={shieldSlamIconUrl}
                              alt=""
                              aria-hidden="true"
                            />
                            <span className="ability-key" aria-hidden="true">
                              1
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
                                ? ability.rejectionReason ===
                                  "phase_unavailable"
                                  ? "Available during combat"
                                  : "No valid target"
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
