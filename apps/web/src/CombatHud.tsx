import type { RenderSnapshot } from "./render-snapshot.js";

const topHudFrameUrl = new URL(
  "../../../assets/game-art/production-scene/exports/hud/top-hud-frame.png",
  import.meta.url
).href;

function healthState(snapshot: RenderSnapshot): {
  readonly current: number;
  readonly maximum: number;
} | null {
  if (snapshot.schemaVersion !== 2) return null;
  const warden = snapshot.entities.find((entity) => entity.faction === "dwarf");
  if (warden === undefined) return null;
  return {
    current: warden.currentHealth,
    maximum: warden.maximumHealth
  };
}

function encounterState(snapshot: RenderSnapshot): {
  readonly wave: string;
  readonly hostiles: number;
  readonly pending: number;
  readonly fortress: string;
  readonly terminalResult: "victory" | "defeat" | null;
} {
  if (snapshot.schemaVersion !== 2) {
    return {
      wave: "Approaching",
      hostiles: snapshot.entities.filter((entity) => entity.faction === "enemy")
        .length,
      pending: 0,
      fortress: snapshot.phase === "terminal" ? "Resolved" : "Holding",
      terminalResult: null
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
        ? `${activeWaveIndex + 1}`
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
          : "Holding",
    terminalResult: snapshot.encounter.terminalResult
  };
}

const STATUS_DETAILS: Readonly<
  Record<string, { readonly effect: string; readonly source: string }>
> = {
  "status.haste": { effect: "hastened", source: "haste effect" },
  "status.slow": { effect: "slowed", source: "slowing effect" },
  "status.staggered": { effect: "staggered", source: "Shield Slam" }
};

function statusDetails(statusId: string): {
  readonly effect: string;
  readonly source: string;
} {
  if (statusId.includes("stagger"))
    return { effect: "staggered", source: "Shield Slam" };
  return (
    STATUS_DETAILS[statusId] ?? {
      effect: statusId,
      source: "unavailable in authoritative presentation state"
    }
  );
}

function combatantLabel(
  entity: Extract<RenderSnapshot, { schemaVersion: 2 }>["entities"][number]
): string {
  if (entity.faction === "dwarf") return "Iron Warden";
  if (entity.faction === "deployable") return "Fortress defense";
  if (entity.boss) return "Boss";
  return entity.elite ? "Elite enemy" : "Enemy";
}

function statusSummary(snapshot: RenderSnapshot): string {
  if (snapshot.schemaVersion !== 2) return "";
  return snapshot.entities
    .flatMap((entity) =>
      entity.statuses.map((status) => {
        const details = statusDetails(status.id);
        return `${combatantLabel(entity)} has status ${details.effect} (${status.id}), source ${details.source}, from tick ${status.appliedAtTick} through tick ${status.expiresAtTick}.`;
      })
    )
    .join(" ");
}

interface CombatHudProps {
  readonly snapshot: RenderSnapshot;
  readonly manualPaused?: boolean;
}

export function CombatHud({ snapshot, manualPaused = false }: CombatHudProps) {
  const health = healthState(snapshot);
  const encounter = encounterState(snapshot);
  const activeStatuses = statusSummary(snapshot);
  const combatActivity =
    encounter.terminalResult === null
      ? manualPaused
        ? "Combat paused"
        : snapshot.phase === "terminal"
          ? "Combat ended"
          : "Combat active"
      : `Combat ended in ${encounter.terminalResult}`;

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
      <p className="combat-state-summary" aria-live="polite" aria-atomic="true">
        {combatActivity}. Fortress {encounter.fortress.toLowerCase()}. Wave{" "}
        {encounter.wave}.{` ${encounter.hostiles} hostiles active`}
        {encounter.pending > 0 ? `, ${encounter.pending} approaching` : ""}.
        {health === null
          ? ""
          : ` Iron Warden health ${health.current} of ${health.maximum}.`}
        {activeStatuses === "" ? "" : ` ${activeStatuses}`}
      </p>
    </section>
  );
}
