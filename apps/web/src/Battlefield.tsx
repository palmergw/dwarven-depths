import Phaser from "phaser";
import { useEffect, useRef, useState } from "react";
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
const PADDING = 64;

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
  const minimumX = Math.min(...orderedNodes.map((node) => node.x), 0);
  const maximumX = Math.max(...orderedNodes.map((node) => node.x), 0);
  const minimumY = Math.min(...orderedNodes.map((node) => node.y), 0);
  const maximumY = Math.max(...orderedNodes.map((node) => node.y), 0);
  const spanX = Math.max(maximumX - minimumX, 1);
  const spanY = Math.max(maximumY - minimumY, 1);
  const project = (x: number, y: number) => ({
    x: PADDING + ((x - minimumX) / spanX) * (WIDTH - PADDING * 2),
    y: PADDING + ((y - minimumY) / spanY) * (HEIGHT - PADDING * 2)
  });
  const nodes = orderedNodes.map((node) => ({
    id: node.id,
    ...project(node.x, node.y)
  }));
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
        x: position.x + (column - (columns - 1) / 2) * 38,
        y: position.y + (row - (rows - 1) / 2) * 38
      };
    })
  };
}

function drawEntity(
  graphics: Phaser.GameObjects.Graphics,
  entity: RenderPrimitive & { readonly faction: RenderEntity["faction"] }
): void {
  const colors = { dwarf: 0xe6b85c, enemy: 0xd85b50, deployable: 0x67b6d4 };
  graphics.fillStyle(colors[entity.faction], 1);
  if (entity.faction === "dwarf") {
    graphics.fillPoints(
      [
        new Phaser.Math.Vector2(entity.x - 14, entity.y - 12),
        new Phaser.Math.Vector2(entity.x + 14, entity.y - 12),
        new Phaser.Math.Vector2(entity.x + 11, entity.y + 7),
        new Phaser.Math.Vector2(entity.x, entity.y + 17),
        new Phaser.Math.Vector2(entity.x - 11, entity.y + 7)
      ],
      true
    );
    graphics.fillStyle(0x17130f, 1);
    graphics.fillRect(entity.x - 2, entity.y - 8, 4, 17);
    graphics.fillRect(entity.x - 7, entity.y - 3, 14, 4);
  } else if (entity.faction === "enemy") {
    graphics.fillPoints(
      [
        new Phaser.Math.Vector2(entity.x, entity.y - 17),
        new Phaser.Math.Vector2(entity.x + 16, entity.y),
        new Phaser.Math.Vector2(entity.x, entity.y + 17),
        new Phaser.Math.Vector2(entity.x - 16, entity.y)
      ],
      true
    );
    graphics.fillStyle(0x17130f, 1);
    graphics.fillRect(entity.x - 8, entity.y - 3, 5, 5);
    graphics.fillRect(entity.x + 3, entity.y - 3, 5, 5);
  } else {
    graphics.fillRect(entity.x - 14, entity.y - 14, 28, 28);
    graphics.fillStyle(0x17130f, 1);
    graphics.fillRect(entity.x - 8, entity.y - 8, 16, 16);
    graphics.fillStyle(colors.deployable, 1);
    graphics.fillRect(entity.x - 3, entity.y - 3, 6, 6);
  }
}

function drawBattlefield(
  scene: Phaser.Scene,
  snapshot: RenderSnapshot,
  feedback: CombatFeedback | undefined,
  reduceMotion: boolean
): void {
  scene.children.removeAll();
  const graphics = scene.add.graphics();
  graphics.fillStyle(0x17130f, 1);
  graphics.fillRect(0, 0, WIDTH, HEIGHT);
  graphics.lineStyle(3, 0x80683f, 1);
  graphics.strokeRoundedRect(16, 16, WIDTH - 32, HEIGHT - 32, 12);

  const primitives = buildBattlefieldPrimitives(snapshot);
  const nodes = new Map(primitives.nodes.map((node) => [node.id, node]));
  graphics.lineStyle(7, 0x3e3327, 1);
  for (const connection of primitives.connections) {
    const from = nodes.get(connection.fromId);
    const to = nodes.get(connection.toId);
    if (from !== undefined && to !== undefined)
      graphics.lineBetween(from.x, from.y, to.x, to.y);
  }
  graphics.lineStyle(3, 0xb18a4f, 1);
  for (const connection of primitives.connections) {
    const from = nodes.get(connection.fromId);
    const to = nodes.get(connection.toId);
    if (from !== undefined && to !== undefined)
      graphics.lineBetween(from.x, from.y, to.x, to.y);
  }
  graphics.fillStyle(0xd6c8a8, 1);
  for (const node of primitives.nodes)
    graphics.fillRect(node.x - 6, node.y - 6, 12, 12);

  for (const entity of primitives.entities) {
    if (entity.faction === undefined) continue;
    drawEntity(graphics, { ...entity, faction: entity.faction });
  }

  if (feedback !== undefined) {
    const transient = scene.add.graphics();
    transient.lineStyle(4, feedback.terminal ? 0xf4ead5 : 0xf0c66f, 1);
    const changedIds = new Set([
      ...feedback.arrivals.map((entity) => entity.id),
      ...feedback.departures.map((entity) => entity.id)
    ]);
    for (const entity of primitives.entities)
      if (changedIds.has(entity.id))
        transient.strokeRect(entity.x - 21, entity.y - 21, 42, 42);
    for (const entity of feedback.departures) {
      const position = nodes.get(entity.nodeId);
      if (position !== undefined)
        transient.strokeRect(position.x - 19, position.y - 19, 38, 38);
    }
    if (feedback.terminal)
      transient.strokeRect(22, 22, WIDTH - 44, HEIGHT - 44);
    if (!reduceMotion)
      scene.tweens.add({
        targets: transient,
        alpha: 0.2,
        duration: 450,
        yoyo: true,
        repeat: 1
      });
  }

  if (primitives.nodes.length === 0) {
    scene.add
      .text(WIDTH / 2, HEIGHT / 2, "Empty level — no combatants deployed", {
        align: "center",
        color: "#d8cdb9",
        fontFamily: "sans-serif",
        fontSize: "20px"
      })
      .setOrigin(0.5);
  }
  scene.add.text(
    32,
    28,
    `${snapshot.levelId} · ${snapshot.phase} · tick ${snapshot.tick}`,
    {
      color: "#f4ead5",
      fontFamily: "monospace",
      fontSize: "14px"
    }
  );
}

interface BattlefieldRenderer {
  update(
    snapshot: RenderSnapshot,
    feedback: CombatFeedback | undefined,
    reduceMotion: boolean
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
  let scene: Phaser.Scene | undefined;
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
      create(this: Phaser.Scene) {
        scene = this;
        drawBattlefield(this, snapshot, feedback, reduceMotion);
      }
    }
  });
  return {
    update(nextSnapshot, nextFeedback, nextReduceMotion) {
      snapshot = nextSnapshot;
      feedback = nextFeedback;
      reduceMotion = nextReduceMotion;
      if (scene !== undefined)
        drawBattlefield(scene, snapshot, feedback, reduceMotion);
    },
    destroy() {
      scene = undefined;
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
    rendererRef.current?.update(snapshot, nextFeedback, reduceMotion);
    if (nextFeedback !== undefined) soundPlayerRef.current?.play(nextFeedback);
  }, [reduceMotion, snapshot]);

  return (
    <figure className="battlefield">
      <div ref={parentRef} className="battlefield-canvas" aria-hidden="true" />
      <figcaption aria-live="off">
        Battlefield {snapshot.levelId}: {snapshot.phase} at tick {snapshot.tick}
        ; {snapshot.entities.length}{" "}
        {snapshot.entities.length === 1 ? "entity" : "entities"}.
        {feedback !== undefined && (
          <span
            className="combat-feedback"
            data-motion={reduceMotion ? "static" : "animated"}
            data-tick={feedback.tick}
          >
            {" "}
            {feedback.summary}
          </span>
        )}
      </figcaption>
    </figure>
  );
}
