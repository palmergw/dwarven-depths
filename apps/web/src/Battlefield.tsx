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

export type BattlefieldDirection = "stylized-depth" | "top-down";

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

export function buildDepartureFeedbackPrimitives(
  previousSnapshot: RenderSnapshot,
  feedback: CombatFeedback
): readonly RenderPrimitive[] {
  const departureIds = new Set(feedback.departures.map((entity) => entity.id));
  return buildBattlefieldPrimitives(previousSnapshot).entities.filter(
    (entity) => departureIds.has(entity.id)
  );
}

function drawEntity(
  graphics: Phaser.GameObjects.Graphics,
  entity: RenderPrimitive & { readonly faction: RenderEntity["faction"] },
  scale: number
): void {
  const colors = { dwarf: 0xe6b85c, enemy: 0xd85b50, deployable: 0x67b6d4 };
  const { x, y } = entity;
  graphics.fillStyle(colors[entity.faction], 1);
  if (entity.faction === "dwarf") {
    graphics.fillStyle(0x090b0c, 0.8);
    graphics.fillEllipse(x, y + 14 * scale, 31 * scale, 9 * scale);
    graphics.fillStyle(0x8f5d2e, 1);
    graphics.fillRect(x - 9 * scale, y - 1 * scale, 18 * scale, 17 * scale);
    graphics.fillStyle(colors.dwarf, 1);
    graphics.fillPoints(
      [
        new Phaser.Math.Vector2(x - 13 * scale, y - 8 * scale),
        new Phaser.Math.Vector2(x, y - 19 * scale),
        new Phaser.Math.Vector2(x + 13 * scale, y - 8 * scale),
        new Phaser.Math.Vector2(x + 9 * scale, y + 2 * scale),
        new Phaser.Math.Vector2(x - 9 * scale, y + 2 * scale)
      ],
      true
    );
    graphics.fillStyle(0xd9d3c5, 1);
    graphics.fillRect(x - 11 * scale, y - 7 * scale, 22 * scale, 4 * scale);
    graphics.fillStyle(0x3a2a1b, 1);
    graphics.fillRect(x - 6 * scale, y + 3 * scale, 12 * scale, 8 * scale);
  } else if (entity.faction === "enemy") {
    graphics.fillStyle(0x080a0a, 0.8);
    graphics.fillEllipse(x, y + 14 * scale, 32 * scale, 9 * scale);
    graphics.fillStyle(colors.enemy, 1);
    graphics.fillPoints(
      [
        new Phaser.Math.Vector2(x, y - 16 * scale),
        new Phaser.Math.Vector2(x + 15 * scale, y - 3 * scale),
        new Phaser.Math.Vector2(x + 10 * scale, y + 14 * scale),
        new Phaser.Math.Vector2(x - 10 * scale, y + 14 * scale),
        new Phaser.Math.Vector2(x - 15 * scale, y - 3 * scale)
      ],
      true
    );
    graphics.fillStyle(0xffcf67, 1);
    graphics.fillRect(x - 7 * scale, y - 4 * scale, 4 * scale, 4 * scale);
    graphics.fillRect(x + 3 * scale, y - 4 * scale, 4 * scale, 4 * scale);
  } else {
    graphics.fillRect(x - 14 * scale, y - 14 * scale, 28 * scale, 28 * scale);
    graphics.fillStyle(0x17130f, 1);
    graphics.fillRect(x - 8 * scale, y - 8 * scale, 16 * scale, 16 * scale);
    graphics.fillStyle(colors.deployable, 1);
    graphics.fillRect(x - 3 * scale, y - 3 * scale, 6 * scale, 6 * scale);
  }
}

export function buildDirectionalBattlefieldPrimitives(
  snapshot: RenderSnapshot,
  direction: BattlefieldDirection
): BattlefieldPrimitives {
  const base = buildBattlefieldPrimitives(snapshot);
  const project = (point: RenderPrimitive): RenderPrimitive => {
    const unitX = (point.x - PADDING) / (WIDTH - PADDING * 2);
    const unitY = (point.y - PADDING) / (HEIGHT - PADDING * 2);
    return direction === "stylized-depth"
      ? {
          ...point,
          x: WIDTH / 2 + (unitX - unitY) * 225,
          y: 92 + (unitX + unitY) * 105
        }
      : { ...point, x: 82 + unitX * 476, y: 70 + unitY * 220 };
  };
  const nodes = base.nodes.map(project);
  const baseNodes = new Map(base.nodes.map((node) => [node.id, node]));
  const projectedNodes = new Map(nodes.map((node) => [node.id, node]));
  const entityNodeIds = new Map(
    snapshot.entities.map((entity) => [entity.id, entity.nodeId])
  );
  return {
    nodes,
    connections: base.connections,
    entities: base.entities.map((entity) => {
      const nodeId = entityNodeIds.get(entity.id);
      const baseNode = nodeId === undefined ? undefined : baseNodes.get(nodeId);
      const projectedNode =
        nodeId === undefined ? undefined : projectedNodes.get(nodeId);
      if (baseNode === undefined || projectedNode === undefined)
        throw new Error(
          `render entity ${entity.id} references an unknown node`
        );
      const xScale = direction === "stylized-depth" ? 0.58 : 0.72;
      const yScale = direction === "stylized-depth" ? 0.42 : 0.72;
      return {
        ...entity,
        x: projectedNode.x + (entity.x - baseNode.x) * xScale,
        y: projectedNode.y + (entity.y - baseNode.y) * yScale
      };
    })
  };
}

function drawConnections(
  graphics: Phaser.GameObjects.Graphics,
  primitives: BattlefieldPrimitives,
  width: number,
  color: number
): void {
  const nodes = new Map(primitives.nodes.map((node) => [node.id, node]));
  graphics.lineStyle(width, color, 1);
  for (const connection of primitives.connections) {
    const from = nodes.get(connection.fromId);
    const to = nodes.get(connection.toId);
    if (from !== undefined && to !== undefined)
      graphics.lineBetween(from.x, from.y, to.x, to.y);
  }
}

function drawFortressBackdrop(
  graphics: Phaser.GameObjects.Graphics,
  primitives: BattlefieldPrimitives,
  direction: BattlefieldDirection
): void {
  graphics.fillStyle(0x080b0d, 1);
  graphics.fillRect(0, 0, WIDTH, HEIGHT);
  graphics.fillStyle(0x101a20, 1);
  graphics.fillRect(0, 24, WIDTH, HEIGHT - 24);

  const corridorWidth = direction === "stylized-depth" ? 42 : 52;
  drawConnections(graphics, primitives, corridorWidth + 14, 0x171d20);
  drawConnections(graphics, primitives, corridorWidth + 4, 0x5b6266);
  drawConnections(graphics, primitives, corridorWidth - 8, 0x27353b);

  for (const [index, node] of primitives.nodes.entries()) {
    if (direction === "stylized-depth") {
      const corners = [
        new Phaser.Math.Vector2(node.x, node.y - 33),
        new Phaser.Math.Vector2(node.x + 50, node.y - 8),
        new Phaser.Math.Vector2(node.x, node.y + 18),
        new Phaser.Math.Vector2(node.x - 50, node.y - 8)
      ];
      graphics.fillStyle(index % 2 === 0 ? 0x263137 : 0x2d393e, 1);
      graphics.fillPoints(corners, true);
      graphics.lineStyle(3, 0x70787c, 1);
      graphics.strokePoints(corners, true);
      graphics.fillStyle(0x182126, 1);
      graphics.fillRect(node.x - 47, node.y - 64, 8, 55);
      graphics.fillRect(node.x + 39, node.y - 64, 8, 55);
      graphics.fillStyle(0x4c5559, 1);
      graphics.fillRect(node.x - 50, node.y - 67, 14, 8);
      graphics.fillRect(node.x + 36, node.y - 67, 14, 8);
    } else {
      graphics.fillStyle(index % 2 === 0 ? 0x303d43 : 0x354248, 1);
      graphics.fillRoundedRect(node.x - 39, node.y - 31, 78, 62, 5);
      graphics.lineStyle(5, 0x69747a, 1);
      graphics.strokeRoundedRect(node.x - 39, node.y - 31, 78, 62, 5);
      graphics.lineStyle(1, 0x20292d, 1);
      graphics.lineBetween(node.x - 34, node.y, node.x + 34, node.y);
      graphics.lineBetween(node.x, node.y - 26, node.x, node.y + 26);
    }
  }

  const torches =
    direction === "stylized-depth"
      ? ([
          [90, 98],
          [320, 74],
          [548, 126]
        ] as const)
      : ([
          [120, 80],
          [330, 220],
          [535, 112]
        ] as const);
  for (const [x, y] of torches) {
    graphics.fillStyle(0xf09a36, 0.1);
    graphics.fillCircle(x, y, 53);
    graphics.fillStyle(0xffc45a, 0.24);
    graphics.fillCircle(x, y, 27);
    graphics.fillStyle(0xffcf6a, 1);
    graphics.fillTriangle(x, y - 9, x - 5, y + 7, x + 5, y + 7);
    graphics.fillStyle(0x5b3820, 1);
    graphics.fillRect(x - 2, y + 7, 4, 16);
  }

  graphics.fillStyle(0x15191a, 1);
  graphics.fillRect(0, 0, WIDTH, 24);
  for (let x = 12; x < WIDTH; x += 34) {
    graphics.fillStyle(x % 68 === 12 ? 0x31373a : 0x272e31, 1);
    graphics.fillRect(x, 4, 28, 14);
  }
  if (direction === "stylized-depth") {
    graphics.fillStyle(0x07090a, 0.94);
    graphics.fillTriangle(0, HEIGHT, 0, 268, 152, HEIGHT);
    graphics.fillTriangle(WIDTH, HEIGHT, WIDTH, 250, 482, HEIGHT);
  }
}

function drawBattlefield(
  scene: Phaser.Scene,
  snapshot: RenderSnapshot,
  feedback: CombatFeedback | undefined,
  reduceMotion: boolean,
  previousSnapshot: RenderSnapshot | undefined,
  direction: BattlefieldDirection
): void {
  scene.children.removeAll();
  const graphics = scene.add.graphics();
  const primitives = buildDirectionalBattlefieldPrimitives(snapshot, direction);
  drawFortressBackdrop(graphics, primitives, direction);

  const orderedEntities = [...primitives.entities].sort((left, right) =>
    left.y === right.y ? compareRenderIds(left.id, right.id) : left.y - right.y
  );
  for (const entity of orderedEntities) {
    if (entity.faction === undefined) continue;
    drawEntity(
      graphics,
      { ...entity, faction: entity.faction },
      direction === "stylized-depth" ? 0.82 : 0.9
    );
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
    if (previousSnapshot !== undefined)
      for (const entity of buildDirectionalBattlefieldPrimitives(
        previousSnapshot,
        direction
      ).entities)
        if (feedback.departures.some((departure) => departure.id === entity.id))
          transient.strokeRect(entity.x - 19, entity.y - 19, 38, 38);
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
  scene.add.text(24, 31, "SHUTTERGATE HALL", {
    color: "#f4d99a",
    fontFamily: "Georgia, serif",
    fontSize: "15px",
    fontStyle: "bold"
  });
}

interface BattlefieldRenderer {
  update(
    snapshot: RenderSnapshot,
    feedback: CombatFeedback | undefined,
    reduceMotion: boolean,
    previousSnapshot: RenderSnapshot | undefined,
    direction: BattlefieldDirection
  ): void;
  destroy(): void;
}

function createBattlefieldRenderer(
  parent: HTMLElement,
  initialSnapshot: RenderSnapshot,
  initialFeedback: CombatFeedback | undefined,
  initialReduceMotion: boolean,
  initialDirection: BattlefieldDirection
): BattlefieldRenderer {
  let snapshot = initialSnapshot;
  let feedback = initialFeedback;
  let reduceMotion = initialReduceMotion;
  let previousSnapshot: RenderSnapshot | undefined;
  let direction = initialDirection;
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
        drawBattlefield(
          this,
          snapshot,
          feedback,
          reduceMotion,
          previousSnapshot,
          direction
        );
      }
    }
  });
  return {
    update(
      nextSnapshot,
      nextFeedback,
      nextReduceMotion,
      nextPreviousSnapshot,
      nextDirection
    ) {
      snapshot = nextSnapshot;
      feedback = nextFeedback;
      reduceMotion = nextReduceMotion;
      previousSnapshot = nextPreviousSnapshot;
      direction = nextDirection;
      if (scene !== undefined)
        drawBattlefield(
          scene,
          snapshot,
          feedback,
          reduceMotion,
          previousSnapshot,
          direction
        );
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
  const latestDirectionRef = useRef<BattlefieldDirection>("stylized-depth");
  const previousSnapshotRef = useRef<RenderSnapshot | undefined>(undefined);
  const soundPlayerRef = useRef<CombatSoundPlayer | undefined>(undefined);
  const [feedback, setFeedback] = useState<CombatFeedback | undefined>();
  const [direction, setDirection] =
    useState<BattlefieldDirection>("stylized-depth");
  latestSnapshotRef.current = snapshot;
  latestReduceMotionRef.current = reduceMotion;
  latestDirectionRef.current = direction;

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
        latestReduceMotionRef.current,
        latestDirectionRef.current
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
      previousSnapshot,
      direction
    );
    if (nextFeedback !== undefined) soundPlayerRef.current?.play(nextFeedback);
  }, [direction, reduceMotion, snapshot]);

  return (
    <figure className="battlefield">
      <fieldset className="battlefield-direction">
        <legend>Fortress viewpoint</legend>
        <button
          type="button"
          aria-pressed={direction === "stylized-depth"}
          onClick={() => setDirection("stylized-depth")}
        >
          Stylized depth
        </button>
        <button
          type="button"
          aria-pressed={direction === "top-down"}
          onClick={() => setDirection("top-down")}
        >
          Top-down
        </button>
      </fieldset>
      <div ref={parentRef} className="battlefield-canvas" aria-hidden="true" />
      <figcaption aria-live="off">
        Shuttergate Hall,{" "}
        {snapshot.phase === "running" ? "battle underway" : snapshot.phase};{" "}
        {snapshot.entities.length} combatant
        {snapshot.entities.length === 1 ? "" : "s"} visible.
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
