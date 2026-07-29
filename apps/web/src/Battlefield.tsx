import Phaser from "phaser";
import { useEffect, useRef, useState } from "react";
import environmentArchitectureUrl from "./assets/shuttergate/environment-architecture.png";
import environmentBackgroundUrl from "./assets/shuttergate/environment-background.png";
import environmentFloorPathUrl from "./assets/shuttergate/environment-floor-path.png";
import environmentForegroundUrl from "./assets/shuttergate/environment-foreground.png";
import environmentLightingUrl from "./assets/shuttergate/environment-lighting.png";
import ironWardenUrl from "./assets/shuttergate/iron-warden-actions.png";
import assetManifest from "./assets/shuttergate/manifest.json";
import mineRaiderUrl from "./assets/shuttergate/mine-raider-actions.png";
import {
  type CombatFeedback,
  type CombatSoundPlayer,
  createCombatSoundPlayer,
  deriveCombatFeedback,
  isCombatFeedbackProgression
} from "./combat-feedback.js";
import {
  compareRenderIds,
  type RenderEntity,
  type RenderSnapshot
} from "./render-snapshot.js";

const WIDTH = 640;
const HEIGHT = 360;
const REQUIRED_ENVIRONMENT_EXCLUSIONS = [
  "characters",
  "creatures",
  "combat-effects",
  "state-text",
  "controls",
  "hud"
] as const;
const ENVIRONMENT_ASSETS = [
  ["environment-background", environmentBackgroundUrl],
  ["environment-floor-path", environmentFloorPathUrl],
  ["environment-architecture", environmentArchitectureUrl],
  ["environment-foreground", environmentForegroundUrl],
  ["environment-lighting", environmentLightingUrl]
] as const;

export function environmentAssetPathsFromManifest(
  value: unknown
): readonly string[] {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw new Error("environment asset manifest must be an object");
  const candidate = value as Record<string, unknown>;
  const files = candidate["files"];
  if (candidate["schemaVersion"] !== 2 || !Array.isArray(files))
    throw new Error("environment asset manifest schema is unsupported");
  const environmentFiles = files.filter(
    (file): file is Record<string, unknown> =>
      typeof file === "object" &&
      file !== null &&
      file["role"] === "environment"
  );
  if (environmentFiles.length !== ENVIRONMENT_ASSETS.length)
    throw new Error("environment asset manifest has an unexpected layer count");
  return environmentFiles.map((file) => {
    const path = file["path"];
    const sourcePath = file["sourcePath"];
    const exclusions = file["excludes"];
    if (
      typeof path !== "string" ||
      !path.includes("/assets/shuttergate/environment-") ||
      typeof sourcePath !== "string" ||
      !sourcePath.includes("/exports/environment/") ||
      !Array.isArray(exclusions) ||
      REQUIRED_ENVIRONMENT_EXCLUSIONS.some(
        (exclusion) => !exclusions.includes(exclusion)
      )
    )
      throw new Error(
        "runtime environment layer violates the exclusion policy"
      );
    return path;
  });
}

environmentAssetPathsFromManifest(assetManifest);
const APPROVED_ROUTE = [
  [540, 49],
  [508, 63],
  [472, 85],
  [443, 112],
  [429, 143],
  [397, 169],
  [365, 203],
  [282, 266],
  [146, 228]
] as const;

export interface RenderPrimitive {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly faction?: RenderEntity["faction"];
}

export interface BattlefieldPrimitives {
  readonly nodes: readonly RenderPrimitive[];
  readonly entities: readonly RenderPrimitive[];
  readonly connections: readonly {
    readonly id: string;
    readonly fromId: string;
    readonly toId: string;
  }[];
}

export function buildBattlefieldPrimitives(
  snapshot: RenderSnapshot
): BattlefieldPrimitives {
  const orderedNodes = [...snapshot.nodes].sort((left, right) =>
    compareRenderIds(left.id, right.id)
  );
  const nodes = orderedNodes.map((node, index) => {
    const routeIndex =
      orderedNodes.length <= 1
        ? Math.floor(APPROVED_ROUTE.length / 2)
        : Math.round(
            (index / (orderedNodes.length - 1)) * (APPROVED_ROUTE.length - 1)
          );
    const routePoint = APPROVED_ROUTE[routeIndex] ?? APPROVED_ROUTE[0];
    return {
      id: node.id,
      x: routePoint[0],
      y: routePoint[1]
    };
  });
  const positions = new Map(nodes.map((node) => [node.id, node]));
  const orderedEntities = [...snapshot.entities].sort((left, right) =>
    compareRenderIds(left.id, right.id)
  );
  const nodeOccupancy = new Map<string, number>();
  for (const entity of orderedEntities)
    nodeOccupancy.set(
      entity.nodeId,
      (nodeOccupancy.get(entity.nodeId) ?? 0) + 1
    );
  const nodeSlots = new Map<string, number>();
  return {
    nodes,
    connections: [...snapshot.connections]
      .sort((left, right) => compareRenderIds(left.id, right.id))
      .map((connection) => ({
        id: connection.id,
        fromId: connection.fromNodeId,
        toId: connection.toNodeId
      })),
    entities: orderedEntities.map((entity) => {
      const position = positions.get(entity.nodeId);
      if (position === undefined)
        throw new Error(
          `render entity ${entity.id} references an unknown node`
        );
      const occupancy = nodeOccupancy.get(entity.nodeId) ?? 1;
      const slot = nodeSlots.get(entity.nodeId) ?? 0;
      nodeSlots.set(entity.nodeId, slot + 1);
      const columns = Math.min(3, occupancy);
      const rows = Math.ceil(occupancy / columns);
      const column = slot % columns;
      const row = Math.floor(slot / columns);
      return {
        id: entity.id,
        faction: entity.faction,
        x: position.x + (column - (columns - 1) / 2) * 24,
        y: position.y + (row - (rows - 1) / 2) * 18
      };
    })
  };
}

export function buildDepartureFeedbackPrimitives(
  previousSnapshot: RenderSnapshot,
  feedback: CombatFeedback
): readonly RenderPrimitive[] {
  const departureIds = new Set(feedback.departures.map((entity) => entity.id));
  return buildBattlefieldPrimitives(previousSnapshot).entities.filter(
    (entity) => departureIds.has(entity.id)
  );
}

function describeCombatFeedback(feedback: CombatFeedback): string {
  if (feedback.terminal) return "Battle resolved.";
  const updates: string[] = [];
  if (feedback.arrivals.length > 0)
    updates.push(`${feedback.arrivals.length} entered the battle`);
  if (feedback.departures.length > 0)
    updates.push(`${feedback.departures.length} left the battle`);
  return updates.length === 0
    ? "Battle lines shifted."
    : `${updates.join("; ")}.`;
}

interface BattlefieldSceneState {
  readonly scene: Phaser.Scene;
  readonly parent: HTMLElement;
  readonly entities: Map<string, Phaser.GameObjects.Sprite>;
  effects?: Phaser.GameObjects.Graphics;
}

function reportPresentationIntegrity(
  state: BattlefieldSceneState,
  snapshot: RenderSnapshot
): void {
  const snapshotDwarves = snapshot.entities.filter(
    (entity) => entity.faction === "dwarf"
  ).length;
  const snapshotHostiles = snapshot.entities.filter(
    (entity) => entity.faction === "enemy"
  ).length;
  const runtimeDwarves = [...state.entities.values()].filter(
    (sprite) => sprite.getData("authoritativeFaction") === "dwarf"
  ).length;
  const runtimeHostiles = [...state.entities.values()].filter(
    (sprite) => sprite.getData("authoritativeFaction") === "enemy"
  ).length;
  if (
    snapshotDwarves !== runtimeDwarves ||
    snapshotHostiles !== runtimeHostiles
  )
    throw new Error(
      "authoritative combatant and runtime sprite counts diverged"
    );
  state.parent.dataset["presentationIntegrity"] = "verified";
  state.parent.dataset["snapshotDwarfCount"] = String(snapshotDwarves);
  state.parent.dataset["snapshotHostileCount"] = String(snapshotHostiles);
  state.parent.dataset["runtimeDwarfSpriteCount"] = String(runtimeDwarves);
  state.parent.dataset["runtimeHostileSpriteCount"] = String(runtimeHostiles);
}

function syncBattlefield(
  state: BattlefieldSceneState,
  snapshot: RenderSnapshot,
  feedback: CombatFeedback | undefined,
  reduceMotion: boolean,
  previousSnapshot: RenderSnapshot | undefined
): void {
  const { scene } = state;
  const primitives = buildBattlefieldPrimitives(snapshot);
  const visibleIds = new Set(primitives.entities.map((entity) => entity.id));
  for (const [id, sprite] of state.entities)
    if (!visibleIds.has(id)) {
      sprite.destroy();
      state.entities.delete(id);
    }
  for (const entity of primitives.entities) {
    if (entity.faction === undefined) continue;
    const texture = entity.faction === "enemy" ? "mine-raider" : "iron-warden";
    const frameCount = entity.faction === "enemy" ? 5 : 6;
    const frame = reduceMotion ? 0 : snapshot.tick % frameCount;
    let sprite = state.entities.get(entity.id);
    if (sprite === undefined) {
      sprite = scene.add.sprite(entity.x, entity.y, texture, frame);
      sprite
        .setOrigin(0.5, 0.82)
        .setScale(entity.faction === "enemy" ? 0.48 : 0.54);
      state.entities.set(entity.id, sprite);
    } else {
      sprite.setTexture(texture, frame);
      scene.tweens.killTweensOf(sprite);
      if (reduceMotion) sprite.setPosition(entity.x, entity.y);
      else
        scene.tweens.add({
          targets: sprite,
          x: entity.x,
          y: entity.y,
          duration: 180,
          ease: "Sine.easeOut"
        });
    }
    sprite.setData("authoritativeFaction", entity.faction);
    sprite.setDepth(100 + entity.y);
  }
  reportPresentationIntegrity(state, snapshot);

  state.effects?.destroy();
  delete state.effects;
  if (feedback !== undefined) {
    const transient = scene.add.graphics();
    transient.setDepth(500);
    transient.lineStyle(3, feedback.terminal ? 0xf4ead5 : 0xf0c66f, 0.9);
    const changedIds = new Set([
      ...feedback.arrivals.map((entity) => entity.id),
      ...feedback.departures.map((entity) => entity.id)
    ]);
    for (const entity of primitives.entities)
      if (changedIds.has(entity.id))
        transient.strokeCircle(entity.x, entity.y - 15, 24);
    if (previousSnapshot !== undefined)
      for (const entity of buildDepartureFeedbackPrimitives(
        previousSnapshot,
        feedback
      ))
        transient.strokeCircle(entity.x, entity.y - 15, 20);
    if (!reduceMotion)
      scene.tweens.add({
        targets: transient,
        alpha: 0.15,
        scale: 1.25,
        duration: 360,
        yoyo: true,
        repeat: 1,
        onComplete: () => transient.destroy()
      });
    state.effects = transient;
  }
}

interface BattlefieldRenderer {
  update(
    snapshot: RenderSnapshot,
    feedback: CombatFeedback | undefined,
    reduceMotion: boolean,
    previousSnapshot: RenderSnapshot | undefined
  ): void;
  destroy(): void;
}

function createBattlefieldRenderer(
  parent: HTMLElement,
  initialSnapshot: RenderSnapshot,
  initialFeedback: CombatFeedback | undefined,
  initialReduceMotion: boolean
): BattlefieldRenderer {
  let snapshot = initialSnapshot;
  let feedback = initialFeedback;
  let reduceMotion = initialReduceMotion;
  let previousSnapshot: RenderSnapshot | undefined;
  let sceneState: BattlefieldSceneState | undefined;
  const game = new Phaser.Game({
    type: Phaser.CANVAS,
    width: WIDTH,
    height: HEIGHT,
    parent,
    backgroundColor: "#17130f",
    banner: false,
    audio: { noAudio: true },
    render: { antialias: false, pixelArt: true },
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    scene: {
      preload(this: Phaser.Scene) {
        for (const [key, url] of ENVIRONMENT_ASSETS) this.load.image(key, url);
        this.load.spritesheet("iron-warden", ironWardenUrl, {
          frameWidth: 64,
          frameHeight: 128
        });
        this.load.spritesheet("mine-raider", mineRaiderUrl, {
          frameWidth: 64,
          frameHeight: 128
        });
      },
      create(this: Phaser.Scene) {
        const environmentDepths = [0, 10, 20, 400, 450] as const;
        for (const [index, [key]] of ENVIRONMENT_ASSETS.entries()) {
          const layer = this.add.image(WIDTH / 2, HEIGHT / 2, key);
          layer.setDisplaySize(WIDTH, HEIGHT);
          layer.setDepth(environmentDepths[index] ?? 0);
          if (key === "environment-lighting")
            layer.setBlendMode(Phaser.BlendModes.ADD);
        }
        const warmLight = this.add.circle(213, 175, 92, 0xd17a36, 0.1);
        warmLight.setBlendMode(Phaser.BlendModes.ADD).setDepth(450);
        if (!reduceMotion)
          this.tweens.add({
            targets: warmLight,
            alpha: { from: 0.06, to: 0.14 },
            scale: { from: 0.92, to: 1.08 },
            duration: 900,
            yoyo: true,
            repeat: -1
          });
        sceneState = { scene: this, parent, entities: new Map() };
        syncBattlefield(
          sceneState,
          snapshot,
          feedback,
          reduceMotion,
          previousSnapshot
        );
      }
    }
  });
  return {
    update(nextSnapshot, nextFeedback, nextReduceMotion, nextPreviousSnapshot) {
      snapshot = nextSnapshot;
      feedback = nextFeedback;
      reduceMotion = nextReduceMotion;
      previousSnapshot = nextPreviousSnapshot;
      if (sceneState !== undefined)
        syncBattlefield(
          sceneState,
          snapshot,
          feedback,
          reduceMotion,
          previousSnapshot
        );
    },
    destroy() {
      sceneState = undefined;
      game.destroy(true);
      parent.replaceChildren();
    }
  };
}

export function Battlefield({
  snapshot,
  reduceMotion,
  soundEnabled
}: {
  readonly snapshot: RenderSnapshot;
  readonly reduceMotion: boolean;
  readonly soundEnabled: boolean;
}) {
  const parentRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<BattlefieldRenderer | undefined>(undefined);
  const latestSnapshotRef = useRef(snapshot);
  const latestFeedbackRef = useRef<CombatFeedback | undefined>(undefined);
  const latestReduceMotionRef = useRef(reduceMotion);
  const previousSnapshotRef = useRef<RenderSnapshot | undefined>(undefined);
  const soundPlayerRef = useRef<CombatSoundPlayer | undefined>(undefined);
  const [feedback, setFeedback] = useState<CombatFeedback | undefined>();
  latestSnapshotRef.current = snapshot;
  latestReduceMotionRef.current = reduceMotion;

  useEffect(() => {
    if (!soundEnabled) {
      soundPlayerRef.current?.close();
      soundPlayerRef.current = undefined;
      return;
    }
    const player = createCombatSoundPlayer();
    soundPlayerRef.current = player;
    return () => {
      player.close();
      if (soundPlayerRef.current === player) soundPlayerRef.current = undefined;
    };
  }, [soundEnabled]);

  useEffect(() => {
    const parent = parentRef.current;
    if (parent === null) return;
    let renderer: BattlefieldRenderer | undefined;
    const frame = requestAnimationFrame(() => {
      renderer = createBattlefieldRenderer(
        parent,
        latestSnapshotRef.current,
        latestFeedbackRef.current,
        latestReduceMotionRef.current
      );
      rendererRef.current = renderer;
    });
    return () => {
      cancelAnimationFrame(frame);
      renderer?.destroy();
      rendererRef.current = undefined;
    };
  }, []);

  useEffect(() => {
    const previousSnapshot = previousSnapshotRef.current;
    const nextFeedback = deriveCombatFeedback(previousSnapshot, snapshot);
    if (
      previousSnapshot === undefined ||
      isCombatFeedbackProgression(previousSnapshot, snapshot)
    )
      previousSnapshotRef.current = snapshot;
    latestFeedbackRef.current = nextFeedback;
    setFeedback(nextFeedback);
    rendererRef.current?.update(
      snapshot,
      nextFeedback,
      reduceMotion,
      previousSnapshot
    );
    if (nextFeedback !== undefined) soundPlayerRef.current?.play(nextFeedback);
  }, [reduceMotion, snapshot]);

  return (
    <figure className="battlefield">
      <div ref={parentRef} className="battlefield-canvas" aria-hidden="true" />
      <figcaption aria-live="off">
        Shuttergate battlefield:{" "}
        {snapshot.phase === "running" ? "combat in progress" : snapshot.phase};{" "}
        {snapshot.entities.length}{" "}
        {snapshot.entities.length === 1 ? "combatant" : "combatants"}.
        {feedback !== undefined && (
          <span
            className="combat-feedback"
            data-motion={reduceMotion ? "static" : "animated"}
          >
            {" "}
            {describeCombatFeedback(feedback)}
          </span>
        )}
      </figcaption>
    </figure>
  );
}
