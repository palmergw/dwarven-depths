import type { CombatControlDwarf, TargetPolicy } from "./protocol.js";

const TARGET_POLICY_LABELS: Readonly<Record<TargetPolicy, string>> = {
  nearest: "Nearest",
  lowest_health: "Lowest health",
  highest_health: "Highest health",
  highest_armor: "Highest armor",
  fastest: "Fastest",
  boss_or_elite_first: "Boss or elite first"
};

interface CombatControlsProps {
  readonly dwarves: readonly CombatControlDwarf[];
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
  onSetTargetPolicy,
  onActivateAbility
}: CombatControlsProps) {
  return (
    <section
      className="combat-controls"
      aria-labelledby="combat-controls-heading"
    >
      <h3 id="combat-controls-heading">Combat controls</h3>
      {dwarves.length === 0 ? (
        <p>
          Target policies and abilities are unavailable because no dwarves are
          deployed.
        </p>
      ) : (
        dwarves.map((dwarf) => (
          <fieldset key={dwarf.entityId}>
            <legend>{dwarf.characterId}</legend>
            <p className="control-entity-id">{dwarf.entityId}</p>
            {dwarf.supportedTargetPolicies.map((policy) => (
              <button
                key={policy}
                type="button"
                onClick={() => onSetTargetPolicy(dwarf.entityId, policy)}
              >
                {TARGET_POLICY_LABELS[policy]}
              </button>
            ))}
            {(dwarf.activeAbilities ?? []).map((ability) => {
              const feedbackId = `${dwarf.entityId}-${ability.abilityId}-feedback`;
              const disabled =
                ability.cooldownCompleteAtTick !== null ||
                ability.rejectionReason !== null;
              return (
                <span key={ability.abilityId}>
                  <button
                    type="button"
                    disabled={disabled}
                    aria-describedby={feedbackId}
                    onClick={() =>
                      onActivateAbility?.(dwarf.entityId, ability.abilityId)
                    }
                  >
                    Shield Slam
                  </button>
                  <span id={feedbackId} role="status">
                    {ability.rejectionReason ??
                      (ability.cooldownCompleteAtTick === null
                        ? "Ready"
                        : `Cooldown until tick ${ability.cooldownCompleteAtTick}`)}
                  </span>
                </span>
              );
            })}
          </fieldset>
        ))
      )}
    </section>
  );
}
