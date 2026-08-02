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
import {
  projectShuttergateOccupancyPoint,
  quantizeShuttergatePivot,
  SHUTTERGATE_NODE_POSITIONS
} from "./shuttergate-spatial.js";

const WIDTH = 1280;
const HEIGHT = 720;
const PADDING = 96;
const FIXTURE_ID = "scenarios/conformance/shuttergate-web-truth.json";
const textureAlphaMetricsCache = new Map<string, TextureAlphaMetrics>();

const environmentUrl = new URL(
  "../../../assets/game-art/layered-map-poc/blender/outputs/environment-base.png",
  import.meta.url
).href;
const entranceShellUrl = new URL(
  "../../../assets/game-art/layered-map-poc/blender/outputs/entrance-shell.png",
  import.meta.url
).href;
const entranceRouteForegroundUrl = new URL(
  "../../../assets/game-art/layered-map-poc/blender/outputs/entrance-route-foreground.png",
  import.meta.url
).href;
const entranceRouteGroundForegroundUrl = new URL(
  "../../../assets/game-art/layered-map-poc/blender/outputs/entrance-route-ground-foreground.png",
  import.meta.url
).href;
const entranceRouteRearUrl = new URL(
  "../../../assets/game-art/layered-map-poc/blender/outputs/entrance-route-rear.png",
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

interface TextureAlphaMetrics {
  readonly width: number;
  readonly height: number;
  readonly alphaBounds: readonly [number, number, number, number];
  readonly nonzeroAlphaPixels: number;
  readonly fullAlphaPixels: number;
  readonly partialAlphaPixels: number;
  readonly alpha: Uint8ClampedArray;
}

interface TruthVisualMetrics {
  readonly dwarf: TextureAlphaMetrics;
  readonly enemy: TextureAlphaMetrics;
  readonly groundForeground: TextureAlphaMetrics;
  readonly foreground: TextureAlphaMetrics;
  readonly rear: TextureAlphaMetrics;
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
      readonly canvasBounds: readonly [number, number, number, number];
      readonly alphaBounds: readonly [number, number, number, number];
      readonly nonzeroAlphaPixels: number;
      readonly fullAlphaPixels: number;
      readonly partialAlphaPixels: number;
      readonly intersectsUnobscuredWorldViewport: boolean;
    }[];
  };
  readonly occlusion: {
    readonly artifactId: "authored-entrance-depth";
    readonly layerOrder: readonly string[];
    readonly clips: readonly ["world-ring", "world-effect", "world-subject"];
    readonly exempts: readonly ["screen-focus-indicator", "hud"];
    readonly witness: {
      readonly entityId: string;
      readonly subjectAlphaPixels: number;
      readonly subjectPixelsOverRearArtifact: number;
      readonly subjectPixelsOverGroundArtifact: number;
      readonly subjectPixelsBehindForegroundArtifact: number;
      readonly worldRingPixelsBehindForegroundArtifact: number;
      readonly transientEffectPixelsBehindForegroundArtifact: number;
    };
    readonly depthResolution: {
      readonly intent: "rear-visible-and-foreground-occluded";
      readonly actualAnchor: readonly [number, number];
      readonly rearOverlapPixels: number;
      readonly subjectGroundOverlapPixels: number;
      readonly foregroundOcclusionPixels: number;
      readonly worldRingOcclusionPixels: number;
      readonly transientEffectOcclusionPixels: number;
    };
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
      const columnOffset = column - (columns - 1) / 2;
      const rowOffset = row - (rows - 1) / 2;
      const occupiedPosition =
        snapshot.mapId === "map.shuttergate_hall"
          ? quantizeShuttergatePivot(
              projectShuttergateOccupancyPoint(
                entity.nodeId,
                columnOffset,
                rowOffset
              )
            )
          : {
              x: position.x + columnOffset * 38,
              y: position.y + rowOffset * 38
            };
      return {
        id: entity.id,
        faction: entity.faction,
        ...occupiedPosition
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
  primitives: BattlefieldPrimitives,
  visualMetrics: TruthVisualMetrics
): TruthScreenSidecar {
  const byId = new Map(snapshot.entities.map((entity) => [entity.id, entity]));
  const entities = primitives.entities.flatMap((primitive) => {
    const entity = byId.get(primitive.id);
    if (
      entity === undefined ||
      (entity.faction !== "dwarf" && entity.faction !== "enemy")
    )
      return [];
    const source = visualMetrics[entity.faction];
    const pivotX = Math.round(source.width / 2);
    const pivotY = entity.faction === "dwarf" ? 66 : 54;
    const canvasLeft = Math.round(primitive.x - pivotX);
    const canvasTop = Math.round(primitive.y - pivotY);
    const alphaBounds = [
      canvasLeft + source.alphaBounds[0],
      canvasTop + source.alphaBounds[1],
      source.alphaBounds[2],
      source.alphaBounds[3]
    ] as const;
    return [
      {
        id: entity.id,
        faction: entity.faction,
        nodeId: entity.nodeId,
        x: Math.round(primitive.x),
        y: Math.round(primitive.y),
        nominalHeight: entity.faction === "dwarf" ? 56 : 44,
        canvasBounds: [
          canvasLeft,
          canvasTop,
          source.width,
          source.height
        ] as const,
        alphaBounds,
        nonzeroAlphaPixels: source.nonzeroAlphaPixels,
        fullAlphaPixels: source.fullAlphaPixels,
        partialAlphaPixels: source.partialAlphaPixels,
        intersectsUnobscuredWorldViewport:
          source.nonzeroAlphaPixels > 0 &&
          alphaBounds[0] < WIDTH &&
          alphaBounds[1] < HEIGHT &&
          alphaBounds[0] + alphaBounds[2] > 0 &&
          alphaBounds[1] + alphaBounds[3] > 0
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
  const hostile = entities.find(({ faction }) => faction === "enemy");
  const countEnemyArtifactOverlap = (
    artifact: TextureAlphaMetrics,
    canvasLeft: number,
    canvasTop: number
  ): number => {
    let overlap = 0;
    for (let y = 0; y < visualMetrics.enemy.height; y += 1) {
      for (let x = 0; x < visualMetrics.enemy.width; x += 1) {
        if (
          (visualMetrics.enemy.alpha[y * visualMetrics.enemy.width + x] ??
            0) === 0
        )
          continue;
        const worldX = canvasLeft + x;
        const worldY = canvasTop + y;
        if (
          worldX < 0 ||
          worldY < 0 ||
          worldX >= artifact.width ||
          worldY >= artifact.height
        )
          continue;
        if ((artifact.alpha[worldY * artifact.width + worldX] ?? 0) > 0)
          overlap += 1;
      }
    }
    return overlap;
  };
  const countEllipseArtifactOverlap = (
    artifacts: readonly TextureAlphaMetrics[],
    centerX: number,
    centerY: number,
    radiusX: number,
    radiusY: number,
    innerRadiusX = 0,
    innerRadiusY = 0
  ): number => {
    let overlap = 0;
    for (
      let y = Math.floor(centerY - radiusY);
      y <= centerY + radiusY;
      y += 1
    ) {
      for (
        let x = Math.floor(centerX - radiusX);
        x <= centerX + radiusX;
        x += 1
      ) {
        const outer =
          ((x - centerX) / radiusX) ** 2 + ((y - centerY) / radiusY) ** 2;
        if (outer > 1) continue;
        if (innerRadiusX > 0 && innerRadiusY > 0) {
          const inner =
            ((x - centerX) / innerRadiusX) ** 2 +
            ((y - centerY) / innerRadiusY) ** 2;
          if (inner < 1) continue;
        }
        if (
          x >= 0 &&
          y >= 0 &&
          artifacts.some(
            (artifact) =>
              x < artifact.width &&
              y < artifact.height &&
              (artifact.alpha[y * artifact.width + x] ?? 0) > 0
          )
        )
          overlap += 1;
      }
    }
    return overlap;
  };
  let rearOverlapPixels = 0;
  let subjectGroundOverlapPixels = 0;
  let foregroundOcclusionPixels = 0;
  let worldRingOcclusionPixels = 0;
  let transientEffectOcclusionPixels = 0;
  if (hostile !== undefined) {
    const [canvasLeft, canvasTop] = hostile.canvasBounds;
    rearOverlapPixels = countEnemyArtifactOverlap(
      visualMetrics.rear,
      canvasLeft,
      canvasTop
    );
    subjectGroundOverlapPixels = countEnemyArtifactOverlap(
      visualMetrics.groundForeground,
      canvasLeft,
      canvasTop
    );
    foregroundOcclusionPixels = countEnemyArtifactOverlap(
      visualMetrics.foreground,
      canvasLeft,
      canvasTop
    );
    worldRingOcclusionPixels = countEllipseArtifactOverlap(
      [visualMetrics.groundForeground, visualMetrics.foreground],
      hostile.x,
      hostile.y - 1,
      31,
      12
    );
    transientEffectOcclusionPixels = countEllipseArtifactOverlap(
      [visualMetrics.groundForeground, visualMetrics.foreground],
      hostile.x,
      hostile.y - 12,
      46,
      27,
      42,
      23
    );
  }
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
      artifactId: "authored-entrance-depth",
      layerOrder: [
        "environment-base-and-rear-architecture",
        "world-rings",
        "world-effects",
        "entrance-route-ground-foreground",
        "world-subjects",
        "entrance-shell",
        "entrance-route-foreground",
        "screen-focus-indicators",
        "hud"
      ],
      clips: ["world-ring", "world-effect", "world-subject"],
      exempts: ["screen-focus-indicator", "hud"],
      witness: {
        entityId: hostile?.id ?? "",
        subjectAlphaPixels: visualMetrics.enemy.nonzeroAlphaPixels,
        subjectPixelsOverRearArtifact: rearOverlapPixels,
        subjectPixelsOverGroundArtifact: subjectGroundOverlapPixels,
        subjectPixelsBehindForegroundArtifact: foregroundOcclusionPixels,
        worldRingPixelsBehindForegroundArtifact: worldRingOcclusionPixels,
        transientEffectPixelsBehindForegroundArtifact:
          transientEffectOcclusionPixels
      },
      depthResolution: {
        intent: "rear-visible-and-foreground-occluded",
        actualAnchor: [hostile?.x ?? 0, hostile?.y ?? 0],
        rearOverlapPixels,
        subjectGroundOverlapPixels,
        foregroundOcclusionPixels,
        worldRingOcclusionPixels,
        transientEffectOcclusionPixels
      }
    },
    alignment: {
      snapshotCount: snapshot.entities.length,
      registryCount: entities.length,
      exactlyOneWardenAndOneHostile,
      valid:
        snapshot.entities.length === entities.length &&
        exactlyOneWardenAndOneHostile &&
        entities.every(
          (entity) =>
            entity.nonzeroAlphaPixels > 0 &&
            entity.fullAlphaPixels * 5 >= entity.nonzeroAlphaPixels * 4 &&
            entity.intersectsUnobscuredWorldViewport
        ) &&
        rearOverlapPixels > 0 &&
        subjectGroundOverlapPixels > 0 &&
        foregroundOcclusionPixels > 0 &&
        worldRingOcclusionPixels > 0 &&
        transientEffectOcclusionPixels > 0
    }
  };
}

function measureTextureAlpha(
  scene: Phaser.Scene,
  textureKey: string
): TextureAlphaMetrics {
  const source = scene.textures.get(textureKey).getSourceImage() as
    | HTMLImageElement
    | HTMLCanvasElement;
  const cached = textureAlphaMetricsCache.get(textureKey);
  if (cached !== undefined) return cached;
  const canvas = document.createElement("canvas");
  canvas.width = source.width;
  canvas.height = source.height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (context === null)
    throw new Error(`unable to inspect texture alpha: ${textureKey}`);
  context.drawImage(source, 0, 0);
  const rgba = context.getImageData(0, 0, source.width, source.height).data;
  const alpha = new Uint8ClampedArray(source.width * source.height);
  let minimumX = source.width;
  let minimumY = source.height;
  let maximumX = -1;
  let maximumY = -1;
  let nonzeroAlphaPixels = 0;
  let fullAlphaPixels = 0;
  for (let y = 0; y < source.height; y += 1) {
    for (let x = 0; x < source.width; x += 1) {
      const value = rgba[(y * source.width + x) * 4 + 3] ?? 0;
      alpha[y * source.width + x] = value;
      if (value === 0) continue;
      nonzeroAlphaPixels += 1;
      if (value === 255) fullAlphaPixels += 1;
      minimumX = Math.min(minimumX, x);
      minimumY = Math.min(minimumY, y);
      maximumX = Math.max(maximumX, x);
      maximumY = Math.max(maximumY, y);
    }
  }
  const metrics: TextureAlphaMetrics = {
    width: source.width,
    height: source.height,
    alphaBounds:
      nonzeroAlphaPixels === 0
        ? [0, 0, 0, 0]
        : [
            minimumX,
            minimumY,
            maximumX - minimumX + 1,
            maximumY - minimumY + 1
          ],
    nonzeroAlphaPixels,
    fullAlphaPixels,
    partialAlphaPixels: nonzeroAlphaPixels - fullAlphaPixels,
    alpha
  };
  textureAlphaMetricsCache.set(textureKey, metrics);
  return metrics;
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
  for (let index = 3; index < pixels.data.length; index += 4) {
    const alpha = pixels.data[index] ?? 0;
    // Keep the original antialiased support, but make every interior pixel
    // fully opaque so backlighting cannot wash a combatant out.
    pixels.data[index] = alpha >= 16 ? 255 : alpha;
  }
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

  // Ground-level props cover rings/effects but remain beneath upright subjects.
  scene.add.image(WIDTH / 2, HEIGHT / 2, "entrance-route-ground-foreground");

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

  // Shared-camera authored foreground surfaces are depth-clipped against the
  // hostile billboard and composited after upright world subjects.
  scene.add.image(WIDTH / 2, HEIGHT / 2, "entrance-shell");
  scene.add.image(WIDTH / 2, HEIGHT / 2, "entrance-route-foreground");

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
      primitives,
      {
        dwarf: measureTextureAlpha(scene, wardenTexture),
        enemy: measureTextureAlpha(scene, raiderTexture),
        groundForeground: measureTextureAlpha(
          scene,
          "entrance-route-ground-foreground"
        ),
        foreground: measureTextureAlpha(scene, "entrance-route-foreground"),
        rear: measureTextureAlpha(scene, "entrance-route-rear")
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
    backgroundColor: "#080604",
    banner: false,
    audio: { noAudio: true },
    render: { antialias: true, pixelArt: false },
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    scene: {
      preload(this: Phaser.Scene) {
        this.load.image("environment-base", environmentUrl);
        this.load.image("entrance-shell", entranceShellUrl);
        this.load.image(
          "entrance-route-ground-foreground",
          entranceRouteGroundForegroundUrl
        );
        this.load.image(
          "entrance-route-foreground",
          entranceRouteForegroundUrl
        );
        this.load.image("entrance-route-rear", entranceRouteRearUrl);
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
