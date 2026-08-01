import type { RenderSnapshot } from "./render-snapshot.js";

interface CombatHudProps {
  readonly snapshot: RenderSnapshot;
  readonly manualPaused?: boolean;
}

export function CombatHud({ snapshot, manualPaused = false }: CombatHudProps) {
  const alliedDwarves = snapshot.entities.filter(
    (entity) => entity.faction === "dwarf"
  ).length;
  const hostileEnemies = snapshot.entities.filter(
    (entity) => entity.faction === "enemy"
  ).length;

  return (
    <section
      className="combat-hud"
      aria-labelledby="combat-hud-heading"
      data-authoritative-tick={snapshot.tick}
    >
      <div className="combat-hud-title">
        <p className="combat-hud-kicker">Tutorial encounter</p>
        <h2 id="combat-hud-heading">The Shuttergate</h2>
      </div>
      <dl aria-label="Authoritative combat status">
        <div>
          <dt>Wave</dt>
          <dd>1 / 5</dd>
        </div>
        <div className="hud-count" data-faction="dwarf">
          <dt>Warden</dt>
          <dd>{alliedDwarves}</dd>
        </div>
        <div className="hud-count" data-faction="enemy">
          <dt>Hostiles</dt>
          <dd>{hostileEnemies}</dd>
        </div>
        <div>
          <dt>Combat</dt>
          <dd>{manualPaused ? "Paused" : "Active"}</dd>
        </div>
      </dl>
    </section>
  );
}
