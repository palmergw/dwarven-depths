import type { RenderSnapshot } from "./render-snapshot.js";

interface CombatHudProps {
  readonly snapshot: RenderSnapshot;
}

export function CombatHud({ snapshot }: CombatHudProps) {
  const alliedDwarves = snapshot.entities.filter(
    (entity) => entity.faction === "dwarf"
  ).length;
  const hostileEnemies = snapshot.entities.filter(
    (entity) => entity.faction === "enemy"
  ).length;

  return (
    <section className="combat-hud" aria-labelledby="combat-hud-heading">
      <h3 id="combat-hud-heading">Combat status</h3>
      <dl aria-label="Combat status">
        <div>
          <dt>Shuttergate</dt>
          <dd>
            {snapshot.phase === "running"
              ? "The gate is contested"
              : "The battle is decided"}
          </dd>
        </div>
        <div>
          <dt>Allied dwarves</dt>
          <dd>{alliedDwarves}</dd>
        </div>
        <div>
          <dt>Hostile enemies</dt>
          <dd>{hostileEnemies}</dd>
        </div>
      </dl>
    </section>
  );
}
