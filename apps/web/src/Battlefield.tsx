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

export function buildDepartureFeedbackPrimitives(
  previousSnapshot: RenderSnapshot,
  feedback: CombatFeedback
): readonly RenderPrimitive[] {
  const departureIds = new Set(feedback.departures.map((entity) => entity.id));
  return buildBattlefieldPrimitives(previousSnapshot).entities.filter(
    (entity) => departureIds.has(entity.id)
  );
}

const assetRoot = "/assets/visual-prototype";

function drawStonework(graphics: Phaser.GameObjects.Graphics): void {
  graphics.fillStyle(0x101519, 1);
  graphics.fillRect(0, 0, WIDTH, HEIGHT);
  graphics.fillStyle(0x293037, 1);
  graphics.fillRect(0, 35, WIDTH, 245);
  for (let row = 0; row < 7; row += 1) {
    const y = 38 + row * 34;
    const offset = row % 2 === 0 ? -24 : 0;
    for (let x = offset; x < WIDTH; x += 64) {
      const shade = (row + x / 64) % 3 === 0 ? 0x354047 : 0x30383e;
      graphics.fillStyle(shade, 1);
      graphics.fillRect(x + 2, y + 2, 59, 29);
      graphics.fillStyle(0x20272c, 1);
      graphics.fillRect(x + 2, y + 28, 59, 3);
    }
  }

  graphics.fillStyle(0x151a1e, 1);
  graphics.fillRect(220, 54, 244, 186);
  graphics.fillCircle(342, 61, 122);
  graphics.fillStyle(0x0a0d10, 1);
  graphics.fillRect(244, 80, 196, 160);
  graphics.fillCircle(342, 82, 98);

  graphics.fillStyle(0x3a2d23, 1);
  graphics.fillRect(0, 235, WIDTH, 62);
  graphics.fillStyle(0x574431, 1);
  for (let x = 0; x < WIDTH; x += 52) graphics.fillRect(x, 239, 47, 12);
  graphics.fillStyle(0x1b2023, 1);
  graphics.fillRect(0, 271, WIDTH, 26);
  graphics.fillStyle(0x667079, 1);
  graphics.fillRect(0, 271, WIDTH, 4);

  graphics.fillStyle(0x211b17, 1);
  graphics.fillRect(0, 297, WIDTH, 63);
  graphics.fillStyle(0x382b22, 1);
  graphics.fillPoints(
    [
      new Phaser.Math.Vector2(0, 330),
      new Phaser.Math.Vector2(95, 303),
      new Phaser.Math.Vector2(182, 339),
      new Phaser.Math.Vector2(276, 309),
      new Phaser.Math.Vector2(382, 340),
      new Phaser.Math.Vector2(494, 305),
      new Phaser.Math.Vector2(640, 334),
      new Phaser.Math.Vector2(640, 360),
      new Phaser.Math.Vector2(0, 360)
    ],
    true
  );
}

function drawDeployable(
  graphics: Phaser.GameObjects.Graphics,
  x: number,
  y: number
): void {
  graphics.fillStyle(0x27343a, 1);
  graphics.fillRect(x - 15, y - 22, 30, 31);
  graphics.fillStyle(0x82a9b5, 1);
  graphics.fillRect(x - 11, y - 18, 22, 7);
  graphics.fillRect(x - 4, y - 28, 8, 42);
  graphics.fillStyle(0xd8b35e, 1);
  graphics.fillRect(x - 4, y - 17, 8, 8);
}

function drawBattlefield(
  scene: Phaser.Scene,
  snapshot: RenderSnapshot,
  feedback: CombatFeedback | undefined,
  reduceMotion: boolean,
  previousSnapshot: RenderSnapshot | undefined
): void {
  scene.children.removeAll();
  const graphics = scene.add.graphics();
  drawStonework(graphics);

  scene.add.image(184, 184, "timber-gate").setScale(1.25, 2.05);
  scene.add.image(500, 184, "timber-gate").setScale(1.25, 2.05);
  scene.add.image(88, 154, "torch");
  scene.add.image(566, 154, "torch");

  const glow = scene.add.graphics();
  glow.fillStyle(0xf09a38, 0.09);
  glow.fillCircle(88, 135, 82);
  glow.fillCircle(566, 135, 82);

  const primitives = buildBattlefieldPrimitives(snapshot);
  for (const [index, entity] of primitives.entities.entries()) {
    if (entity.faction === undefined) continue;
    const laneX = Phaser.Math.Clamp(entity.x, 118, 548);
    const laneY = 255 - (index % 2) * 9;
    if (entity.faction === "deployable") drawDeployable(graphics, laneX, laneY);
    else
      scene.add
        .image(
          laneX,
          laneY - (entity.faction === "dwarf" ? 24 : 18),
          entity.faction === "dwarf" ? "iron-warden" : "cave-raider"
        )
        .setOrigin(0.5, 1);
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
        transient.strokeRect(
          Phaser.Math.Clamp(entity.x, 118, 548) - 23,
          199,
          46,
          58
        );
    if (previousSnapshot !== undefined)
      for (const entity of buildDepartureFeedbackPrimitives(
        previousSnapshot,
        feedback
      ))
        transient.strokeRect(
          Phaser.Math.Clamp(entity.x, 118, 548) - 21,
          201,
          42,
          54
        );
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
  graphics.fillStyle(0x120f0d, 0.96);
  graphics.fillRect(18, 16, 210, 42);
  graphics.lineStyle(2, 0x9b7240, 1);
  graphics.strokeRect(18, 16, 210, 42);
  scene.add.text(30, 23, "SHUTTERGATE HALL", {
    color: "#f2d28a",
    fontFamily: "Georgia, serif",
    fontSize: "15px",
    fontStyle: "bold"
  });
  scene.add.text(
    30,
    42,
    snapshot.phase === "running" ? "THE GATE IS BESIEGED" : "HOLD THE GATE",
    {
      color: "#c7b99d",
      fontFamily: "monospace",
      fontSize: "9px"
    }
  );
  graphics.fillStyle(0x120f0d, 0.96);
  graphics.fillRect(482, 17, 140, 40);
  graphics.strokeRect(482, 17, 140, 40);
  scene.add.text(
    494,
    25,
    snapshot.phase === "running" ? "GATE  •  HOLDING" : "GATE  •  SECURE",
    {
      color: "#f4ead5",
      fontFamily: "monospace",
      fontSize: "13px"
    }
  );
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
      preload(this: Phaser.Scene) {
        this.load.svg("iron-warden", `${assetRoot}/iron-warden.svg`);
        this.load.svg("cave-raider", `${assetRoot}/cave-raider.svg`);
        this.load.svg("timber-gate", `${assetRoot}/timber-gate.svg`);
        this.load.svg("torch", `${assetRoot}/torch.svg`);
      },
      create(this: Phaser.Scene) {
        scene = this;
        drawBattlefield(
          this,
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
      if (scene !== undefined)
        drawBattlefield(
          scene,
          snapshot,
          feedback,
          reduceMotion,
          previousSnapshot
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
        Shuttergate Hall:{" "}
        {snapshot.phase === "running" ? "battle in progress" : snapshot.phase};{" "}
        {snapshot.entities.length}{" "}
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
