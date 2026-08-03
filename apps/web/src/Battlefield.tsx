import Phaser from "phaser";
import { useEffect, useRef, useState } from "react";
import {
  BATTLEFIELD_ASSET_MANIFEST,
  BATTLEFIELD_LAYER_ORDER,
  type BattlefieldLayerId
} from "./battlefield-assets.js";
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
  clipPresentationPixels,
  decodeStaticSceneDepth,
  type PresentationDepthModel,
  type StaticSceneDepth,
  type StaticSceneDepthContract
} from "./shuttergate-depth.js";
import {
  projectShuttergateOccupants,
  SHUTTERGATE_GROUND_CAMERA_DEPTH_PER_PIXEL_X,
  SHUTTERGATE_GROUND_CAMERA_DEPTH_PER_PIXEL_Y,
  SHUTTERGATE_NODE_POSITIONS,
  SHUTTERGATE_SPATIAL_CONTRACT,
  SHUTTERGATE_UPRIGHT_CAMERA_DEPTH_PER_PIXEL_Y
} from "./shuttergate-spatial.js";

const WIDTH = 1280;
const HEIGHT = 720;
const PADDING = 96;
const INTERPOLATION_DURATION_MS = 180;
const MAX_POOLED_EFFECTS = 64;
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
const staticSceneDepthUrl = new URL(
  "../../../assets/game-art/layered-map-poc/blender/outputs/static-scene-depth.bin",
  import.meta.url
).href;
const battlefieldAssetUrls: Readonly<Record<string, string>> = {
  "environment-base": environmentUrl,
  "entrance-shell": entranceShellUrl,
  "entrance-route-ground-foreground": entranceRouteGroundForegroundUrl,
  "entrance-route-foreground": entranceRouteForegroundUrl,
  "entrance-route-rear": entranceRouteRearUrl,
  "warden-source": wardenUrl,
  "raider-source": raiderUrl,
  "static-scene-depth": staticSceneDepthUrl
};

export interface RenderPrimitive {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly faction?: RenderEntity["faction"];
  readonly cameraDepth?: number;
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

export function comparePresentationPrimitives(
  left: RenderPrimitive,
  right: RenderPrimitive
): number {
  if (left.cameraDepth !== undefined && right.cameraDepth !== undefined) {
    const depthOrder = right.cameraDepth - left.cameraDepth;
    if (depthOrder !== 0) return depthOrder;
  } else {
    const verticalOrder = left.y - right.y;
    if (verticalOrder !== 0) return verticalOrder;
  }
  return compareRenderIds(left.id, right.id);
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
    readonly clips: readonly [
      "world-ring",
      "world-effect",
      "world-subject",
      "world-focus"
    ];
    readonly exempts: readonly ["hud"];
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
    __DWARVEN_DEPTHS_RENDERER__?: BattlefieldRendererDiagnostics;
  }
}

export interface BattlefieldRendererDiagnostics {
  readonly schemaVersion: 1;
  readonly updateCount: number;
  readonly entityObjects: number;
  readonly pooledEffects: number;
  readonly activeEffects: number;
  readonly staticObjects: number;
  readonly sceneObjects: number;
  readonly runtimeTextures: number;
  readonly activeTweens: number;
  readonly timerEvents: number;
  readonly loaderListeners: number;
  readonly camera: {
    readonly frame: readonly [1280, 720];
    readonly scaleMode: "fit";
    readonly autoCenter: "both";
  };
  readonly layerOrder: typeof BATTLEFIELD_LAYER_ORDER;
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
  const shuttergateOccupants =
    snapshot.mapId === "map.shuttergate_hall"
      ? projectShuttergateOccupants(orderedEntities)
      : undefined;
  return {
    nodes,
    connections: [...snapshot.connections]
      .sort((left, right) => compareRenderIds(left.id, right.id))
      .map((connection) => ({
        id: connection.id,
        fromId: connection.fromNodeId,
        toId: connection.toNodeId
      })),
    entities: orderedEntities.map((entity, entityIndex) => {
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
        shuttergateOccupants !== undefined
          ? shuttergateOccupants[entityIndex]
          : {
              x: position.x + columnOffset * 38,
              y: position.y + rowOffset * 38
            };
      if (occupiedPosition === undefined)
        throw new Error(
          `missing Shuttergate occupant projection: ${entity.id}`
        );
      return {
        id: entity.id,
        faction: entity.faction,
        ...occupiedPosition
      };
    })
  };
}

export function buildInterpolationOrigins(
  snapshot: RenderSnapshot
): ReadonlyMap<string, RenderPrimitive> {
  if (snapshot.schemaVersion !== 2) return new Map();
  const previousSnapshot = {
    schemaVersion: 1,
    levelId: snapshot.levelId,
    mapId: snapshot.mapId,
    tick: snapshot.previousTick ?? snapshot.tick,
    phase: snapshot.phase,
    nodes: snapshot.nodes,
    connections: snapshot.connections,
    entities: snapshot.entities.map((entity) => ({
      id: entity.id,
      nodeId: entity.previousPosition?.nodeId ?? entity.nodeId,
      faction: entity.faction
    }))
  } as const;
  return new Map(
    buildBattlefieldPrimitives(previousSnapshot).entities.map((entity) => [
      entity.id,
      entity
    ])
  );
}

export function decodeBattlefieldDepthAsset(
  value: unknown
): StaticSceneDepth | undefined {
  if (!(value instanceof ArrayBuffer)) return undefined;
  try {
    return decodeStaticSceneDepth(
      value,
      SHUTTERGATE_SPATIAL_CONTRACT.staticDepth as unknown as StaticSceneDepthContract
    );
  } catch {
    return undefined;
  }
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
        "complete-static-scene-color",
        "depth-tested-world-rings",
        "depth-tested-world-effects",
        "depth-tested-world-subjects",
        "depth-tested-world-focus",
        "hud"
      ],
      clips: ["world-ring", "world-effect", "world-subject", "world-focus"],
      exempts: ["hud"],
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
function createDepthClippedPresentationTexture(
  scene: Phaser.Scene,
  sourceKey: string,
  outputKey: string,
  width: number,
  height: number,
  model: PresentationDepthModel,
  staticDepth: StaticSceneDepth
): string {
  const source = scene.textures.get(sourceKey).getSourceImage() as
    | HTMLImageElement
    | HTMLCanvasElement;
  if (scene.textures.exists(outputKey)) scene.textures.remove(outputKey);
  const texture = scene.textures.createCanvas(outputKey, width, height);
  if (texture === null)
    throw new Error(`unable to create depth-clipped texture: ${outputKey}`);
  const context = texture.context;
  context.clearRect(0, 0, width, height);
  context.drawImage(source, 0, 0, width, height);
  const pixels = context.getImageData(0, 0, width, height);
  pixels.data.set(
    clipPresentationPixels(
      pixels.data,
      width,
      height,
      staticDepth,
      model,
      SHUTTERGATE_SPATIAL_CONTRACT.staticDepth.maximumQuantizationError
    )
  );
  context.putImageData(pixels, 0, 0);
  texture.refresh();
  return outputKey;
}

function createDepthVisibilityMask(
  scene: Phaser.Scene,
  width: number,
  height: number,
  model: PresentationDepthModel,
  staticDepth: StaticSceneDepth
): Phaser.Display.Masks.GeometryMask {
  const opaque = new Uint8ClampedArray(width * height * 4);
  for (let index = 3; index < opaque.length; index += 4) opaque[index] = 255;
  const visible = clipPresentationPixels(
    opaque,
    width,
    height,
    staticDepth,
    model,
    SHUTTERGATE_SPATIAL_CONTRACT.staticDepth.maximumQuantizationError
  );
  const shape = scene.make.graphics({}, false);
  shape.fillStyle(0xffffff, 1);
  for (let y = 0; y < height; y += 1) {
    let runStart = -1;
    for (let x = 0; x <= width; x += 1) {
      const pixelVisible =
        x < width && (visible[(y * width + x) * 4 + 3] ?? 0) !== 0;
      if (pixelVisible && runStart < 0) runStart = x;
      if (!pixelVisible && runStart >= 0) {
        shape.fillRect(
          model.frameLeft + runStart,
          model.frameTop + y,
          x - runStart,
          1
        );
        runStart = -1;
      }
    }
  }
  return shape.createGeometryMask();
}

function addDepthTestedRing(
  scene: Phaser.Scene,
  entity: RenderPrimitive,
  staticDepth: StaticSceneDepth,
  existing?: Phaser.GameObjects.Graphics
): Phaser.GameObjects.Graphics | undefined {
  if (entity.faction === undefined) return undefined;
  const dwarf = entity.faction === "dwarf";
  const ellipseWidth = dwarf ? 72 : 58;
  const ellipseHeight = dwarf ? 26 : 20;
  const width = 80;
  const height = 40;
  const pivotX = width / 2;
  const centerYOffset = dwarf ? -2 : -1;
  const pivotY = height / 2;
  const frameLeft = Math.round(entity.x) - pivotX;
  const frameTop = Math.round(entity.y) - pivotY;
  const ring = existing ?? scene.add.graphics();
  ring.setPosition(0, 0);
  ring.clearMask(true);
  ring.clear();
  ring.fillStyle(dwarf ? 0x65b9df : 0xa92720, dwarf ? 0.32 : 0.3);
  ring.fillEllipse(
    entity.x,
    entity.y + centerYOffset,
    ellipseWidth,
    ellipseHeight
  );
  ring.lineStyle(3, dwarf ? 0xaee9ff : 0xff725f, dwarf ? 0.9 : 0.95);
  ring.strokeEllipse(
    entity.x,
    entity.y + centerYOffset,
    ellipseWidth,
    ellipseHeight
  );
  if (entity.cameraDepth !== undefined)
    ring.setMask(
      createDepthVisibilityMask(
        scene,
        width,
        height,
        {
          kind: "ground-plane",
          cameraDepth: entity.cameraDepth,
          cameraDepthPerPixelX: SHUTTERGATE_GROUND_CAMERA_DEPTH_PER_PIXEL_X,
          cameraDepthPerPixelY: SHUTTERGATE_GROUND_CAMERA_DEPTH_PER_PIXEL_Y,
          depthEdgeGuardPixels: 0,
          frameLeft,
          frameTop,
          pivotX,
          pivotY
        },
        staticDepth
      )
    );
  return ring;
}

function addDepthTestedEffect(
  scene: Phaser.Scene,
  entity: RenderPrimitive,
  feedback: CombatFeedback,
  staticDepth: StaticSceneDepth,
  existing?: Phaser.GameObjects.Graphics
): Phaser.GameObjects.Graphics | undefined {
  if (entity.cameraDepth === undefined) return undefined;
  const width = 100;
  const height = 60;
  const pivotX = width / 2;
  const pivotY = 42;
  const frameLeft = Math.round(entity.x) - pivotX;
  const frameTop = Math.round(entity.y) - pivotY;
  const effect = existing ?? scene.add.graphics();
  effect.clearMask(true);
  effect.clear();
  effect.setAlpha(1);
  effect.lineStyle(4, feedback.terminal ? 0xf4ead5 : 0xf0c66f, 0.95);
  effect.strokeEllipse(entity.x, entity.y - 12, 88, 50);
  effect.setMask(
    createDepthVisibilityMask(
      scene,
      width,
      height,
      {
        kind: "upright-billboard",
        cameraDepth: entity.cameraDepth,
        cameraDepthPerPixelY: SHUTTERGATE_UPRIGHT_CAMERA_DEPTH_PER_PIXEL_Y,
        depthEdgeGuardPixels: 1,
        frameLeft,
        frameTop,
        pivotY
      },
      staticDepth
    )
  );
  return effect;
}

function addDepthTestedFocus(
  scene: Phaser.Scene,
  entity: RenderPrimitive,
  staticDepth: StaticSceneDepth,
  existing?: Phaser.GameObjects.Graphics
): Phaser.GameObjects.Graphics {
  const width = 84;
  const height = 80;
  const pivotX = width / 2;
  const pivotY = 74;
  const frameLeft = Math.round(entity.x) - pivotX;
  const frameTop = Math.round(entity.y) - pivotY;
  const focus = existing ?? scene.add.graphics();
  focus.clearMask(true);
  focus.clear();
  focus.lineStyle(2, 0xf3d78f, 0.9);
  focus.strokeRoundedRect(entity.x - 40, entity.y - 72, 80, 78, 10);
  if (entity.cameraDepth !== undefined)
    focus.setMask(
      createDepthVisibilityMask(
        scene,
        width,
        height,
        {
          kind: "upright-billboard",
          cameraDepth: entity.cameraDepth,
          cameraDepthPerPixelY: SHUTTERGATE_UPRIGHT_CAMERA_DEPTH_PER_PIXEL_Y,
          depthEdgeGuardPixels: 1,
          frameLeft,
          frameTop,
          pivotY
        },
        staticDepth
      )
    );
  return focus;
}

function addDepthTestedBillboard(
  scene: Phaser.Scene,
  entity: RenderPrimitive,
  sourceKey: string,
  width: number,
  height: number,
  pivotX: number,
  pivotY: number,
  staticDepth: StaticSceneDepth,
  existing?: Phaser.GameObjects.Image
): Phaser.GameObjects.Image {
  if (entity.cameraDepth === undefined) {
    const image = existing ?? scene.add.image(entity.x, entity.y, sourceKey);
    return image
      .setTexture(sourceKey)
      .setPosition(entity.x, entity.y)
      .setOrigin(pivotX / width, pivotY / height);
  }
  const frameLeft = Math.round(entity.x) - pivotX;
  const frameTop = Math.round(entity.y) - pivotY;
  if (existing !== undefined) existing.setTexture(sourceKey);
  const texture = createDepthClippedPresentationTexture(
    scene,
    sourceKey,
    `subject-depth-${entity.id}`,
    width,
    height,
    {
      kind: "upright-billboard",
      cameraDepth: entity.cameraDepth,
      cameraDepthPerPixelY: SHUTTERGATE_UPRIGHT_CAMERA_DEPTH_PER_PIXEL_Y,
      depthEdgeGuardPixels: 1,
      frameLeft,
      frameTop,
      pivotY
    },
    staticDepth
  );
  const image = existing ?? scene.add.image(entity.x, entity.y, texture);
  return image
    .setTexture(texture)
    .setPosition(entity.x, entity.y)
    .setOrigin(pivotX / width, pivotY / height);
}

interface PersistentEntityObjects {
  readonly ring: Phaser.GameObjects.Graphics;
  readonly subject: Phaser.GameObjects.Image;
}

class PersistentBattlefieldScene {
  readonly layers: Record<
    BattlefieldLayerId,
    Set<Phaser.GameObjects.GameObject>
  >;
  readonly entities = new Map<string, PersistentEntityObjects>();
  readonly effects: Phaser.GameObjects.Graphics[] = [];
  focus: Phaser.GameObjects.Graphics | undefined;
  updateCount = 0;
  activeEffects = 0;
  lastInterpolatedTick: string | undefined;

  constructor(
    readonly scene: Phaser.Scene,
    readonly staticDepth: StaticSceneDepth
  ) {
    this.layers = Object.fromEntries(
      BATTLEFIELD_LAYER_ORDER.map((id) => [id, new Set()])
    ) as Record<BattlefieldLayerId, Set<Phaser.GameObjects.GameObject>>;
    this.layers.terrain.add(
      scene.add.image(WIDTH / 2, HEIGHT / 2, "environment-base")
    );
    this.layers["ground-foreground"].add(
      scene.add.image(WIDTH / 2, HEIGHT / 2, "entrance-route-ground-foreground")
    );
    this.layers.terrain.add(
      scene.add.image(WIDTH / 2, HEIGHT / 2, "entrance-shell")
    );
    this.layers.terrain.add(
      scene.add.image(WIDTH / 2, HEIGHT / 2, "entrance-route-foreground")
    );
  }

  private acquireEffect(index: number): Phaser.GameObjects.Graphics {
    const pooled = this.effects[index];
    if (pooled !== undefined) return pooled;
    const created = this.scene.add.graphics();
    this.layers["world-effects"].add(created);
    this.effects.push(created);
    return created;
  }

  private interpolateEntity(
    objects: PersistentEntityObjects,
    origin: RenderPrimitive,
    destination: RenderPrimitive
  ): void {
    const offsetX = origin.x - destination.x;
    const offsetY = origin.y - destination.y;
    if (offsetX === 0 && offsetY === 0) return;
    objects.ring.setPosition(offsetX, offsetY);
    objects.subject.setPosition(origin.x, origin.y);
    const ringMask = objects.ring.mask?.geometryMask;
    ringMask?.setPosition(offsetX, offsetY);
    this.scene.tweens.add({
      targets: objects.ring,
      x: 0,
      y: 0,
      duration: INTERPOLATION_DURATION_MS,
      ease: "Sine.Out"
    });
    if (ringMask !== undefined)
      this.scene.tweens.add({
        targets: ringMask,
        x: 0,
        y: 0,
        duration: INTERPOLATION_DURATION_MS,
        ease: "Sine.Out"
      });
    this.scene.tweens.add({
      targets: objects.subject,
      x: destination.x,
      y: destination.y,
      duration: INTERPOLATION_DURATION_MS,
      ease: "Sine.Out"
    });
  }

  update(
    snapshot: RenderSnapshot,
    feedback: CombatFeedback | undefined,
    reduceMotion: boolean,
    previousSnapshot: RenderSnapshot | undefined,
    evidenceEffectAlpha: number | undefined
  ): void {
    if (
      evidenceEffectAlpha !== undefined &&
      (!Number.isFinite(evidenceEffectAlpha) ||
        evidenceEffectAlpha < 0 ||
        evidenceEffectAlpha > 1)
    )
      throw new Error("invalid evidence effect alpha");
    this.updateCount += 1;
    const primitives = buildBattlefieldPrimitives(snapshot);
    const interpolationOrigins = buildInterpolationOrigins(snapshot);
    const interpolationTick =
      snapshot.schemaVersion === 2
        ? `${snapshot.scenarioId}:${snapshot.previousTick ?? "spawn"}:${snapshot.tick}`
        : undefined;
    const interpolate =
      !reduceMotion &&
      interpolationTick !== undefined &&
      interpolationTick !== this.lastInterpolatedTick;
    this.scene.tweens.killTweensOf(
      [...this.entities.values()].flatMap(({ ring, subject }) => {
        const mask = ring.mask?.geometryMask;
        return mask === undefined ? [ring, subject] : [ring, subject, mask];
      })
    );
    const orderedEntities = [...primitives.entities].sort(
      comparePresentationPrimitives
    );
    const liveIds = new Set(orderedEntities.map(({ id }) => id));
    for (const [id, objects] of this.entities)
      if (!liveIds.has(id)) {
        this.layers["world-rings"].delete(objects.ring);
        this.layers["world-entities"].delete(objects.subject);
        objects.ring.clearMask(true);
        objects.ring.destroy();
        objects.subject.setTexture("warden-runtime");
        objects.subject.destroy();
        const textureKey = `subject-depth-${id}`;
        if (this.scene.textures.exists(textureKey))
          this.scene.textures.remove(textureKey);
        this.entities.delete(id);
      }

    const wardenTexture = normalizeAlphaTexture(
      this.scene,
      "warden-source",
      "warden-runtime"
    );
    const raiderTexture = normalizeAlphaTexture(
      this.scene,
      "raider-source",
      "raider-runtime"
    );
    for (const entity of orderedEntities) {
      const existing = this.entities.get(entity.id);
      const ring = addDepthTestedRing(
        this.scene,
        entity,
        this.staticDepth,
        existing?.ring
      );
      if (ring === undefined) continue;
      if (existing === undefined) this.layers["world-rings"].add(ring);
      const dwarf = entity.faction === "dwarf";
      const subject = addDepthTestedBillboard(
        this.scene,
        entity,
        dwarf ? wardenTexture : raiderTexture,
        dwarf ? 112 : 80,
        dwarf ? 72 : 60,
        dwarf ? 56 : 40,
        dwarf ? 66 : 54,
        this.staticDepth,
        existing?.subject
      );
      if (existing === undefined) {
        this.layers["world-entities"].add(subject);
        this.entities.set(entity.id, { ring, subject });
      }
      const objects = this.entities.get(entity.id);
      const snapshotEntity =
        snapshot.schemaVersion === 2
          ? snapshot.entities.find(({ id }) => id === entity.id)
          : undefined;
      const origin = interpolationOrigins.get(entity.id);
      if (
        interpolate &&
        objects !== undefined &&
        snapshotEntity?.transition === "moving" &&
        origin !== undefined
      )
        this.interpolateEntity(objects, origin, entity);
    }
    if (interpolationTick !== undefined)
      this.lastInterpolatedTick = interpolationTick;

    this.scene.tweens.killTweensOf(this.effects);
    this.activeEffects = 0;
    if (feedback !== undefined && !reduceMotion) {
      const arrivalIds = new Set(feedback.arrivals.map(({ id }) => id));
      const effectEntities = [
        ...orderedEntities.filter(({ id }) => arrivalIds.has(id)),
        ...(previousSnapshot === undefined
          ? []
          : buildDepartureFeedbackPrimitives(previousSnapshot, feedback))
      ].sort(comparePresentationPrimitives);
      for (const entity of effectEntities) {
        if (this.activeEffects >= MAX_POOLED_EFFECTS) continue;
        const effect = addDepthTestedEffect(
          this.scene,
          entity,
          feedback,
          this.staticDepth,
          this.acquireEffect(this.activeEffects)
        );
        if (effect !== undefined) {
          effect.setVisible(true);
          this.activeEffects += 1;
        }
      }
    }
    for (
      let index = this.activeEffects;
      index < this.effects.length;
      index += 1
    ) {
      this.effects[index]?.clearMask(true);
      this.effects[index]?.setVisible(false);
    }
    const active = this.effects.slice(0, this.activeEffects);
    if (active.length > 0 && evidenceEffectAlpha === undefined)
      this.scene.tweens.add({
        targets: active,
        alpha: 0.15,
        duration: 420,
        yoyo: true,
        repeat: 1
      });
    else if (evidenceEffectAlpha !== undefined)
      for (const effect of active) effect.setAlpha(evidenceEffectAlpha);

    const selectedWarden = primitives.entities.find(
      ({ faction }) => faction === "dwarf"
    );
    if (selectedWarden === undefined) this.focus?.setVisible(false);
    else {
      this.focus = addDepthTestedFocus(
        this.scene,
        selectedWarden,
        this.staticDepth,
        this.focus
      ).setVisible(true);
      this.layers["world-focus"].add(this.focus);
    }

    for (const entity of orderedEntities) {
      const objects = this.entities.get(entity.id);
      if (objects !== undefined) this.scene.children.bringToTop(objects.ring);
    }
    for (const effect of active) this.scene.children.bringToTop(effect);
    for (const entity of orderedEntities) {
      const objects = this.entities.get(entity.id);
      if (objects !== undefined)
        this.scene.children.bringToTop(objects.subject);
    }
    if (this.focus?.visible === true)
      this.scene.children.bringToTop(this.focus);

    if (typeof window !== "undefined") {
      window.__DWARVEN_DEPTHS_TRUTH_SCREEN__ = buildTruthScreenSidecar(
        snapshot,
        primitives,
        {
          dwarf: measureTextureAlpha(this.scene, wardenTexture),
          enemy: measureTextureAlpha(this.scene, raiderTexture),
          groundForeground: measureTextureAlpha(
            this.scene,
            "entrance-route-ground-foreground"
          ),
          foreground: measureTextureAlpha(
            this.scene,
            "entrance-route-foreground"
          ),
          rear: measureTextureAlpha(this.scene, "entrance-route-rear")
        }
      );
      window.__DWARVEN_DEPTHS_RENDERER__ = this.diagnostics();
    }
  }

  diagnostics(): BattlefieldRendererDiagnostics {
    return {
      schemaVersion: 1,
      updateCount: this.updateCount,
      entityObjects:
        this.entities.size * 2 + (this.focus === undefined ? 0 : 1),
      pooledEffects: this.effects.length,
      activeEffects: this.activeEffects,
      staticObjects: 4,
      sceneObjects: this.scene.children.length,
      runtimeTextures: Object.keys(this.scene.textures.list).filter(
        (key) => key.endsWith("-runtime") || key.startsWith("subject-depth-")
      ).length,
      activeTweens: this.scene.tweens
        .getTweens()
        .filter((tween) => tween.isPlaying()).length,
      timerEvents: 0,
      loaderListeners: this.scene.load.listenerCount("loaderror"),
      camera: {
        frame: [WIDTH, HEIGHT],
        scaleMode: "fit",
        autoCenter: "both"
      },
      layerOrder: BATTLEFIELD_LAYER_ORDER
    };
  }

  destroy(): void {
    this.scene.tweens.killTweensOf(this.effects);
    for (const objects of this.entities.values()) {
      if (objects.ring.mask !== null)
        this.scene.tweens.killTweensOf(objects.ring.mask.geometryMask);
      this.scene.tweens.killTweensOf([objects.ring, objects.subject]);
      objects.ring.clearMask(true);
      objects.subject.setTexture("warden-runtime");
    }
    for (const effect of this.effects) effect.clearMask(true);
    this.focus?.clearMask(true);
    this.entities.clear();
    this.effects.length = 0;
    for (const layer of Object.values(this.layers)) layer.clear();
  }
}

interface BattlefieldRenderer {
  update(
    snapshot: RenderSnapshot,
    feedback: CombatFeedback | undefined,
    reduceMotion: boolean,
    previousSnapshot: RenderSnapshot | undefined,
    evidenceEffectAlpha: number | undefined
  ): void;
  destroy(): void;
}

function createBattlefieldRenderer(
  parent: HTMLElement,
  initialSnapshot: RenderSnapshot,
  initialFeedback: CombatFeedback | undefined,
  initialReduceMotion: boolean,
  initialEvidenceEffectAlpha: number | undefined
): BattlefieldRenderer {
  let snapshot = initialSnapshot;
  let feedback = initialFeedback;
  let reduceMotion = initialReduceMotion;
  let evidenceEffectAlpha = initialEvidenceEffectAlpha;
  let persistentScene: PersistentBattlefieldScene | undefined;
  const loadErrors = new Set<string>();
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
        this.load.on("loaderror", (file: { readonly key: string }) => {
          loadErrors.add(file.key);
        });
        for (const asset of BATTLEFIELD_ASSET_MANIFEST.assets) {
          const url = battlefieldAssetUrls[asset.key];
          if (url === undefined) {
            loadErrors.add(asset.key);
            continue;
          }
          if (asset.kind === "image") this.load.image(asset.key, url);
          else this.load.binary(asset.key, url);
        }
      },
      create(this: Phaser.Scene) {
        if (loadErrors.size > 0) {
          parent.setAttribute("data-renderer-error", "asset-load-failed");
          this.add
            .text(WIDTH / 2, HEIGHT / 2, "Battlefield assets failed to load.", {
              color: "#f4d7bd",
              fontFamily: "system-ui, sans-serif",
              fontSize: "24px"
            })
            .setOrigin(0.5);
          return;
        }
        const depthBuffer = this.cache.binary.get(
          "static-scene-depth"
        ) as unknown;
        const staticDepth = decodeBattlefieldDepthAsset(depthBuffer);
        if (staticDepth === undefined) {
          parent.setAttribute("data-renderer-error", "invalid-depth-asset");
          this.add
            .text(WIDTH / 2, HEIGHT / 2, "Battlefield depth data is invalid.", {
              color: "#f4d7bd",
              fontFamily: "system-ui, sans-serif",
              fontSize: "24px"
            })
            .setOrigin(0.5);
          return;
        }
        persistentScene = new PersistentBattlefieldScene(this, staticDepth);
        persistentScene.update(
          snapshot,
          feedback,
          reduceMotion,
          undefined,
          evidenceEffectAlpha
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
      nextEvidenceEffectAlpha
    ) {
      snapshot = nextSnapshot;
      feedback = nextFeedback;
      reduceMotion = nextReduceMotion;
      evidenceEffectAlpha = nextEvidenceEffectAlpha;
      persistentScene?.update(
        snapshot,
        feedback,
        reduceMotion,
        nextPreviousSnapshot,
        evidenceEffectAlpha
      );
    },
    destroy() {
      persistentScene?.destroy();
      persistentScene = undefined;
      game.destroy(true);
      parent.replaceChildren();
      parent.removeAttribute("data-renderer-error");
      if (typeof window !== "undefined") {
        delete window.__DWARVEN_DEPTHS_TRUTH_SCREEN__;
        delete window.__DWARVEN_DEPTHS_RENDERER__;
      }
    }
  };
}

export function Battlefield({
  snapshot,
  reduceMotion,
  soundEnabled,
  evidenceEffectAlpha
}: {
  readonly snapshot: RenderSnapshot;
  readonly reduceMotion: boolean;
  readonly soundEnabled: boolean;
  readonly evidenceEffectAlpha?: number;
}) {
  const parentRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<BattlefieldRenderer | undefined>(undefined);
  const latestSnapshotRef = useRef(snapshot);
  const latestFeedbackRef = useRef<CombatFeedback | undefined>(undefined);
  const latestReduceMotionRef = useRef(reduceMotion);
  const latestEvidenceEffectAlphaRef = useRef(evidenceEffectAlpha);
  const previousSnapshotRef = useRef<RenderSnapshot | undefined>(undefined);
  const soundPlayerRef = useRef<CombatSoundPlayer | undefined>(undefined);
  const [feedback, setFeedback] = useState<CombatFeedback | undefined>();
  latestSnapshotRef.current = snapshot;
  latestReduceMotionRef.current = reduceMotion;
  latestEvidenceEffectAlphaRef.current = evidenceEffectAlpha;

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
        latestEvidenceEffectAlphaRef.current
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
    const renderedFeedback =
      evidenceEffectAlpha !== undefined && nextFeedback === undefined
        ? latestFeedbackRef.current
        : nextFeedback;
    if (
      previousSnapshot === undefined ||
      isCombatFeedbackProgression(previousSnapshot, snapshot)
    )
      previousSnapshotRef.current = snapshot;
    latestFeedbackRef.current = renderedFeedback;
    setFeedback(nextFeedback);
    rendererRef.current?.update(
      snapshot,
      renderedFeedback,
      reduceMotion,
      previousSnapshot,
      evidenceEffectAlpha
    );
    if (nextFeedback !== undefined) soundPlayerRef.current?.play(nextFeedback);
  }, [evidenceEffectAlpha, reduceMotion, snapshot]);

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
