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
      <h2 id="combat-hud-heading" className="visually-hidden">
        The Shuttergate
      </h2>

      <dl aria-label="Authoritative combat status">
        <div
          className="hud-count hud-plaque hud-plaque-left"
          data-faction="dwarf"
        >
          <dt>Warden</dt>
          <dd>{alliedDwarves}</dd>
        </div>
        <div className="hud-plaque hud-plaque-center">
          <dt>Wave</dt>
          <dd>1 / 5</dd>
        </div>
        <div
          className="hud-count hud-plaque hud-plaque-right"
          data-faction="enemy"
        >
          <dt>Hostiles</dt>
          <dd>{hostileEnemies}</dd>
        </div>
      </dl>
      <p className="visually-hidden">
        Combat {manualPaused ? "paused" : "active"}
      </p>
    </section>
  );
}
