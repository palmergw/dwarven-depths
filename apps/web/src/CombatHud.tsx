import type { RenderSnapshot } from "./render-snapshot.js";

const topHudFrameUrl = new URL(
  "../../../assets/game-art/production-scene/exports/hud/top-hud-frame.png",
  import.meta.url
).href;

function healthState(snapshot: RenderSnapshot): {
  readonly current: number;
  readonly maximum: number;
  readonly percentage: number;
} | null {
  if (snapshot.schemaVersion !== 2) return null;
  const warden = snapshot.entities.find((entity) => entity.faction === "dwarf");
  if (warden === undefined) return null;
  return {
    current: warden.currentHealth,
    maximum: warden.maximumHealth,
    percentage: Math.max(
      0,
      Math.min(100, (warden.currentHealth / warden.maximumHealth) * 100)
    )
  };
}

function encounterState(snapshot: RenderSnapshot): {
  readonly wave: string;
  readonly hostiles: number;
  readonly pending: number;
  readonly fortress: string;
} {
  if (snapshot.schemaVersion !== 2) {
    return {
      wave: "Approaching",
      hostiles: snapshot.entities.filter((entity) => entity.faction === "enemy")
        .length,
      pending: 0,
      fortress: snapshot.phase === "terminal" ? "Resolved" : "Holding"
    };
  }
  const activeWaveIndex =
    snapshot.encounter.activeWaveId === null
      ? -1
      : snapshot.encounter.startedWaveIds.indexOf(
          snapshot.encounter.activeWaveId
        );
  return {
    wave:
      activeWaveIndex >= 0
        ? `${activeWaveIndex + 1} of ${snapshot.encounter.startedWaveIds.length}`
        : snapshot.encounter.terminalResult === null
          ? "Approaching"
          : "Complete",
    hostiles: snapshot.encounter.livingHostileCount,
    pending: snapshot.encounter.pendingSpawnCount,
    fortress:
      snapshot.encounter.terminalResult === "defeat"
        ? "Fallen"
        : snapshot.encounter.terminalResult === "victory"
          ? "Secure"
          : "Holding"
  };
}

interface CombatHudProps {
  readonly snapshot: RenderSnapshot;
  readonly manualPaused?: boolean;
}

export function CombatHud({ snapshot, manualPaused = false }: CombatHudProps) {
  const health = healthState(snapshot);
  const encounter = encounterState(snapshot);
  const activeStatusCount =
    snapshot.schemaVersion === 2
      ? snapshot.entities.reduce(
          (count, entity) => count + entity.statuses.length,
          0
        )
      : 0;

  return (
    <section
      className="combat-hud"
      aria-labelledby="combat-hud-heading"
      data-authoritative-tick={snapshot.tick}
    >
      <h2 id="combat-hud-heading" className="visually-hidden">
        The Shuttergate
      </h2>

      <img className="combat-hud-frame" src={topHudFrameUrl} alt="" />

      <dl aria-label="Authoritative combat status">
        <div
          className="hud-count hud-plaque hud-plaque-left"
          data-faction="dwarf"
        >
          <dt>Fortress</dt>
          <dd data-fortress-state={encounter.fortress.toLowerCase()}>
            {encounter.fortress}
          </dd>
        </div>
        <div className="hud-plaque hud-plaque-center">
          <dt>Wave</dt>
          <dd>{encounter.wave}</dd>
        </div>
        <div
          className="hud-count hud-plaque hud-plaque-right"
          data-faction="enemy"
        >
          <dt>Hostiles</dt>
          <dd>{encounter.hostiles}</dd>
        </div>
      </dl>
      {health !== null && (
        <div
          className="warden-health"
          data-low-health={health.percentage <= 30}
        >
          <span>Iron Warden</span>
          <meter
            className="warden-health-track"
            aria-label="Iron Warden health"
            min={0}
            max={health.maximum}
            value={health.current}
          />
          <strong>
            {health.current} / {health.maximum}
          </strong>
        </div>
      )}
      <p className="combat-state-summary" aria-live="polite" aria-atomic="true">
        Combat {manualPaused ? "paused" : "active"}. Fortress{" "}
        {encounter.fortress.toLowerCase()}.
        {` ${encounter.hostiles} hostiles active`}
        {encounter.pending > 0 ? `, ${encounter.pending} approaching` : ""}.
        {activeStatusCount > 0
          ? ` ${activeStatusCount} active battlefield ${activeStatusCount === 1 ? "status" : "statuses"}.`
          : ""}
      </p>
    </section>
  );
}
