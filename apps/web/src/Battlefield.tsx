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

const WIDTH = 1280;
const HEIGHT = 720;
const PADDING = 96;
const FIXTURE_ID = "scenarios/conformance/shuttergate-web-truth.json";

const environmentUrl = new URL(
  "../../../assets/game-art/layered-map-poc/blender/outputs/environment-base.png",
  import.meta.url
).href;
const entranceShellUrl = new URL(
  "../../../assets/game-art/layered-map-poc/blender/outputs/entrance-shell.png",
  import.meta.url
).href;
const wardenUrl = new URL(
  "../../../assets/game-art/production-scene/exports/entities/iron-warden-idle.png",
  import.meta.url
).href;
const raiderUrl = new URL(
  "../../../assets/game-art/production-scene/exports/entities/mine-raider-idle.png",
  import.meta.url
).href;

const SHUTTERGATE_NODE_POSITIONS: Readonly<
  Record<string, { readonly x: number; readonly y: number }>
> = {
  "node.shuttergate_west_entry": { x: 1054, y: 302 },
  "node.shuttergate_west_hall": { x: 838, y: 330 },
  "node.shuttergate_east_entry": { x: 1054, y: 302 },
  "node.shuttergate_east_hall": { x: 838, y: 330 },
  "node.shuttergate_gate": { x: 1060, y: 200 },
  "node.shuttergate_north_guard": { x: 605, y: 320 },
  "node.shuttergate_keep": { x: 432, y: 402 },
  "node.shuttergate_keep_guard": { x: 364, y: 476 }
};

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

export interface TruthScreenSidecar {
  readonly schemaVersion: 1;
  readonly captureReady: boolean;
  readonly fixtureId: string;
  readonly viewport: readonly [1440, 900];
  readonly frame: readonly [1280, 720];
  readonly snapshot: {
    readonly levelId: string;
    readonly mapId: string | null;
    readonly tick: number;
    readonly phase: RenderSnapshot["phase"];
  };
  readonly registry: {
    readonly dwarfCount: number;
    readonly hostileCount: number;
    readonly totalCount: number;
    readonly entities: readonly {
      readonly id: string;
      readonly faction: RenderEntity["faction"];
      readonly nodeId: string;
      readonly x: number;
      readonly y: number;
      readonly nominalHeight: number;
    }[];
  };
  readonly occlusion: {
    readonly artifactId: "entrance-shell";
    readonly layerOrder: readonly string[];
    readonly clips: readonly ["world-ring", "world-effect", "world-subject"];
    readonly exempts: readonly ["screen-focus-indicator", "hud"];
  };
  readonly alignment: {
    readonly snapshotCount: number;
    readonly registryCount: number;
    readonly exactlyOneWardenAndOneHostile: boolean;
    readonly valid: boolean;
  };
}

declare global {
  interface Window {
    __DWARVEN_DEPTHS_TRUTH_SCREEN__?: TruthScreenSidecar;
  }
}

function authoredPosition(
  snapshot: RenderSnapshot,
  id: string,
  fallback: { readonly x: number; readonly y: number }
): { readonly x: number; readonly y: number } {
  return snapshot.mapId === "map.shuttergate_hall"
    ? (SHUTTERGATE_NODE_POSITIONS[id] ?? fallback)
    : fallback;
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
    ...authoredPosition(snapshot, node.id, project(node.x, node.y))
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

export function buildTruthScreenSidecar(
  snapshot: RenderSnapshot,
  primitives: BattlefieldPrimitives
): TruthScreenSidecar {
  const byId = new Map(snapshot.entities.map((entity) => [entity.id, entity]));
  const entities = primitives.entities.flatMap((primitive) => {
    const entity = byId.get(primitive.id);
    if (entity === undefined) return [];
    return [
      {
        id: entity.id,
        faction: entity.faction,
        nodeId: entity.nodeId,
        x: Math.round(primitive.x),
        y: Math.round(primitive.y),
        nominalHeight:
          entity.faction === "dwarf" ? 56 : entity.faction === "enemy" ? 44 : 0
      }
    ];
  });
  const dwarfCount = entities.filter(
    ({ faction }) => faction === "dwarf"
  ).length;
  const hostileCount = entities.filter(
    ({ faction }) => faction === "enemy"
  ).length;
  const exactlyOneWardenAndOneHostile = dwarfCount === 1 && hostileCount === 1;
  return {
    schemaVersion: 1,
    captureReady: true,
    fixtureId: FIXTURE_ID,
    viewport: [1440, 900],
    frame: [WIDTH, HEIGHT],
    snapshot: {
      levelId: snapshot.levelId,
      mapId: snapshot.mapId,
      tick: snapshot.tick,
      phase: snapshot.phase
    },
    registry: {
      dwarfCount,
      hostileCount,
      totalCount: entities.length,
      entities
    },
    occlusion: {
      artifactId: "entrance-shell",
      layerOrder: [
        "environment-base",
        "world-rings",
        "world-effects",
        "world-subjects",
        "entrance-shell",
        "screen-focus-indicators",
        "hud"
      ],
      clips: ["world-ring", "world-effect", "world-subject"],
      exempts: ["screen-focus-indicator", "hud"]
    },
    alignment: {
      snapshotCount: snapshot.entities.length,
      registryCount: entities.length,
      exactlyOneWardenAndOneHostile,
      valid:
        snapshot.entities.length === entities.length &&
        exactlyOneWardenAndOneHostile
    }
  };
}

function normalizeAlphaTexture(
  scene: Phaser.Scene,
  sourceKey: string,
  outputKey: string
): string {
  if (scene.textures.exists(outputKey)) return outputKey;
  const source = scene.textures.get(sourceKey).getSourceImage() as
    | HTMLImageElement
    | HTMLCanvasElement;
  const texture = scene.textures.createCanvas(
    outputKey,
    source.width,
    source.height
  );
  if (texture === null) return sourceKey;
  const context = texture.context;
  context.clearRect(0, 0, source.width, source.height);
  context.drawImage(source, 0, 0);
  const pixels = context.getImageData(0, 0, source.width, source.height);
  for (let index = 3; index < pixels.data.length; index += 4)
    pixels.data[index] = Math.min(255, (pixels.data[index] ?? 0) * 4);
  context.putImageData(pixels, 0, 0);
  texture.refresh();
  return outputKey;
}

function drawBattlefield(
  scene: Phaser.Scene,
  snapshot: RenderSnapshot,
  feedback: CombatFeedback | undefined,
  reduceMotion: boolean,
  _previousSnapshot: RenderSnapshot | undefined
): void {
  scene.children.removeAll();
  scene.add.image(WIDTH / 2, HEIGHT / 2, "environment-base");

  const primitives = buildBattlefieldPrimitives(snapshot);
  const world = scene.add.graphics();
  for (const entity of primitives.entities) {
    if (entity.faction === "dwarf") {
      world.fillStyle(0x65b9df, 0.32);
      world.fillEllipse(entity.x, entity.y - 2, 72, 26);
      world.lineStyle(3, 0xaee9ff, 0.9);
      world.strokeEllipse(entity.x, entity.y - 2, 72, 26);
    } else if (entity.faction === "enemy") {
      world.fillStyle(0xa92720, 0.3);
      world.fillEllipse(entity.x, entity.y - 1, 58, 20);
      world.lineStyle(3, 0xff725f, 0.95);
      world.strokeEllipse(entity.x, entity.y - 1, 58, 20);
    }
  }

  const wardenTexture = normalizeAlphaTexture(
    scene,
    "warden-source",
    "warden-runtime"
  );
  const raiderTexture = normalizeAlphaTexture(
    scene,
    "raider-source",
    "raider-runtime"
  );
  for (const entity of [...primitives.entities].sort(
    (left, right) => left.y - right.y
  )) {
    if (entity.faction === "dwarf")
      scene.add
        .image(entity.x, entity.y, wardenTexture)
        .setOrigin(56 / 112, 66 / 72);
    else if (entity.faction === "enemy")
      scene.add
        .image(entity.x, entity.y, raiderTexture)
        .setOrigin(40 / 80, 54 / 60);
  }

  if (feedback !== undefined && !reduceMotion) {
    const transient = scene.add.graphics();
    transient.lineStyle(4, feedback.terminal ? 0xf4ead5 : 0xf0c66f, 0.95);
    for (const entity of primitives.entities)
      if (
        feedback.arrivals.some(({ id }) => id === entity.id) ||
        feedback.departures.some(({ id }) => id === entity.id)
      )
        transient.strokeEllipse(entity.x, entity.y - 12, 88, 50);
    scene.tweens.add({
      targets: transient,
      alpha: 0.15,
      duration: 420,
      yoyo: true,
      repeat: 1
    });
  }

  // Renderer-native shared-camera architecture is deliberately composited
  // after subjects/rings so the entrance clips all world-space presentation.
  scene.add.image(WIDTH / 2, HEIGHT / 2, "entrance-shell");

  // This screen-space focus indicator is intentionally exempt from occlusion.
  const selectedWarden = primitives.entities.find(
    ({ faction }) => faction === "dwarf"
  );
  if (selectedWarden !== undefined) {
    const focus = scene.add.graphics();
    focus.lineStyle(2, 0xf3d78f, 0.9);
    focus.strokeRoundedRect(
      selectedWarden.x - 40,
      selectedWarden.y - 72,
      80,
      78,
      10
    );
  }

  if (typeof window !== "undefined")
    window.__DWARVEN_DEPTHS_TRUTH_SCREEN__ = buildTruthScreenSidecar(
      snapshot,
      primitives
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
    backgroundColor: "#080604",
    banner: false,
    audio: { noAudio: true },
    render: { antialias: true, pixelArt: false },
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    scene: {
      preload(this: Phaser.Scene) {
        this.load.image("environment-base", environmentUrl);
        this.load.image("entrance-shell", entranceShellUrl);
        this.load.image("warden-source", wardenUrl);
        this.load.image("raider-source", raiderUrl);
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
      if (typeof window !== "undefined")
        delete window.__DWARVEN_DEPTHS_TRUTH_SCREEN__;
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
    <figure
      className="battlefield"
      data-fixture-id={FIXTURE_ID}
      data-simulation-tick={snapshot.tick}
      data-entity-count={snapshot.entities.length}
    >
      <div ref={parentRef} className="battlefield-canvas" aria-hidden="true" />
      <figcaption className="visually-hidden" aria-live="off">
        Shuttergate battlefield, {snapshot.phase}; {snapshot.entities.length}{" "}
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
