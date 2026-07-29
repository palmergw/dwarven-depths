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

const WIDTH = 960;
const HEIGHT = 540;
const PADDING = 96;

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
  scene: Phaser.Scene,
  entity: RenderPrimitive & { readonly faction: RenderEntity["faction"] },
  scale: number,
  action: boolean,
  reduceMotion: boolean
): void {
  const graphics = scene.add.graphics().setPosition(entity.x, entity.y);
  if (entity.faction === "dwarf") {
    graphics.fillStyle(0x090b0c, 0.8);
    graphics.fillEllipse(0, 24 * scale, 54 * scale, 14 * scale);
    graphics.fillStyle(0x33291f, 1);
    graphics.fillRect(-12 * scale, 1, 24 * scale, 31 * scale);
    graphics.fillStyle(0x6d3023, 1);
    graphics.fillRect(-12 * scale, 20 * scale, 9 * scale, 18 * scale);
    graphics.fillRect(4 * scale, 20 * scale, 9 * scale, 18 * scale);
    graphics.fillStyle(0xbbb7ad, 1);
    graphics.fillTriangle(-16 * scale, 0, 0, -24 * scale, 16 * scale, 0);
    graphics.fillStyle(0xdca94d, 1);
    graphics.fillRect(-17 * scale, -17 * scale, 34 * scale, 10 * scale);
    graphics.fillTriangle(
      -17 * scale,
      -14 * scale,
      -27 * scale,
      -8 * scale,
      -16 * scale,
      -5 * scale
    );
    graphics.fillTriangle(
      17 * scale,
      -14 * scale,
      27 * scale,
      -8 * scale,
      16 * scale,
      -5 * scale
    );
    graphics.fillStyle(0xe8d9b5, 1);
    graphics.fillRect(-11 * scale, -7 * scale, 22 * scale, 11 * scale);
    graphics.fillStyle(0xf1eee2, 1);
    graphics.fillTriangle(
      -13 * scale,
      2 * scale,
      0,
      24 * scale,
      13 * scale,
      2 * scale
    );
    graphics.fillStyle(0x6b351f, 1);
    graphics.fillRect(-2 * scale, 2 * scale, 4 * scale, 12 * scale);
    graphics.fillStyle(0x27323a, 1);
    graphics.fillRoundedRect(
      -31 * scale,
      -1 * scale,
      22 * scale,
      35 * scale,
      5 * scale
    );
    graphics.lineStyle(3 * scale, 0xb58b42, 1);
    graphics.strokeRoundedRect(
      -31 * scale,
      -1 * scale,
      22 * scale,
      35 * scale,
      5 * scale
    );
    graphics.lineBetween(-28 * scale, 14 * scale, -12 * scale, 14 * scale);
    graphics.lineBetween(-20 * scale, 4 * scale, -20 * scale, 27 * scale);
    graphics.fillStyle(0x79502e, 1);
    graphics.fillRect(
      17 * scale,
      action ? -29 * scale : -6 * scale,
      5 * scale,
      33 * scale
    );
    graphics.fillStyle(0xaeb5b6, 1);
    graphics.fillRect(
      12 * scale,
      action ? -34 * scale : -12 * scale,
      16 * scale,
      9 * scale
    );
  } else if (entity.faction === "enemy") {
    graphics.fillStyle(0x080a0a, 0.8);
    graphics.fillEllipse(0, 23 * scale, 49 * scale, 13 * scale);
    graphics.fillStyle(0x2e241e, 1);
    graphics.fillRect(-12 * scale, 3 * scale, 24 * scale, 28 * scale);
    graphics.fillStyle(0x8e3b2f, 1);
    graphics.fillPoints(
      [
        new Phaser.Math.Vector2(0, -22 * scale),
        new Phaser.Math.Vector2(20 * scale, -8 * scale),
        new Phaser.Math.Vector2(13 * scale, 13 * scale),
        new Phaser.Math.Vector2(-13 * scale, 13 * scale),
        new Phaser.Math.Vector2(-20 * scale, -8 * scale)
      ],
      true
    );
    graphics.fillStyle(0xffcf67, 1);
    graphics.fillRect(-9 * scale, -7 * scale, 6 * scale, 4 * scale);
    graphics.fillRect(3 * scale, -7 * scale, 6 * scale, 4 * scale);
    graphics.fillStyle(0x16191a, 1);
    graphics.fillTriangle(
      -18 * scale,
      8 * scale,
      0,
      20 * scale,
      18 * scale,
      8 * scale
    );
    const weaponX = action ? -27 : 16;
    graphics.fillStyle(0x79452a, 1);
    graphics.fillRect(weaponX * scale, -3 * scale, 5 * scale, 32 * scale);
    graphics.fillStyle(0xa6aaa8, 1);
    graphics.fillTriangle(
      (weaponX - 7) * scale,
      -8 * scale,
      (weaponX + 9) * scale,
      -3 * scale,
      weaponX * scale,
      8 * scale
    );
  } else {
    graphics.fillStyle(0x67b6d4, 1);
    graphics.fillRect(-14 * scale, -14 * scale, 28 * scale, 28 * scale);
    graphics.fillStyle(0x17130f, 1);
    graphics.fillRect(-8 * scale, -8 * scale, 16 * scale, 16 * scale);
  }
  if (!reduceMotion)
    scene.tweens.add({
      targets: graphics,
      y: entity.y + (action ? -7 : -2),
      x: entity.x + (action ? (entity.faction === "dwarf" ? 8 : -8) : 0),
      duration: action ? 170 : 700,
      yoyo: true,
      repeat: action ? 0 : -1,
      ease: action ? "Quad.easeOut" : "Sine.easeInOut"
    });
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
          x: WIDTH / 2 + (unitX - unitY) * 265,
          y: 326 + (unitX + unitY) * 75
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

function drawProductionFortressBackdrop(
  graphics: Phaser.GameObjects.Graphics
): void {
  graphics.fillStyle(0x050708, 1);
  graphics.fillRect(0, 0, WIDTH, HEIGHT);
  graphics.fillStyle(0x172128, 1);
  graphics.fillRect(105, 48, 750, 287);
  graphics.fillStyle(0x0a1014, 1);
  graphics.fillEllipse(480, 153, 316, 264);
  graphics.fillRect(322, 153, 316, 185);
  graphics.fillStyle(0x202e35, 1);
  graphics.fillEllipse(480, 168, 244, 215);
  graphics.fillRect(358, 168, 244, 167);
  graphics.fillStyle(0x05090b, 1);
  graphics.fillEllipse(480, 182, 164, 164);
  graphics.fillRect(398, 182, 164, 154);
  graphics.fillStyle(0x3b2720, 0.9);
  graphics.fillTriangle(410, 336, 480, 182, 550, 336);

  graphics.fillStyle(0x26343a, 1);
  graphics.fillPoints(
    [
      new Phaser.Math.Vector2(0, 0),
      new Phaser.Math.Vector2(245, 52),
      new Phaser.Math.Vector2(310, 337),
      new Phaser.Math.Vector2(0, 455)
    ],
    true
  );
  graphics.fillPoints(
    [
      new Phaser.Math.Vector2(WIDTH, 0),
      new Phaser.Math.Vector2(715, 52),
      new Phaser.Math.Vector2(650, 337),
      new Phaser.Math.Vector2(WIDTH, 455)
    ],
    true
  );
  for (let y = 68; y < 320; y += 34) {
    graphics.lineStyle(2, 0x111a1e, 0.9);
    graphics.lineBetween(88, y, 286, y + 20);
    graphics.lineBetween(674, y + 20, 872, y);
  }
  graphics.lineStyle(13, 0x4b3424, 1);
  graphics.lineBetween(112, 47, 292, 336);
  graphics.lineBetween(848, 47, 668, 336);
  graphics.lineStyle(4, 0x8a5c30, 0.65);
  graphics.lineBetween(117, 47, 297, 334);
  graphics.lineBetween(843, 47, 663, 334);

  graphics.fillStyle(0x2d3b40, 1);
  graphics.fillPoints(
    [
      new Phaser.Math.Vector2(309, 330),
      new Phaser.Math.Vector2(651, 330),
      new Phaser.Math.Vector2(930, 540),
      new Phaser.Math.Vector2(30, 540)
    ],
    true
  );
  graphics.fillStyle(0x39484c, 1);
  graphics.fillPoints(
    [
      new Phaser.Math.Vector2(410, 330),
      new Phaser.Math.Vector2(550, 330),
      new Phaser.Math.Vector2(690, 540),
      new Phaser.Math.Vector2(270, 540)
    ],
    true
  );
  graphics.lineStyle(3, 0x1b282d, 0.9);
  for (let y = 352; y < 540; y += 35) {
    const spread = (y - 315) * 1.45;
    graphics.lineBetween(480 - spread, y, 480 + spread, y);
  }
  for (const x of [335, 405, 480, 555, 625])
    graphics.lineBetween(480, 330, x, 540);
  graphics.lineStyle(7, 0x111719, 1);
  graphics.lineBetween(444, 332, 356, 540);
  graphics.lineBetween(516, 332, 604, 540);
  graphics.lineStyle(3, 0x7b8584, 0.8);
  graphics.lineBetween(444, 332, 356, 540);
  graphics.lineBetween(516, 332, 604, 540);
  for (let y = 350; y < 536; y += 30) {
    const inset = (y - 330) * 0.43;
    graphics.lineBetween(444 - inset, y, 516 + inset, y);
  }

  for (const [x, side] of [
    [242, -1],
    [718, 1]
  ] as const) {
    graphics.fillStyle(0xc86b24, 0.13);
    graphics.fillTriangle(x, 184, x + side * 160, 360, x - side * 34, 360);
    graphics.fillStyle(0xf4a43e, 0.24);
    graphics.fillTriangle(x, 187, x + side * 76, 326, x - side * 20, 326);
    graphics.fillStyle(0x4d2f1d, 1);
    graphics.fillRect(x - 5, 186, 10, 49);
    graphics.fillStyle(0xffd269, 1);
    graphics.fillTriangle(x, 165, x - 10, 193, x + 10, 193);
    graphics.fillStyle(0xfff0a3, 1);
    graphics.fillTriangle(x, 174, x - 4, 191, x + 5, 191);
  }
  graphics.fillStyle(0x111719, 1);
  for (let x = 414; x <= 546; x += 22) graphics.fillRect(x, 235, 7, 101);
  graphics.fillStyle(0x683326, 1);
  graphics.fillTriangle(284, 106, 347, 119, 316, 225);
  graphics.fillTriangle(676, 106, 613, 119, 644, 225);
  graphics.lineStyle(8, 0x6a7476, 1);
  graphics.lineBetween(319, 335, 641, 335);
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
  drawProductionFortressBackdrop(graphics);

  const orderedEntities = [...primitives.entities].sort((left, right) =>
    left.y === right.y ? compareRenderIds(left.id, right.id) : left.y - right.y
  );
  const changedIds = new Set([
    ...(feedback?.arrivals.map((entity) => entity.id) ?? []),
    ...(feedback?.departures.map((entity) => entity.id) ?? [])
  ]);
  for (const entity of orderedEntities) {
    if (entity.faction === undefined) continue;
    drawEntity(
      scene,
      { ...entity, faction: entity.faction },
      direction === "stylized-depth" ? 1.22 : 1,
      changedIds.has(entity.id),
      reduceMotion
    );
  }

  if (feedback !== undefined) {
    const transient = scene.add.graphics();
    transient.lineStyle(4, feedback.terminal ? 0xf4ead5 : 0xf0c66f, 1);
    for (const entity of primitives.entities)
      if (changedIds.has(entity.id))
        transient.strokeCircle(entity.x, entity.y - 5, 34);
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

  // Near pillars and rock planes pass in front of combatants, proving the
  // deterministic scene order can support architectural occlusion.
  const foreground = scene.add.graphics();
  foreground.fillStyle(0x0a0e10, 1);
  foreground.fillTriangle(0, HEIGHT, 0, 335, 168, HEIGHT);
  foreground.fillTriangle(WIDTH, HEIGHT, WIDTH, 322, 790, HEIGHT);
  foreground.fillStyle(0x293338, 1);
  foreground.fillRect(58, 238, 43, 302);
  foreground.fillRect(859, 225, 43, 315);
  foreground.fillStyle(0x536064, 1);
  foreground.fillRect(49, 233, 61, 18);
  foreground.fillRect(850, 220, 61, 18);
  foreground.lineStyle(5, 0x151b1e, 1);
  foreground.lineBetween(82, 0, 82, 238);
  foreground.lineBetween(881, 0, 881, 225);
  for (const y of [60, 100, 140]) {
    foreground.fillStyle(0x4d5556, 1);
    foreground.fillCircle(82, y, 8);
    foreground.fillCircle(881, y + 8, 8);
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
  scene.add.text(32, 28, "SHUTTERGATE HALL", {
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
  const direction: BattlefieldDirection = "stylized-depth";
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
  }, [reduceMotion, snapshot]);

  return (
    <figure className="battlefield">
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
          >
            {" "}
            {feedback.summary}
          </span>
        )}
      </figcaption>
    </figure>
  );
}
