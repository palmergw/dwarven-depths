import Phaser from "phaser";
import { useEffect, useRef } from "react";
import type { RenderEntity, RenderSnapshot } from "./render-snapshot.js";

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
    left.id.localeCompare(right.id)
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
  return {
    nodes,
    connections: [...snapshot.connections]
      .sort((left, right) => left.id.localeCompare(right.id))
      .map((connection) => ({
        id: connection.id,
        fromId: connection.fromNodeId,
        toId: connection.toNodeId
      })),
    entities: [...snapshot.entities]
      .sort((left, right) => left.id.localeCompare(right.id))
      .map((entity) => {
        const position = positions.get(entity.nodeId);
        if (position === undefined)
          throw new Error(
            `render entity ${entity.id} references an unknown node`
          );
        return { ...position, id: entity.id, faction: entity.faction };
      })
  };
}

function drawBattlefield(scene: Phaser.Scene, snapshot: RenderSnapshot): void {
  scene.children.removeAll();
  const graphics = scene.add.graphics();
  graphics.fillStyle(0x17130f, 1);
  graphics.fillRect(0, 0, WIDTH, HEIGHT);
  graphics.lineStyle(3, 0x80683f, 1);
  graphics.strokeRoundedRect(16, 16, WIDTH - 32, HEIGHT - 32, 12);

  const primitives = buildBattlefieldPrimitives(snapshot);
  const nodes = new Map(primitives.nodes.map((node) => [node.id, node]));
  graphics.lineStyle(4, 0x80683f, 1);
  for (const connection of primitives.connections) {
    const from = nodes.get(connection.fromId);
    const to = nodes.get(connection.toId);
    if (from !== undefined && to !== undefined)
      graphics.lineBetween(from.x, from.y, to.x, to.y);
  }
  graphics.fillStyle(0xc5b695, 1);
  for (const node of primitives.nodes) graphics.fillCircle(node.x, node.y, 7);

  const colors = { dwarf: 0xe6b85c, enemy: 0xb94b42, deployable: 0x67a1b8 };
  const labels = { dwarf: "D", enemy: "E", deployable: "P" };
  for (const entity of primitives.entities) {
    if (entity.faction === undefined) continue;
    graphics.fillStyle(colors[entity.faction], 1);
    graphics.fillCircle(entity.x, entity.y, 15);
    scene.add
      .text(entity.x, entity.y, labels[entity.faction], {
        color: "#17130f",
        fontFamily: "sans-serif",
        fontSize: "16px",
        fontStyle: "bold"
      })
      .setOrigin(0.5);
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
  update(snapshot: RenderSnapshot): void;
  destroy(): void;
}

function createBattlefieldRenderer(
  parent: HTMLElement,
  initialSnapshot: RenderSnapshot
): BattlefieldRenderer {
  let snapshot = initialSnapshot;
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
        drawBattlefield(this, snapshot);
      }
    }
  });
  return {
    update(nextSnapshot) {
      snapshot = nextSnapshot;
      if (scene !== undefined) drawBattlefield(scene, snapshot);
    },
    destroy() {
      scene = undefined;
      game.destroy(true);
    }
  };
}

export function Battlefield({
  snapshot
}: {
  readonly snapshot: RenderSnapshot;
}) {
  const parentRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<BattlefieldRenderer | undefined>(undefined);
  const initialSnapshotRef = useRef(snapshot);

  useEffect(() => {
    const parent = parentRef.current;
    if (parent === null) return;
    const renderer = createBattlefieldRenderer(
      parent,
      initialSnapshotRef.current
    );
    rendererRef.current = renderer;
    return () => {
      renderer.destroy();
      rendererRef.current = undefined;
    };
  }, []);

  useEffect(() => rendererRef.current?.update(snapshot), [snapshot]);

  return (
    <figure className="battlefield">
      <div ref={parentRef} className="battlefield-canvas" aria-hidden="true" />
      <figcaption>
        Battlefield {snapshot.levelId}: {snapshot.phase} at tick {snapshot.tick}
        ; {snapshot.entities.length}{" "}
        {snapshot.entities.length === 1 ? "entity" : "entities"}.
      </figcaption>
    </figure>
  );
}
