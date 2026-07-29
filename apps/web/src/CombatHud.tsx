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
      <h3 id="combat-hud-heading">Shuttergate Company</h3>
      <dl aria-label="Combat status">
        <div>
          <dt>Gate</dt>
          <dd>
            {snapshot.phase === "running" ? "Under attack" : "Battle resolved"}
          </dd>
        </div>
        <div>
          <dt>Wardens</dt>
          <dd>{alliedDwarves}</dd>
        </div>
        <div>
          <dt>Threats</dt>
          <dd>{hostileEnemies}</dd>
        </div>
      </dl>
    </section>
  );
}
