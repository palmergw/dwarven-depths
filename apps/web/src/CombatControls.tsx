import type { CombatControlDwarf } from "./protocol.js";

export interface CombatControlsProps {
  readonly dwarves: readonly CombatControlDwarf[];
}

export function CombatControls({ dwarves }: CombatControlsProps) {
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
        <ul>
          {dwarves.map((dwarf) => (
            <li key={dwarf.entityId}>
              <code>{dwarf.entityId}</code>:{" "}
              {dwarf.supportedTargetPolicies.length} target policies,{" "}
              {dwarf.abilityIds.length} abilities
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
