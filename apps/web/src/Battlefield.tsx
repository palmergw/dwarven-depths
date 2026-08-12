import Phaser from "phaser";
import { useEffect, useRef, useState } from "react";
import {
  BATTLEFIELD_LAYER_ORDER,
  BATTLEFIELD_RUNTIME_ASSET_KEYS,
  type BattlefieldLayerId
} from "./battlefield-layers.js";
import {
  type CombatFeedback,
  type CombatSoundPlayer,
  createCombatSoundPlayer,
  deriveCombatFeedback,
  shouldAdvanceCombatFeedbackBaseline
} from "./combat-feedback.js";
import {
  compareRenderIds,
  type RenderEntity,
  type RenderSnapshot
} from "./render-snapshot.js";
import {
  clipPresentationPixels,
  decodeStaticSceneDepth,
  decodeStaticSceneDepthPixels,
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
const INTERPOLATION_SPEED_PIXELS_PER_MILLISECOND = 0.9;
const DEPARTURE_DURATION_MS = 720;
const DAMAGE_SIGNAL_DURATION_MS = 280;
const MAX_POOLED_EFFECTS = 64;
const FIXTURE_ID = "scenarios/conformance/shuttergate-web-truth.json";

export function interpolationDistanceForFrame(
  deltaMilliseconds: number,
  simulationSpeed: 1 | 2
): number {
  return (
    Math.max(0, deltaMilliseconds) *
    INTERPOLATION_SPEED_PIXELS_PER_MILLISECOND *
    simulationSpeed
  );
}
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
const combatAnimationModules = import.meta.glob<string>(
  "../../../assets/game-art/combat-animation/exports/entities/*.png",
  { eager: true, import: "default", query: "?url" }
);

function combatAnimationAssetUrl(filename: string): string {
  const path = `../../../assets/game-art/combat-animation/exports/entities/${filename}`;
  const url = combatAnimationModules[path];
  if (url === undefined)
    throw new Error(`missing combat animation asset: ${path}`);
  return url;
}
const hostileDirectionalAssetUrls = Object.fromEntries(
  [
    ["raider", "goblin-cutter"],
    ["slinger", "goblin-slinger"],
    ["bulwark", "goblin-bulwark"],
    ["captain", "gatebreaker-captain"]
  ].flatMap(([key, filename]) =>
    (
      [
        ["north", "n"],
        ["east", "e"],
        ["west", "w"]
      ] as const
    ).map(([facing, suffix]) => [
      `${key}-${facing}-source`,
      combatAnimationAssetUrl(`${filename}-idle-${suffix}.png`)
    ])
  )
);
const warmLightOverlayUrl = new URL(
  "../../../assets/game-art/production-scene/exports/lighting/warm-light-overlay.png",
  import.meta.url
).href;
const hostileFactionRingUrl = new URL(
  "../../../assets/game-art/production-scene/exports/effects/hostile-faction-ring.png",
  import.meta.url
).href;
const shieldSlamImpactUrl = new URL(
  "../../../assets/game-art/production-scene/exports/effects/shield-slam-impact.png",
  import.meta.url
).href;
const wardenSelectionRingUrl = new URL(
  "../../../assets/game-art/production-scene/exports/effects/warden-selection-ring.png",
  import.meta.url
).href;
const staticSceneDepthUrl = new URL(
  "../../../assets/game-art/layered-map-poc/blender/outputs/static-scene-depth.png",
  import.meta.url
).href;
const battlefieldAssetUrls: Readonly<Record<string, string>> = {
  "environment-base": environmentUrl,
  "entrance-shell": entranceShellUrl,
  "entrance-route-ground-foreground": entranceRouteGroundForegroundUrl,
  "entrance-route-foreground": entranceRouteForegroundUrl,
  "entrance-route-rear": entranceRouteRearUrl,
  "warden-source": combatAnimationAssetUrl("iron-warden-idle.png"),
  "warden-basic-attack-source": combatAnimationAssetUrl(
    "iron-warden-basic-attack.png"
  ),
  "warden-hit-source": combatAnimationAssetUrl("iron-warden-hit.png"),
  "warden-guard-source": combatAnimationAssetUrl("iron-warden-guard.png"),
  "warden-downed-source": combatAnimationAssetUrl("iron-warden-downed.png"),
  "raider-source": combatAnimationAssetUrl("goblin-cutter-idle-s.png"),
  "warden-shield-slam-source": combatAnimationAssetUrl(
    "iron-warden-shield-slam.png"
  ),
  "raider-attack-source": combatAnimationAssetUrl("goblin-cutter-attack.png"),
  "raider-downed-source": combatAnimationAssetUrl("goblin-cutter-downed.png"),
  "slinger-source": combatAnimationAssetUrl("goblin-slinger-idle-s.png"),
  "slinger-attack-source": combatAnimationAssetUrl("goblin-slinger-attack.png"),
  "slinger-downed-source": combatAnimationAssetUrl("goblin-slinger-downed.png"),
  "bulwark-source": combatAnimationAssetUrl("goblin-bulwark-idle-s.png"),
  "bulwark-attack-source": combatAnimationAssetUrl("goblin-bulwark-attack.png"),
  "bulwark-downed-source": combatAnimationAssetUrl("goblin-bulwark-downed.png"),
  "captain-source": combatAnimationAssetUrl("gatebreaker-captain-idle-s.png"),
  "captain-attack-source": combatAnimationAssetUrl(
    "gatebreaker-captain-attack.png"
  ),
  "captain-downed-source": combatAnimationAssetUrl(
    "gatebreaker-captain-downed.png"
  ),
  ...hostileDirectionalAssetUrls,
  "warm-light-overlay": warmLightOverlayUrl,
  "hostile-faction-ring": hostileFactionRingUrl,
  "shield-slam-impact": shieldSlamImpactUrl,
  "warden-selection-ring": wardenSelectionRingUrl,
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
  readonly entities: ReadonlyMap<string, TextureAlphaMetrics>;
  readonly groundForeground: TextureAlphaMetrics;
  readonly foreground: TextureAlphaMetrics;
  readonly rear: TextureAlphaMetrics;
}

export interface TruthScreenSidecar {
  readonly schemaVersion: 1;
  readonly captureReady: boolean;
  readonly fixtureId: string;
  readonly viewport: readonly [number, number];
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
      readonly visualId: string | null;
      readonly archetype: string | null;
      readonly currentHealth: number | null;
      readonly maximumHealth: number | null;
      readonly action: {
        readonly kind: string;
        readonly phase: string;
        readonly abilityId: string | null;
      } | null;
      readonly targetEntityId: string | null;
      readonly statusIds: readonly string[];
      readonly transition: string | null;
      readonly elite: boolean;
      readonly boss: boolean;
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
    readonly renderedCount: number;
    readonly registryEntitiesMatch: boolean;
    readonly renderedEntitiesMatch: boolean;
    readonly authoritativeEntitiesMatch: boolean;
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
  readonly snapshotTick: number | null;
  readonly snapshotPhase: RenderSnapshot["phase"] | null;
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
  readonly entities: readonly {
    readonly id: string;
    readonly nodeId: string;
    readonly worldPosition: readonly [number, number];
    readonly screenPosition: readonly [number, number];
    readonly currentHealth: number;
    readonly action: {
      readonly kind: string;
      readonly phase: string;
    };
    readonly lifecycle: "active" | "downed" | "destroyed";
    readonly transitionTick: number | null;
    readonly alpha: number;
  }[];
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

type CombatPoseAssetKey =
  | "warden-source"
  | "warden-basic-attack-source"
  | "warden-shield-slam-source"
  | "warden-hit-source"
  | "warden-guard-source"
  | "warden-downed-source"
  | "raider-source"
  | "raider-attack-source"
  | "raider-downed-source"
  | "slinger-source"
  | "slinger-attack-source"
  | "slinger-downed-source"
  | "bulwark-source"
  | "bulwark-attack-source"
  | "bulwark-downed-source"
  | "captain-source"
  | "captain-attack-source"
  | "captain-downed-source"
  | `${"raider" | "slinger" | "bulwark" | "captain"}-${"north" | "east" | "west"}-source`;

function hostilePosePrefix(
  visualId: string
): "raider" | "slinger" | "bulwark" | "captain" {
  if (visualId === "enemy.goblin_slinger") return "slinger";
  if (visualId === "enemy.goblin_bulwark") return "bulwark";
  if (visualId === "enemy.gatebreaker_captain") return "captain";
  return "raider";
}

function hostileIdlePoseAsset(
  prefix: "raider" | "slinger" | "bulwark" | "captain",
  facing: RenderEntityV2["facing"]
): CombatPoseAssetKey {
  return facing === "south" ? `${prefix}-source` : `${prefix}-${facing}-source`;
}

export function selectDownedPoseAsset(
  entity: RenderEntityV2
): CombatPoseAssetKey {
  if (entity.faction === "dwarf") return "warden-downed-source";
  return `${hostilePosePrefix(entity.visualId)}-downed-source`;
}

export function selectCombatPoseAsset(
  snapshot: RenderSnapshot,
  entityId: string,
  previousSnapshot?: RenderSnapshot
): CombatPoseAssetKey {
  const faction = snapshot.entities.find(({ id }) => id === entityId)?.faction;
  if (snapshot.schemaVersion === 1)
    return faction === "dwarf" ? "warden-source" : "raider-source";
  const entity = snapshot.entities.find(({ id }) => id === entityId);
  if (entity === undefined) return "raider-source";
  const dwarf = entity.faction === "dwarf";
  const presentation = deriveCombatPresentationState(
    snapshot,
    previousSnapshot,
    entity.id
  );
  if (dwarf && presentation?.damaged === true) return "warden-hit-source";
  const activePose =
    entity.action.phase === "windup" ||
    entity.action.phase === "committed" ||
    entity.action.phase === "impact";
  if (
    dwarf &&
    entity.action.kind === "ability" &&
    entity.action.abilityId === "ability.iron_warden.shield_slam" &&
    activePose
  )
    return "warden-shield-slam-source";
  if (dwarf && entity.action.kind === "basic_attack" && activePose)
    return "warden-basic-attack-source";
  if (dwarf && entity.action.phase === "recovery") return "warden-guard-source";
  if (dwarf) return "warden-source";
  const prefix = hostilePosePrefix(entity.visualId);
  if (entity.action.kind === "basic_attack" && entity.action.phase !== "idle")
    return `${prefix}-attack-source`;
  return hostileIdlePoseAsset(prefix, entity.facing);
}

export interface CombatPoseTreatment {
  readonly source: CombatPoseAssetKey;
  readonly angle: number;
  readonly flipX: boolean;
  readonly state:
    | "idle"
    | "moving"
    | "windup"
    | "committed"
    | "impact"
    | "recovery";
}

export interface TemporalCombatTreatment {
  readonly angleOffset: number;
  readonly horizontalOffset: number;
  readonly scaleX: number;
  readonly scaleY: number;
  readonly verticalOffset: number;
}

function combatRoleStrength(entity: RenderEntityV2): number {
  if (
    entity.action.kind === "ability" &&
    entity.action.abilityId === "ability.iron_warden.shield_slam"
  )
    return 1.35;
  if (entity.visualId === "enemy.goblin_slinger") return 0.72;
  if (entity.visualId === "enemy.goblin_bulwark") return 1.18;
  if (entity.visualId === "enemy.gatebreaker_captain") return 1.28;
  return entity.faction === "dwarf" ? 1.1 : 1;
}

/** Bounded visual cadence around an authoritative pose and render pivot. */
export function deriveTemporalCombatTreatment(
  entity: RenderEntityV2,
  elapsedMilliseconds: number,
  simulationSpeed: 1 | 2,
  reduceMotion: boolean
): TemporalCombatTreatment {
  const elapsed = Math.max(0, elapsedMilliseconds) * simulationSpeed;
  const cadence =
    entity.visualId === "enemy.goblin_slinger"
      ? 0.008
      : entity.visualId === "enemy.goblin_bulwark"
        ? 0.0048
        : entity.visualId === "enemy.gatebreaker_captain"
          ? 0.0056
          : 0.0068;
  const wave = Math.sin(elapsed * cadence);
  const strength = (reduceMotion ? 0.22 : 1) * combatRoleStrength(entity);
  if (entity.action.kind === "moving" || entity.transition === "moving")
    return {
      angleOffset: wave * 3.2 * strength,
      horizontalOffset: wave * 2.8 * strength,
      scaleX: 1 + wave * 0.025 * strength,
      scaleY: 1 - wave * 0.04 * strength,
      verticalOffset: -Math.abs(wave) * 4.6 * strength
    };
  const phaseProgress = Math.min(1, elapsed / 180);
  const phaseEmphasis = Math.sin((phaseProgress * Math.PI) / 2);
  const treatment =
    entity.action.phase === "windup"
      ? {
          angle: -18 * phaseEmphasis,
          forward: -11 * phaseEmphasis,
          x: 1 - 0.12 * phaseEmphasis,
          y: 1 + 0.14 * phaseEmphasis,
          lift: 4 * phaseEmphasis
        }
      : entity.action.phase === "committed"
        ? {
            angle: 16 * phaseEmphasis,
            forward: 18 * phaseEmphasis,
            x: 1 + 0.16 * phaseEmphasis,
            y: 1 - 0.13 * phaseEmphasis,
            lift: -5 * phaseEmphasis
          }
        : entity.action.phase === "impact"
          ? {
              angle: 24 * phaseEmphasis,
              forward: 25 * phaseEmphasis,
              x: 1 + 0.2 * phaseEmphasis,
              y: 1 - 0.18 * phaseEmphasis,
              lift: 7 * phaseEmphasis
            }
          : entity.action.phase === "recovery"
            ? {
                angle: -14 * (1 - phaseProgress),
                forward: -12 * (1 - phaseProgress),
                x: 0.9 + 0.1 * phaseProgress,
                y: 1.12 - 0.12 * phaseProgress,
                lift: 3 * (1 - phaseProgress)
              }
            : {
                angle: wave * 0.7,
                forward: 0,
                x: 1,
                y: 1,
                lift: 0
              };
  return {
    angleOffset: treatment.angle * strength,
    horizontalOffset:
      treatment.forward *
      strength *
      (entity.facing === "west" || entity.facing === "north" ? -1 : 1),
    scaleX: 1 + (treatment.x - 1) * strength,
    scaleY: 1 + (treatment.y - 1) * strength,
    verticalOffset: treatment.lift * strength
  };
}

export function selectCombatPoseTreatment(
  snapshot: RenderSnapshot,
  entityId: string,
  previousSnapshot?: RenderSnapshot
): CombatPoseTreatment {
  const source = selectCombatPoseAsset(snapshot, entityId, previousSnapshot);
  if (snapshot.schemaVersion !== 2)
    return { source, angle: 0, flipX: false, state: "idle" };
  const entity = snapshot.entities.find(({ id }) => id === entityId);
  if (entity === undefined)
    return { source, angle: 0, flipX: false, state: "idle" };
  const state =
    entity.action.kind === "moving" || entity.transition === "moving"
      ? "moving"
      : entity.action.phase;
  const facingSign =
    entity.facing === "north" || entity.facing === "west" ? -1 : 1;
  const facingAngle =
    source.endsWith("-attack-source") && entity.faction === "enemy"
      ? entity.facing === "north"
        ? 90
        : entity.facing === "east"
          ? 0
          : entity.facing === "south"
            ? -90
            : 0
      : entity.facing === "north"
        ? -3
        : entity.facing === "east"
          ? 1
          : entity.facing === "south"
            ? 3
            : -1;
  const phaseAngle =
    state === "moving"
      ? 2
      : state === "windup"
        ? -6
        : state === "committed"
          ? 4
          : state === "impact"
            ? 8
            : state === "recovery"
              ? -2
              : 0;
  return {
    source,
    angle: state === "idle" ? 0 : phaseAngle * facingSign + facingAngle,
    flipX:
      entity.faction === "enemy" &&
      entity.action.kind === "basic_attack" &&
      entity.facing === "east",
    state
  };
}

export interface CombatPresentationState {
  readonly healthRatio: number;
  readonly damaged: boolean;
  readonly status: boolean;
  readonly statusIds: readonly string[];
  readonly elite: boolean;
  readonly boss: boolean;
  readonly shieldSlamImpact: boolean;
}

export function statusSignalKind(
  statusId: string
): "stagger" | "slow" | "haste" | "unknown" {
  if (statusId.includes("stagger")) return "stagger";
  if (statusId.includes("slow")) return "slow";
  if (statusId.includes("haste")) return "haste";
  return "unknown";
}

export function deriveCombatPresentationState(
  snapshot: RenderSnapshot,
  previousSnapshot: RenderSnapshot | undefined,
  entityId: string
): CombatPresentationState | undefined {
  if (snapshot.schemaVersion !== 2) return undefined;
  const entity = snapshot.entities.find(({ id }) => id === entityId);
  if (entity === undefined) return undefined;
  const previous =
    previousSnapshot?.schemaVersion === 2 &&
    previousSnapshot.scenarioId === snapshot.scenarioId &&
    previousSnapshot.tick === snapshot.previousTick
      ? previousSnapshot.entities.find(({ id }) => id === entityId)
      : undefined;
  return {
    healthRatio:
      entity.maximumHealth === 0
        ? 0
        : entity.currentHealth / entity.maximumHealth,
    damaged:
      previous !== undefined && entity.currentHealth < previous.currentHealth,
    status: entity.statuses.length > 0,
    statusIds: entity.statuses.map(({ id }) => id),
    elite: entity.elite,
    boss: entity.boss,
    shieldSlamImpact:
      entity.action.kind === "ability" &&
      entity.action.abilityId === "ability.iron_warden.shield_slam" &&
      entity.action.phase === "impact"
  };
}

export function deriveShieldSlamImpactIds(
  snapshot: RenderSnapshot,
  previousSnapshot: RenderSnapshot | undefined
): readonly string[] {
  if (snapshot.schemaVersion !== 2) return [];
  const shieldSlam = snapshot.entities.find(
    (entity) =>
      entity.faction === "dwarf" &&
      entity.action.kind === "ability" &&
      entity.action.abilityId === "ability.iron_warden.shield_slam" &&
      entity.action.phase === "impact"
  );
  if (shieldSlam === undefined) return [];
  const damagedHostileIds = snapshot.entities
    .filter(
      (entity) =>
        entity.faction === "enemy" &&
        deriveCombatPresentationState(snapshot, previousSnapshot, entity.id)
          ?.damaged === true
    )
    .map(({ id }) => id)
    .sort(compareRenderIds);
  const departedHostileIds =
    previousSnapshot?.schemaVersion === 2 &&
    previousSnapshot.scenarioId === snapshot.scenarioId &&
    previousSnapshot.tick === snapshot.previousTick
      ? snapshot.entityTransitions
          .filter(
            (transition) =>
              transition.atTick === snapshot.tick &&
              (transition.kind === "downed" || transition.kind === "destroyed")
          )
          .flatMap((transition) => {
            const previous = previousSnapshot.entities.find(
              ({ id }) => id === transition.entityId
            );
            return previous?.faction === "enemy" ? [transition.entityId] : [];
          })
      : [];
  const authoritativeImpactIds = [...damagedHostileIds, ...departedHostileIds]
    .filter((id, index, ids) => ids.indexOf(id) === index)
    .sort(compareRenderIds);
  if (authoritativeImpactIds.length > 0) return authoritativeImpactIds;
  return shieldSlam.targetEntityId === null ? [] : [shieldSlam.targetEntityId];
}

export interface SlingerProjectilePath {
  readonly sourceId: string;
  readonly targetId: string;
  readonly source: RenderPrimitive;
  readonly target: RenderPrimitive;
  readonly phase: "committed" | "impact";
}

export function projectileProgressForPhase(
  phase: SlingerProjectilePath["phase"],
  phaseElapsedMilliseconds: number,
  simulationSpeed: 1 | 2,
  reduceMotion: boolean
): number {
  if (phase === "impact" || reduceMotion) return 1;
  return Math.min(
    0.94,
    Math.max(
      0.08,
      (Math.max(0, phaseElapsedMilliseconds) * simulationSpeed) / 260
    )
  );
}

export function deriveSlingerProjectilePaths(
  snapshot: RenderSnapshot,
  primitives: BattlefieldPrimitives
): readonly SlingerProjectilePath[] {
  if (snapshot.schemaVersion !== 2) return [];
  const positions = new Map(
    primitives.entities.map((entity) => [entity.id, entity])
  );
  return snapshot.entities
    .filter(
      (entity) =>
        entity.visualId === "enemy.goblin_slinger" &&
        entity.action.kind === "basic_attack" &&
        (entity.action.phase === "committed" ||
          entity.action.phase === "impact") &&
        entity.targetEntityId !== null
    )
    .sort((left, right) => compareRenderIds(left.id, right.id))
    .flatMap((entity) => {
      const source = positions.get(entity.id);
      const target = positions.get(entity.targetEntityId ?? "");
      return source === undefined || target === undefined
        ? []
        : [
            {
              sourceId: entity.id,
              targetId: entity.targetEntityId as string,
              source,
              target,
              phase: entity.action.phase as "committed" | "impact"
            }
          ];
    });
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

function decodeBattlefieldDepthTexture(
  scene: Phaser.Scene
): StaticSceneDepth | undefined {
  try {
    const source = scene.textures
      .get("static-scene-depth")
      .getSourceImage() as unknown;
    if (!(source instanceof HTMLImageElement)) return undefined;
    const canvas = document.createElement("canvas");
    canvas.width = source.naturalWidth;
    canvas.height = source.naturalHeight;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (context === null) return undefined;
    context.drawImage(source, 0, 0);
    return decodeStaticSceneDepthPixels(
      context.getImageData(0, 0, canvas.width, canvas.height).data,
      canvas.width,
      canvas.height,
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

export function buildTruthScreenAlignment(
  snapshot: RenderSnapshot,
  registryEntities: readonly Pick<RenderEntity, "id" | "faction">[],
  renderedEntities: readonly Pick<RenderEntity, "id" | "faction">[]
): TruthScreenSidecar["alignment"] {
  const canonicalIdentity = ({
    id,
    faction
  }: Pick<RenderEntity, "id" | "faction">) => `${id}\u0000${faction}`;
  const snapshotCombatants = snapshot.entities
    .filter(({ faction }) => faction === "dwarf" || faction === "enemy")
    .map(canonicalIdentity)
    .sort(compareRenderIds);
  const registryCombatants = registryEntities
    .filter(({ faction }) => faction === "dwarf" || faction === "enemy")
    .map(canonicalIdentity)
    .sort(compareRenderIds);
  const renderedCombatants = renderedEntities
    .filter(({ faction }) => faction === "dwarf" || faction === "enemy")
    .map(canonicalIdentity)
    .sort(compareRenderIds);
  const registryEntitiesMatch =
    snapshotCombatants.length === registryCombatants.length &&
    snapshotCombatants.every(
      (identity, index) => identity === registryCombatants[index]
    );
  const renderedEntitiesMatch =
    snapshotCombatants.length === renderedCombatants.length &&
    snapshotCombatants.every(
      (identity, index) => identity === renderedCombatants[index]
    );
  const authoritativeEntitiesMatch =
    registryEntitiesMatch && renderedEntitiesMatch;
  return {
    snapshotCount: snapshotCombatants.length,
    registryCount: registryCombatants.length,
    renderedCount: renderedCombatants.length,
    registryEntitiesMatch,
    renderedEntitiesMatch,
    authoritativeEntitiesMatch,
    valid: authoritativeEntitiesMatch
  };
}

export function buildTruthScreenSidecar(
  snapshot: RenderSnapshot,
  primitives: BattlefieldPrimitives,
  visualMetrics: TruthVisualMetrics,
  viewport: readonly [number, number],
  renderedEntities: readonly Pick<RenderEntity, "id" | "faction">[]
): TruthScreenSidecar {
  const byId = new Map(snapshot.entities.map((entity) => [entity.id, entity]));
  const v2ById = new Map(
    snapshot.schemaVersion === 2
      ? snapshot.entities.map((entity) => [entity.id, entity])
      : []
  );
  const entities = primitives.entities.flatMap((primitive) => {
    const entity = byId.get(primitive.id);
    if (
      entity === undefined ||
      (entity.faction !== "dwarf" && entity.faction !== "enemy")
    )
      return [];
    const source =
      visualMetrics.entities.get(entity.id) ?? visualMetrics[entity.faction];
    const v2 = v2ById.get(entity.id);
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
        visualId: v2?.visualId ?? null,
        archetype: v2?.archetype ?? null,
        currentHealth: v2?.currentHealth ?? null,
        maximumHealth: v2?.maximumHealth ?? null,
        action: v2?.action ?? null,
        targetEntityId: v2?.targetEntityId ?? null,
        statusIds: v2?.statuses.map(({ id }) => id) ?? [],
        transition: v2?.transition ?? null,
        elite: v2?.elite ?? false,
        boss: v2?.boss ?? false,
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
  const hostile = entities.find(({ faction }) => faction === "enemy");
  const hostileSource =
    (hostile === undefined
      ? undefined
      : visualMetrics.entities.get(hostile.id)) ?? visualMetrics.enemy;
  const countEnemyArtifactOverlap = (
    artifact: TextureAlphaMetrics,
    canvasLeft: number,
    canvasTop: number
  ): number => {
    let overlap = 0;
    for (let y = 0; y < hostileSource.height; y += 1) {
      for (let x = 0; x < hostileSource.width; x += 1) {
        if ((hostileSource.alpha[y * hostileSource.width + x] ?? 0) === 0)
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
  const alignment = buildTruthScreenAlignment(
    snapshot,
    entities,
    renderedEntities
  );
  return {
    schemaVersion: 1,
    captureReady: alignment.valid,
    fixtureId: FIXTURE_ID,
    viewport,
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
    alignment
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
  presentation: CombatPresentationState | undefined,
  existing?: Phaser.GameObjects.Image
): Phaser.GameObjects.Image | undefined {
  if (entity.faction === undefined) return undefined;
  const dwarf = entity.faction === "dwarf";
  const sourceKey = dwarf ? "warden-selection-ring" : "hostile-faction-ring";
  const width = dwarf ? 94 : 78;
  const height = dwarf ? 42 : 36;
  const pivotX = width / 2;
  const pivotY = height / 2;
  const frameLeft = Math.round(entity.x) - pivotX;
  const frameTop = Math.round(entity.y) - pivotY;
  const texture =
    entity.cameraDepth === undefined
      ? sourceKey
      : createDepthClippedPresentationTexture(
          scene,
          sourceKey,
          `ring-depth-${entity.id}`,
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
        );
  const ring = existing ?? scene.add.image(entity.x, entity.y, texture);
  ring
    .setTexture(texture)
    .setPosition(entity.x, entity.y)
    .setOrigin(0.5)
    .setScale(
      presentation?.boss === true
        ? 1.18
        : presentation?.elite === true
          ? 1.08
          : 1
    )
    .setTint(
      presentation?.boss === true
        ? 0xe7a2ff
        : presentation?.elite === true
          ? 0xffd45c
          : 0xffffff
    );
  return ring;
}

function updateEntitySignal(
  scene: Phaser.Scene,
  signal: Phaser.GameObjects.Graphics,
  entity: RenderPrimitive,
  presentation: CombatPresentationState | undefined,
  staticDepth: StaticSceneDepth
): void {
  signal.clearMask(true);
  signal.clear();
  signal.setPosition(0, 0);
  if (presentation === undefined) return;
  const dwarf = entity.faction === "dwarf";
  const width = dwarf ? 46 : 38;
  const top = entity.y - (dwarf ? 72 : 60);
  signal.fillStyle(0x090705, 0.9);
  signal.fillRect(entity.x - width / 2 - 1, top - 1, width + 2, 6);
  signal.fillStyle(
    presentation.healthRatio > 0.5
      ? 0x69b96b
      : presentation.healthRatio > 0.25
        ? 0xe0a84c
        : 0xd85a4f,
    1
  );
  signal.fillRect(
    entity.x - width / 2,
    top,
    Math.round(width * presentation.healthRatio),
    4
  );
  if (presentation.damaged) {
    signal.fillStyle(0xff695e, 1);
    signal.fillTriangle(
      entity.x - 5,
      top - 8,
      entity.x + 5,
      top - 8,
      entity.x,
      top - 2
    );
  }
  for (const [index, statusId] of presentation.statusIds.entries()) {
    signal.lineStyle(2, 0x73d7ef, 1);
    const centerX = entity.x + width / 2 + 7 + index * 10;
    const centerY = top + 2;
    const kind = statusSignalKind(statusId);
    if (kind === "stagger") {
      signal.lineBetween(centerX, centerY - 5, centerX + 5, centerY);
      signal.lineBetween(centerX + 5, centerY, centerX, centerY + 5);
      signal.lineBetween(centerX, centerY + 5, centerX - 5, centerY);
      signal.lineBetween(centerX - 5, centerY, centerX, centerY - 5);
    } else if (kind === "slow") {
      signal.lineBetween(centerX - 4, centerY - 5, centerX + 4, centerY - 5);
      signal.lineBetween(centerX - 4, centerY + 5, centerX + 4, centerY + 5);
      signal.lineBetween(centerX - 4, centerY - 5, centerX + 4, centerY + 5);
      signal.lineBetween(centerX + 4, centerY - 5, centerX - 4, centerY + 5);
    } else if (kind === "haste") {
      signal.lineBetween(centerX - 4, centerY - 5, centerX + 1, centerY);
      signal.lineBetween(centerX + 1, centerY, centerX - 4, centerY + 5);
      signal.lineBetween(centerX + 1, centerY - 5, centerX + 6, centerY);
      signal.lineBetween(centerX + 6, centerY, centerX + 1, centerY + 5);
    } else signal.strokeRect(centerX - 4, centerY - 4, 8, 8);
  }
  if (presentation.elite || presentation.boss) {
    signal.lineStyle(2, presentation.boss ? 0xe7a2ff : 0xffd45c, 1);
    signal.strokeCircle(entity.x, top - 5, presentation.boss ? 8 : 5);
  }
  if (entity.cameraDepth !== undefined)
    signal.setMask(
      createDepthVisibilityMask(
        scene,
        100,
        90,
        {
          kind: "upright-billboard",
          cameraDepth: entity.cameraDepth,
          cameraDepthPerPixelY: SHUTTERGATE_UPRIGHT_CAMERA_DEPTH_PER_PIXEL_Y,
          depthEdgeGuardPixels: 1,
          frameLeft: Math.round(entity.x) - 50,
          frameTop: Math.round(entity.y) - 82,
          pivotY: 82
        },
        staticDepth
      )
    );
}

function addDepthTestedEffect(
  scene: Phaser.Scene,
  entity: RenderPrimitive,
  kind: "arrival" | "departure",
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
  if (kind === "arrival") {
    effect.lineStyle(3, 0x73d7ef, 0.95);
    effect.strokeEllipse(entity.x, entity.y - 10, 82, 44);
    effect.lineBetween(entity.x - 12, entity.y - 2, entity.x, entity.y - 12);
    effect.lineBetween(entity.x, entity.y - 12, entity.x + 12, entity.y - 2);
    effect.lineBetween(entity.x - 9, entity.y + 6, entity.x, entity.y - 2);
    effect.lineBetween(entity.x, entity.y - 2, entity.x + 9, entity.y + 6);
  } else {
    effect.lineStyle(4, 0xff695e, 0.95);
    effect.beginPath();
    effect.arc(entity.x, entity.y - 12, 38, 0.2, 1.2);
    effect.arc(entity.x, entity.y - 12, 38, 1.9, 2.9);
    effect.arc(entity.x, entity.y - 12, 38, 3.3, 4.3);
    effect.arc(entity.x, entity.y - 12, 38, 5, 6);
    effect.strokePath();
    effect.lineBetween(
      entity.x - 10,
      entity.y - 22,
      entity.x + 10,
      entity.y - 2
    );
    effect.lineBetween(
      entity.x + 10,
      entity.y - 22,
      entity.x - 10,
      entity.y - 2
    );
  }
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
    image
      .setTexture(sourceKey)
      .setPosition(entity.x, entity.y)
      .setOrigin(pivotX / width, pivotY / height);
    image.setData("renderEntityId", entity.id);
    image.setData("renderSourceKey", sourceKey);
    return image;
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
  image
    .setTexture(texture)
    .setPosition(entity.x, entity.y)
    .setOrigin(pivotX / width, pivotY / height);
  image.setData("renderEntityId", entity.id);
  image.setData("renderSourceKey", sourceKey);
  return image;
}

export function renderedFactionForSourceKey(
  sourceKey: unknown
): RenderEntity["faction"] | undefined {
  if (typeof sourceKey !== "string") return undefined;
  if (sourceKey.startsWith("warden-")) return "dwarf";
  if (
    ["raider-", "slinger-", "bulwark-", "captain-"].some((prefix) =>
      sourceKey.startsWith(prefix)
    )
  )
    return "enemy";
  return undefined;
}

interface PersistentEntityObjects {
  readonly ring: Phaser.GameObjects.Image;
  readonly subject: Phaser.GameObjects.Image;
  readonly signal: Phaser.GameObjects.Graphics;
  damagedUntil: number;
  damagedStartedAt: number;
  signalDamaged: boolean;
  signalEntity: RenderPrimitive | undefined;
  signalPresentation: CombatPresentationState | undefined;
  targetX: number;
  targetY: number;
  pivotX: number;
  pivotY: number;
  poseAngle: number;
}

interface ActionClock {
  readonly signature: string;
  readonly startedAt: number;
}

type RenderEntityV2 = Extract<
  RenderSnapshot,
  { readonly schemaVersion: 2 }
>["entities"][number];

interface DepartingEntityObjects {
  readonly entity: RenderEntityV2;
  readonly objects: PersistentEntityObjects;
  readonly kind: "downed" | "destroyed";
  readonly transitionTick: number;
  readonly startedAt: number;
  readonly originY: number;
  readonly reduceMotion: boolean;
}

class PersistentBattlefieldScene {
  readonly layers: Record<
    BattlefieldLayerId,
    Set<Phaser.GameObjects.GameObject>
  >;
  readonly entities = new Map<string, PersistentEntityObjects>();
  readonly departures = new Map<string, DepartingEntityObjects>();
  readonly effects: Phaser.GameObjects.Graphics[] = [];
  readonly projectileEffects = new Map<string, Phaser.GameObjects.Graphics>();
  readonly actionEffects = new Map<string, Phaser.GameObjects.Graphics>();
  readonly abilityEffects = new Map<string, Phaser.GameObjects.Image>();
  readonly actionClocks = new Map<string, ActionClock>();
  readonly lighting: Phaser.GameObjects.Image;
  readonly terminalFrame: Phaser.GameObjects.Graphics;
  readonly terminalText: Phaser.GameObjects.Text;
  updateCount = 0;
  activeEffects = 0;
  lastInterpolatedTick: string | undefined;
  lastAbilityEffectTick: string | undefined;
  lastSnapshot: RenderSnapshot | undefined;

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
    this.lighting = scene.add.image(
      WIDTH / 2,
      HEIGHT / 2,
      "warm-light-overlay"
    );
    this.layers.lighting.add(this.lighting);
    this.terminalFrame = scene.add.graphics().setVisible(false);
    this.terminalFrame.fillStyle(0x090705, 0.88);
    this.terminalFrame.fillRoundedRect(390, 292, 500, 136, 10);
    this.terminalFrame.lineStyle(3, 0xd6a64f, 1);
    this.terminalFrame.strokeRoundedRect(390, 292, 500, 136, 10);
    this.terminalText = scene.add
      .text(WIDTH / 2, HEIGHT / 2, "", {
        color: "#f0c66f",
        fontFamily: "Georgia, serif",
        fontSize: "30px",
        fontStyle: "bold",
        align: "center"
      })
      .setOrigin(0.5)
      .setVisible(false);
    this.layers["screen-overlay"].add(this.terminalFrame);
    this.layers["screen-overlay"].add(this.terminalText);
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
    objects.targetX = destination.x;
    objects.targetY = destination.y;
    objects.pivotX = origin.x;
    objects.pivotY = origin.y;
    objects.ring.setPosition(origin.x, origin.y);
    objects.subject.setPosition(origin.x, origin.y);
    objects.signal.setPosition(offsetX, offsetY);
    const signalMask = objects.signal.mask?.geometryMask;
    signalMask?.setPosition(offsetX, offsetY);
  }

  updateMotion(
    deltaMilliseconds: number,
    simulationSpeed: 1 | 2,
    reduceMotion: boolean
  ): void {
    const maximumStep = interpolationDistanceForFrame(
      deltaMilliseconds,
      simulationSpeed
    );
    for (const [entityId, objects] of this.entities) {
      const deltaX = objects.targetX - objects.pivotX;
      const deltaY = objects.targetY - objects.pivotY;
      const distance = Math.hypot(deltaX, deltaY);
      const ratio = distance === 0 ? 1 : Math.min(1, maximumStep / distance);
      const x = objects.pivotX + deltaX * ratio;
      const y = objects.pivotY + deltaY * ratio;
      objects.pivotX = x;
      objects.pivotY = y;
      objects.subject.setPosition(x, y);
      objects.ring.setPosition(x, y);
      const offsetX = x - objects.targetX;
      const offsetY = y - objects.targetY;
      objects.signal.setPosition(offsetX, offsetY);
      objects.signal.mask?.geometryMask?.setPosition(offsetX, offsetY);
      const snapshotEntity =
        this.lastSnapshot?.schemaVersion === 2
          ? this.lastSnapshot.entities.find(({ id }) => id === entityId)
          : undefined;
      if (snapshotEntity !== undefined) {
        const actionClock = this.actionClocks.get(entityId);
        const treatmentElapsed =
          snapshotEntity.action.kind === "moving" ||
          snapshotEntity.transition === "moving"
            ? this.scene.time.now
            : this.scene.time.now -
              (actionClock?.startedAt ?? this.scene.time.now);
        const treatment = deriveTemporalCombatTreatment(
          snapshotEntity,
          treatmentElapsed,
          simulationSpeed,
          reduceMotion
        );
        const damageProgress = Math.min(
          1,
          Math.max(
            0,
            (this.scene.time.now - objects.damagedStartedAt) /
              DAMAGE_SIGNAL_DURATION_MS
          )
        );
        const damageRecoil =
          objects.damagedUntil > this.scene.time.now
            ? Math.sin(damageProgress * Math.PI) * (reduceMotion ? 3 : 11)
            : 0;
        objects.subject
          .setAngle(objects.poseAngle + treatment.angleOffset)
          .setScale(treatment.scaleX, treatment.scaleY)
          .setPosition(
            x +
              treatment.horizontalOffset -
              damageRecoil *
                (snapshotEntity.facing === "west" ||
                snapshotEntity.facing === "north"
                  ? -1
                  : 1),
            y + treatment.verticalOffset
          );
      }
      if (
        objects.signalDamaged &&
        objects.damagedUntil <= this.scene.time.now &&
        objects.signalEntity !== undefined &&
        objects.signalPresentation !== undefined
      ) {
        objects.signalDamaged = false;
        updateEntitySignal(
          this.scene,
          objects.signal,
          objects.signalEntity,
          { ...objects.signalPresentation, damaged: false },
          this.staticDepth
        );
        objects.signal.setPosition(offsetX, offsetY);
        objects.signal.mask?.geometryMask?.setPosition(offsetX, offsetY);
        objects.subject.clearTint();
      }
    }
    this.updateActionEffects(reduceMotion);
    this.updateProjectileEffects(simulationSpeed, reduceMotion);
  }

  private updateActionEffects(reduceMotion: boolean): void {
    if (this.lastSnapshot?.schemaVersion !== 2) return;
    const active = this.lastSnapshot.entities.filter(
      (entity) =>
        entity.action.kind !== "idle" &&
        entity.action.kind !== "moving" &&
        entity.action.phase !== "idle"
    );
    const liveIds = new Set(active.map(({ id }) => id));
    for (const [id, effect] of this.actionEffects)
      if (!liveIds.has(id)) {
        this.layers["world-effects"].delete(effect);
        effect.destroy();
        this.actionEffects.delete(id);
      }
    for (const entity of active) {
      if (!this.actionEffects.has(entity.id) && this.actionEffects.size >= 16)
        continue;
      const objects = this.entities.get(entity.id);
      if (objects === undefined) continue;
      const effect =
        this.actionEffects.get(entity.id) ?? this.scene.add.graphics();
      const x = objects.pivotX;
      const y = objects.pivotY - 24;
      const hostile = entity.faction === "enemy";
      const color = hostile ? 0xff9a45 : 0x7ee8ff;
      const intensity = reduceMotion ? 0.72 : 1;
      const facingSign =
        entity.facing === "west" || entity.facing === "north" ? -1 : 1;
      const clock = this.actionClocks.get(entity.id);
      const progress = Math.min(
        1,
        Math.max(
          0,
          (this.scene.time.now - (clock?.startedAt ?? this.scene.time.now)) /
            180
        )
      );
      const eased = Math.sin((progress * Math.PI) / 2);
      const forwardX = x + facingSign * (24 + eased * 24);
      effect.clear().setAlpha(intensity);
      if (entity.action.phase === "windup") {
        effect.lineStyle(6, color, 0.95);
        effect.beginPath();
        effect.arc(x - facingSign * 8, y, hostile ? 31 : 38, 3.55, 5.85);
        effect.strokePath();
        effect.fillStyle(color, 0.28);
        effect.fillTriangle(
          x - facingSign * 42,
          y + 18,
          x - facingSign * 17,
          y - 18,
          x - facingSign * 10,
          y + 26
        );
      } else if (entity.action.phase === "committed") {
        effect.lineStyle(12, color, 0.38);
        effect.lineBetween(x - facingSign * 18, y + 12, forwardX, y - 16);
        effect.lineStyle(5, 0xfff0b8, 1);
        effect.lineBetween(x, y + 8, forwardX + facingSign * 10, y - 21);
      } else if (entity.action.phase === "impact") {
        effect.fillStyle(color, 0.3);
        effect.fillCircle(forwardX, y, hostile ? 43 : 53);
        effect.lineStyle(7, 0xfff0b8, 1);
        effect.strokeCircle(forwardX, y, hostile ? 32 : 42);
        for (let index = 0; index < 8; index += 1) {
          const angle = (Math.PI * index) / 4;
          effect.lineBetween(
            forwardX + Math.cos(angle) * 35,
            y + Math.sin(angle) * 35,
            forwardX + Math.cos(angle) * 60,
            y + Math.sin(angle) * 60
          );
        }
      } else {
        effect.lineStyle(5, color, 0.65 * (1 - progress * 0.65));
        effect.beginPath();
        effect.arc(x - facingSign * 10, y + 12, hostile ? 27 : 34, 0.2, 2.95);
        effect.strokePath();
      }
      if (!this.actionEffects.has(entity.id)) {
        this.actionEffects.set(entity.id, effect);
        this.layers["world-effects"].add(effect);
      }
    }
  }

  private updateProjectileEffects(
    simulationSpeed: 1 | 2,
    reduceMotion: boolean
  ): void {
    if (this.lastSnapshot === undefined) return;
    const projectilePaths = deriveSlingerProjectilePaths(
      this.lastSnapshot,
      buildBattlefieldPrimitives(this.lastSnapshot)
    );
    const liveProjectileIds = new Set(
      projectilePaths.map(({ sourceId }) => sourceId)
    );
    for (const [id, effect] of this.projectileEffects)
      if (!liveProjectileIds.has(id)) {
        this.layers["world-effects"].delete(effect);
        effect.destroy();
        this.projectileEffects.delete(id);
      }
    for (const path of projectilePaths) {
      if (
        !this.projectileEffects.has(path.sourceId) &&
        this.projectileEffects.size >= MAX_POOLED_EFFECTS
      )
        continue;
      const effect =
        this.projectileEffects.get(path.sourceId) ?? this.scene.add.graphics();
      const clock = this.actionClocks.get(path.sourceId);
      const progress = projectileProgressForPhase(
        path.phase,
        clock === undefined ? 0 : this.scene.time.now - clock.startedAt,
        simulationSpeed,
        reduceMotion
      );
      const sourceY = path.source.y - 28;
      const targetY = path.target.y - 34;
      const projectileX =
        path.source.x + (path.target.x - path.source.x) * progress;
      const projectileY = sourceY + (targetY - sourceY) * progress;
      effect.clear();
      effect.lineStyle(3, 0xf0aa52, 0.9);
      effect.lineBetween(path.source.x, sourceY, projectileX, projectileY);
      effect.fillStyle(0xffd17a, 1);
      effect.fillCircle(projectileX, projectileY, reduceMotion ? 4 : 6);
      if (path.phase === "impact") {
        effect.lineStyle(2, 0xffd17a, reduceMotion ? 0.75 : 1);
        effect.strokeCircle(path.target.x, targetY, reduceMotion ? 7 : 12);
      }
      effect.lineStyle(2, 0xd8eef5, 0.95);
      effect.strokeCircle(path.source.x, sourceY, 5);
      effect.setAlpha(reduceMotion ? 0.82 : 1);
      if (!this.projectileEffects.has(path.sourceId)) {
        this.projectileEffects.set(path.sourceId, effect);
        this.layers["world-effects"].add(effect);
      }
    }
  }

  private destroyEntityObjects(
    id: string,
    objects: PersistentEntityObjects
  ): void {
    this.layers["world-rings"].delete(objects.ring);
    this.layers["world-entities"].delete(objects.subject);
    this.layers["world-effects"].delete(objects.signal);
    objects.ring.destroy();
    objects.signal.clearMask(true);
    objects.signal.destroy();
    objects.subject.setTexture("warden-runtime");
    objects.subject.destroy();
    for (const textureKey of [`ring-depth-${id}`, `subject-depth-${id}`])
      if (this.scene.textures.exists(textureKey))
        this.scene.textures.remove(textureKey);
  }

  updateDepartures(): void {
    for (const [id, departure] of this.departures) {
      const progress = Math.min(
        1,
        Math.max(
          0,
          (this.scene.time.now - departure.startedAt) / DEPARTURE_DURATION_MS
        )
      );
      const { ring, signal, subject } = departure.objects;
      if (departure.reduceMotion) {
        ring.setAlpha(0.35);
        signal.setAlpha(0.65);
        subject
          .setAlpha(departure.kind === "downed" ? 0.8 : 0.45)
          .setAngle(departure.kind === "downed" ? -82 : 24)
          .setY(departure.originY + (departure.kind === "downed" ? 14 : 22))
          .setTint(departure.kind === "downed" ? 0xaeb8c4 : 0xff5c4d);
      } else if (departure.kind === "downed") {
        ring.setAlpha(1 - progress * 0.65);
        signal.setAlpha(1 - progress * 0.45);
        subject
          .setAlpha(1 - progress * 0.2)
          .setAngle(-82 * progress)
          .setY(departure.originY + 14 * progress)
          .setTint(0xaeb8c4);
      } else {
        ring.setAlpha(1 - progress);
        signal.setAlpha(1 - progress * 0.8);
        subject
          .setAlpha(1 - progress)
          .setAngle(28 * progress)
          .setY(departure.originY + 28 * progress)
          .setTint(0xff5c4d);
      }
      if (progress < 1) continue;
      this.destroyEntityObjects(id, departure.objects);
      this.departures.delete(id);
    }
    if (this.departures.size === 0 && this.lastSnapshot?.phase === "terminal") {
      this.terminalFrame.setVisible(true);
      this.terminalText.setVisible(true);
      this.scene.children.bringToTop(this.terminalFrame);
      this.scene.children.bringToTop(this.terminalText);
    }
  }

  terminalPresentationComplete(): boolean {
    return (
      this.lastSnapshot?.phase === "terminal" &&
      this.departures.size === 0 &&
      this.terminalFrame.visible
    );
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
    this.lastSnapshot = snapshot;
    this.updateDepartures();
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
      [...this.entities.values()].flatMap(({ ring, signal, subject }) => {
        const signalMask = signal.mask?.geometryMask;
        return signalMask === undefined
          ? [ring, signal, subject]
          : [ring, signal, signalMask, subject];
      })
    );
    const orderedEntities = [...primitives.entities].sort(
      comparePresentationPrimitives
    );
    if (snapshot.schemaVersion === 2) {
      const liveActionIds = new Set(snapshot.entities.map(({ id }) => id));
      for (const id of this.actionClocks.keys())
        if (!liveActionIds.has(id)) this.actionClocks.delete(id);
      for (const entity of snapshot.entities) {
        const signature = `${entity.action.kind}:${entity.action.phase}:${entity.action.abilityId ?? "none"}:${entity.targetEntityId ?? "none"}`;
        if (this.actionClocks.get(entity.id)?.signature !== signature)
          this.actionClocks.set(entity.id, {
            signature,
            startedAt: this.scene.time.now
          });
      }
    } else this.actionClocks.clear();
    const liveIds = new Set(orderedEntities.map(({ id }) => id));
    const departureIds = new Set(
      feedback?.departures.map(({ id }) => id) ?? []
    );
    for (const [id, objects] of this.entities)
      if (!liveIds.has(id)) {
        this.entities.delete(id);
        const previousEntity =
          previousSnapshot?.schemaVersion === 2
            ? previousSnapshot.entities.find((entity) => entity.id === id)
            : undefined;
        const transition =
          snapshot.schemaVersion === 2
            ? snapshot.entityTransitions.find(
                (candidate) =>
                  candidate.entityId === id &&
                  (candidate.kind === "downed" ||
                    candidate.kind === "destroyed")
              )
            : undefined;
        if (
          departureIds.has(id) &&
          previousEntity !== undefined &&
          previousEntity.faction !== undefined &&
          transition !== undefined
        ) {
          const previousPrimitive = previousSnapshot
            ? buildBattlefieldPrimitives(previousSnapshot).entities.find(
                (entity) => entity.id === id
              )
            : undefined;
          const downedSource =
            previousSnapshot?.schemaVersion === 2
              ? previousSnapshot.entities.find((entity) => entity.id === id)
              : undefined;
          if (previousPrimitive !== undefined && downedSource !== undefined) {
            const downedKey = selectDownedPoseAsset(downedSource);
            const downedTexture = normalizeAlphaTexture(
              this.scene,
              downedKey,
              downedKey.replace(/-source$/, "-runtime")
            );
            addDepthTestedBillboard(
              this.scene,
              previousPrimitive,
              downedTexture,
              previousEntity.faction === "dwarf" ? 112 : 80,
              previousEntity.faction === "dwarf" ? 72 : 60,
              previousEntity.faction === "dwarf" ? 56 : 40,
              previousEntity.faction === "dwarf" ? 66 : 54,
              this.staticDepth,
              objects.subject
            );
          }
          objects.ring.destroy();
          this.departures.set(id, {
            entity: previousEntity,
            objects,
            kind: transition.kind === "downed" ? "downed" : "destroyed",
            transitionTick: transition.atTick,
            startedAt: this.scene.time.now,
            originY: objects.subject.y,
            reduceMotion
          });
        } else this.destroyEntityObjects(id, objects);
      }

    const poseSourceKeys: readonly CombatPoseAssetKey[] = [
      "warden-source",
      "warden-basic-attack-source",
      "warden-shield-slam-source",
      "warden-hit-source",
      "warden-guard-source",
      "warden-downed-source",
      "raider-source",
      "raider-north-source",
      "raider-east-source",
      "raider-west-source",
      "raider-attack-source",
      "raider-downed-source",
      "slinger-source",
      "slinger-north-source",
      "slinger-east-source",
      "slinger-west-source",
      "slinger-attack-source",
      "slinger-downed-source",
      "bulwark-source",
      "bulwark-north-source",
      "bulwark-east-source",
      "bulwark-west-source",
      "bulwark-attack-source",
      "bulwark-downed-source",
      "captain-source",
      "captain-north-source",
      "captain-east-source",
      "captain-west-source",
      "captain-attack-source",
      "captain-downed-source"
    ];
    const poseTextures = new Map<CombatPoseAssetKey, string>(
      poseSourceKeys.map((source) => [
        source,
        normalizeAlphaTexture(
          this.scene,
          source,
          source.replace(/-source$/, "-runtime")
        )
      ])
    );
    const wardenTexture = poseTextures.get("warden-source") ?? "warden-source";
    const raiderTexture = poseTextures.get("raider-source") ?? "raider-source";
    for (const entity of orderedEntities) {
      const existing = this.entities.get(entity.id);
      const displayedOrigin =
        existing === undefined
          ? undefined
          : { id: entity.id, x: existing.pivotX, y: existing.pivotY };
      const presentation = deriveCombatPresentationState(
        snapshot,
        previousSnapshot,
        entity.id
      );
      const ring = addDepthTestedRing(
        this.scene,
        entity,
        this.staticDepth,
        presentation,
        existing?.ring
      );
      if (ring === undefined) continue;
      if (existing === undefined) this.layers["world-rings"].add(ring);
      const dwarf = entity.faction === "dwarf";
      const poseKey = selectCombatPoseAsset(
        snapshot,
        entity.id,
        previousSnapshot
      );
      const subject = addDepthTestedBillboard(
        this.scene,
        entity,
        poseTextures.get(poseKey) ?? poseKey,
        dwarf ? 112 : 80,
        dwarf ? 72 : 60,
        dwarf ? 56 : 40,
        dwarf ? 66 : 54,
        this.staticDepth,
        existing?.subject
      );
      const poseTreatment = selectCombatPoseTreatment(
        snapshot,
        entity.id,
        previousSnapshot
      );
      ring.setAlpha(1).setAngle(0);
      subject
        .setAlpha(1)
        .setAngle(poseTreatment.angle)
        .setFlipX(poseTreatment.flipX)
        .clearTint();
      if (existing === undefined) {
        this.layers["world-entities"].add(subject);
        const signal = this.scene.add.graphics();
        this.layers["world-effects"].add(signal);
        this.entities.set(entity.id, {
          ring,
          subject,
          signal,
          damagedUntil: 0,
          damagedStartedAt: 0,
          signalDamaged: false,
          signalEntity: undefined,
          signalPresentation: undefined,
          targetX: entity.x,
          targetY: entity.y,
          pivotX: entity.x,
          pivotY: entity.y,
          poseAngle: poseTreatment.angle
        });
      }
      const objects = this.entities.get(entity.id);
      if (objects !== undefined) {
        objects.poseAngle = poseTreatment.angle;
        if (presentation?.damaged === true) {
          objects.damagedStartedAt = this.scene.time.now;
          objects.damagedUntil =
            this.scene.time.now + DAMAGE_SIGNAL_DURATION_MS;
        }
        const signalPresentation =
          presentation === undefined
            ? undefined
            : {
                ...presentation,
                damaged: objects.damagedUntil > this.scene.time.now
              };
        updateEntitySignal(
          this.scene,
          objects.signal,
          entity,
          signalPresentation,
          this.staticDepth
        );
        objects.signalDamaged = signalPresentation?.damaged === true;
        objects.signalEntity = entity;
        objects.signalPresentation = signalPresentation;
        if (objects.damagedUntil > this.scene.time.now)
          objects.subject.setTint(0xff5c4d);
      }
      const snapshotEntity =
        snapshot.schemaVersion === 2
          ? snapshot.entities.find(({ id }) => id === entity.id)
          : undefined;
      const origin = displayedOrigin ?? interpolationOrigins.get(entity.id);
      if (
        interpolate &&
        objects !== undefined &&
        snapshotEntity !== undefined &&
        origin !== undefined
      )
        this.interpolateEntity(objects, origin, entity);
      else if (objects !== undefined) {
        objects.targetX = entity.x;
        objects.targetY = entity.y;
        objects.pivotX = entity.x;
        objects.pivotY = entity.y;
      }
    }
    if (interpolationTick !== undefined)
      this.lastInterpolatedTick = interpolationTick;

    this.scene.tweens.killTweensOf(this.effects);
    this.activeEffects = 0;
    if (feedback !== undefined) {
      const arrivalIds = new Set(feedback.arrivals.map(({ id }) => id));
      const effectEntities = [
        ...orderedEntities
          .filter(({ id }) => arrivalIds.has(id))
          .map((entity) => ({ entity, kind: "arrival" as const })),
        ...(previousSnapshot === undefined
          ? []
          : buildDepartureFeedbackPrimitives(previousSnapshot, feedback).map(
              (entity) => ({ entity, kind: "departure" as const })
            ))
      ].sort((left, right) =>
        comparePresentationPrimitives(left.entity, right.entity)
      );
      for (const { entity, kind } of effectEntities) {
        if (this.activeEffects >= MAX_POOLED_EFFECTS) continue;
        const effect = addDepthTestedEffect(
          this.scene,
          entity,
          kind,
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
    if (active.length > 0 && !reduceMotion && evidenceEffectAlpha === undefined)
      this.scene.tweens.add({
        targets: active,
        alpha: 0.15,
        duration: 420,
        yoyo: true,
        repeat: 1
      });
    else if (active.length > 0 && evidenceEffectAlpha === undefined)
      for (const effect of active) effect.setAlpha(1);
    else if (evidenceEffectAlpha !== undefined)
      for (const effect of active) effect.setAlpha(evidenceEffectAlpha);

    this.updateProjectileEffects(1, reduceMotion);

    const abilityImpactIds = deriveShieldSlamImpactIds(
      snapshot,
      previousSnapshot
    );
    const impactKey =
      snapshot.schemaVersion === 2
        ? `${snapshot.scenarioId}:${snapshot.tick}:${abilityImpactIds.join(",")}`
        : undefined;
    const previousPrimitivesById = new Map(
      previousSnapshot === undefined
        ? []
        : buildBattlefieldPrimitives(previousSnapshot).entities.map(
            (entity) => [entity.id, entity]
          )
    );
    for (const [id, effect] of this.abilityEffects)
      if (!abilityImpactIds.includes(id)) {
        effect.destroy();
        this.abilityEffects.delete(id);
        const textureKey = `ability-effect-depth-${id}`;
        if (this.scene.textures.exists(textureKey))
          this.scene.textures.remove(textureKey);
      }
    for (const id of abilityImpactIds) {
      const entity =
        orderedEntities.find((candidate) => candidate.id === id) ??
        previousPrimitivesById.get(id);
      if (entity?.cameraDepth === undefined) continue;
      const effectX = entity.x - 34;
      const effectY = entity.y - 12;
      const texture = createDepthClippedPresentationTexture(
        this.scene,
        "shield-slam-impact",
        `ability-effect-depth-${id}`,
        140,
        96,
        {
          kind: "upright-billboard",
          cameraDepth: entity.cameraDepth,
          cameraDepthPerPixelY: SHUTTERGATE_UPRIGHT_CAMERA_DEPTH_PER_PIXEL_Y,
          depthEdgeGuardPixels: 1,
          frameLeft: Math.round(effectX) - 70,
          frameTop: Math.round(effectY) - 76,
          pivotY: 76
        },
        this.staticDepth
      );
      const effect =
        this.abilityEffects.get(id) ??
        this.scene.add.image(effectX, effectY, texture).setOrigin(0.5, 76 / 96);
      effect
        .setTexture(texture)
        .setPosition(effectX, effectY)
        .setAlpha(0.82)
        .setScale(0.78);
      this.abilityEffects.set(id, effect);
      this.layers["world-effects"].add(effect);
      if (!reduceMotion && impactKey !== this.lastAbilityEffectTick)
        this.scene.tweens.add({
          targets: effect,
          alpha: 0.35,
          scale: 0.9,
          duration: 180,
          yoyo: true
        });
    }
    this.lastAbilityEffectTick = impactKey;
    this.updateDepartures();

    const terminalResult =
      snapshot.schemaVersion === 2 ? snapshot.encounter.terminalResult : null;
    const terminal = snapshot.phase === "terminal";
    const terminalVisible = terminal && this.departures.size === 0;
    this.terminalFrame.setVisible(terminalVisible);
    this.terminalText
      .setText(
        terminalResult === "victory"
          ? "VICTORY\nSHUTTERGATE HOLDS"
          : terminalResult === "defeat"
            ? "DEFEAT\nTHE GATE HAS FALLEN"
            : "COMBAT RESOLVED"
      )
      .setVisible(terminalVisible);

    for (const entity of orderedEntities) {
      const objects = this.entities.get(entity.id);
      if (objects !== undefined) this.scene.children.bringToTop(objects.ring);
    }
    for (const effect of active) this.scene.children.bringToTop(effect);
    for (const effect of this.projectileEffects.values())
      this.scene.children.bringToTop(effect);
    for (const effect of this.actionEffects.values())
      this.scene.children.bringToTop(effect);
    for (const entity of orderedEntities) {
      const objects = this.entities.get(entity.id);
      if (objects !== undefined)
        this.scene.children.bringToTop(objects.subject);
    }
    this.scene.children.bringToTop(this.lighting);
    for (const effect of active) this.scene.children.bringToTop(effect);
    for (const effect of this.abilityEffects.values())
      this.scene.children.bringToTop(effect);
    for (const objects of this.entities.values())
      this.scene.children.bringToTop(objects.signal);
    for (const { objects } of this.departures.values()) {
      this.scene.children.bringToTop(objects.subject);
      this.scene.children.bringToTop(objects.signal);
    }
    if (terminalVisible) {
      this.scene.children.bringToTop(this.terminalFrame);
      this.scene.children.bringToTop(this.terminalText);
    }

    if (typeof window !== "undefined") {
      window.__DWARVEN_DEPTHS_TRUTH_SCREEN__ = buildTruthScreenSidecar(
        snapshot,
        primitives,
        {
          dwarf: measureTextureAlpha(this.scene, wardenTexture),
          enemy: measureTextureAlpha(this.scene, raiderTexture),
          entities: new Map(
            snapshot.entities.map((entity) => [
              entity.id,
              measureTextureAlpha(
                this.scene,
                poseTextures.get(selectCombatPoseAsset(snapshot, entity.id)) ??
                  selectCombatPoseAsset(snapshot, entity.id)
              )
            ])
          ),
          groundForeground: measureTextureAlpha(
            this.scene,
            "entrance-route-ground-foreground"
          ),
          foreground: measureTextureAlpha(
            this.scene,
            "entrance-route-foreground"
          ),
          rear: measureTextureAlpha(this.scene, "entrance-route-rear")
        },
        [window.innerWidth, window.innerHeight],
        [...this.entities.values()].map(({ subject }, index) => {
          if (!(subject instanceof Phaser.GameObjects.Image))
            return {
              id: `invalid.rendered-subject.${index}`,
              faction: "enemy" as const
            };
          const id = subject.getData("renderEntityId");
          const faction = renderedFactionForSourceKey(
            subject.getData("renderSourceKey")
          );
          return {
            id:
              typeof id === "string" ? id : `invalid.rendered-subject.${index}`,
            faction: faction ?? "enemy"
          };
        })
      );
      window.__DWARVEN_DEPTHS_RENDERER__ = this.diagnostics();
    }
  }

  diagnostics(): BattlefieldRendererDiagnostics {
    const activeEntities =
      this.lastSnapshot?.schemaVersion === 2
        ? this.lastSnapshot.entities.flatMap((entity) => {
            const objects = this.entities.get(entity.id);
            if (objects === undefined) return [];
            return [
              {
                id: entity.id,
                nodeId: entity.nodeId,
                worldPosition: [entity.position.x, entity.position.y] as const,
                screenPosition: [objects.pivotX, objects.pivotY] as const,
                currentHealth: entity.currentHealth,
                action: {
                  kind: entity.action.kind,
                  phase: entity.action.phase
                },
                lifecycle: "active" as const,
                transitionTick: null,
                alpha: objects.subject.alpha
              }
            ];
          })
        : [];
    const departingEntities = [...this.departures.values()].map(
      ({ entity, kind, objects, transitionTick }) => ({
        id: entity.id,
        nodeId: entity.nodeId,
        worldPosition: [entity.position.x, entity.position.y] as const,
        screenPosition: [objects.subject.x, objects.subject.y] as const,
        currentHealth: entity.currentHealth,
        action: {
          kind: entity.action.kind,
          phase: entity.action.phase
        },
        lifecycle: kind,
        transitionTick,
        alpha: objects.subject.alpha
      })
    );
    return {
      schemaVersion: 1,
      snapshotTick: this.lastSnapshot?.tick ?? null,
      snapshotPhase: this.lastSnapshot?.phase ?? null,
      updateCount: this.updateCount,
      entityObjects: this.entities.size * 3,
      pooledEffects: this.effects.length,
      activeEffects: this.activeEffects,
      staticObjects: 7,
      sceneObjects: this.scene.children.length,
      runtimeTextures: Object.keys(this.scene.textures.list).filter(
        (key) =>
          key.endsWith("-runtime") ||
          key.startsWith("subject-depth-") ||
          key.startsWith("ring-depth-") ||
          key.startsWith("ability-effect-depth-")
      ).length,
      activeTweens: this.scene.tweens
        .getTweens()
        .filter((tween) => tween.isPlaying()).length,
      timerEvents: 0,
      loaderListeners: this.scene.load.listenerCount("loaderror"),
      entities: [...activeEntities, ...departingEntities].sort((left, right) =>
        compareRenderIds(left.id, right.id)
      ),
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
      this.scene.tweens.killTweensOf([objects.ring, objects.subject]);
      objects.signal.clearMask(true);
      objects.subject.setTexture("warden-runtime");
    }
    for (const [id, departure] of this.departures)
      this.destroyEntityObjects(id, departure.objects);
    for (const effect of this.effects) effect.clearMask(true);
    for (const effect of this.projectileEffects.values()) effect.destroy();
    this.projectileEffects.clear();
    for (const effect of this.actionEffects.values()) effect.destroy();
    this.actionEffects.clear();
    for (const effect of this.abilityEffects.values()) effect.destroy();
    this.abilityEffects.clear();
    this.entities.clear();
    this.departures.clear();
    this.actionClocks.clear();
    this.effects.length = 0;
    for (const layer of Object.values(this.layers)) layer.clear();
  }
}

interface BattlefieldRenderer {
  update(
    snapshot: RenderSnapshot,
    feedback: CombatFeedback | undefined,
    reduceMotion: boolean,
    simulationSpeed: 1 | 2,
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
  initialSimulationSpeed: 1 | 2,
  initialEvidenceEffectAlpha: number | undefined,
  onTerminalPresentationStarted: (snapshot: RenderSnapshot) => void,
  onTerminalPresentationCompleted: (snapshot: RenderSnapshot) => void
): BattlefieldRenderer {
  let snapshot = initialSnapshot;
  let feedback = initialFeedback;
  let reduceMotion = initialReduceMotion;
  let simulationSpeed = initialSimulationSpeed;
  let evidenceEffectAlpha = initialEvidenceEffectAlpha;
  let persistentScene: PersistentBattlefieldScene | undefined;
  let rendererUnavailable = false;
  const loadErrors = new Set<string>();
  const completeUnavailableTerminal = (
    terminalSnapshot: RenderSnapshot
  ): void => {
    if (
      terminalSnapshot.schemaVersion !== 2 ||
      terminalSnapshot.phase !== "terminal"
    )
      return;
    onTerminalPresentationStarted(terminalSnapshot);
    onTerminalPresentationCompleted(terminalSnapshot);
  };
  const game = new Phaser.Game({
    type: Phaser.CANVAS,
    width: WIDTH,
    height: HEIGHT,
    parent,
    backgroundColor: "#080604",
    banner: false,
    audio: { noAudio: true },
    loader: { imageLoadType: "HTMLImageElement" },
    render: { antialias: true, pixelArt: false },
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    scene: {
      preload(this: Phaser.Scene) {
        this.load.on("loaderror", (file: { readonly key: string }) => {
          loadErrors.add(file.key);
        });
        for (const key of BATTLEFIELD_RUNTIME_ASSET_KEYS) {
          const url = battlefieldAssetUrls[key];
          if (url === undefined) loadErrors.add(key);
          else this.load.image(key, url);
        }
      },
      create(this: Phaser.Scene) {
        if (loadErrors.size > 0) {
          rendererUnavailable = true;
          parent.setAttribute("data-renderer-error", "asset-load-failed");
          parent.setAttribute(
            "data-renderer-error-assets",
            [...loadErrors].sort().join(",")
          );
          this.add
            .text(WIDTH / 2, HEIGHT / 2, "Battlefield assets failed to load.", {
              color: "#f4d7bd",
              fontFamily: "system-ui, sans-serif",
              fontSize: "24px"
            })
            .setOrigin(0.5);
          completeUnavailableTerminal(snapshot);
          return;
        }
        const staticDepth = decodeBattlefieldDepthTexture(this);
        if (staticDepth === undefined) {
          rendererUnavailable = true;
          parent.setAttribute("data-renderer-error", "invalid-depth-asset");
          this.add
            .text(WIDTH / 2, HEIGHT / 2, "Battlefield depth data is invalid.", {
              color: "#f4d7bd",
              fontFamily: "system-ui, sans-serif",
              fontSize: "24px"
            })
            .setOrigin(0.5);
          completeUnavailableTerminal(snapshot);
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
        if (snapshot.schemaVersion === 2 && snapshot.phase === "terminal")
          onTerminalPresentationStarted(snapshot);
        if (persistentScene.terminalPresentationComplete())
          onTerminalPresentationCompleted(snapshot);
      },
      update(_time: number, delta: number) {
        persistentScene?.updateMotion(delta, simulationSpeed, reduceMotion);
        persistentScene?.updateDepartures();
        if (
          persistentScene?.terminalPresentationComplete() === true &&
          snapshot.schemaVersion === 2
        )
          onTerminalPresentationCompleted(snapshot);
        if (typeof window !== "undefined" && persistentScene !== undefined)
          window.__DWARVEN_DEPTHS_RENDERER__ = persistentScene.diagnostics();
      }
    }
  });
  return {
    update(
      nextSnapshot,
      nextFeedback,
      nextReduceMotion,
      nextSimulationSpeed,
      nextPreviousSnapshot,
      nextEvidenceEffectAlpha
    ) {
      snapshot = nextSnapshot;
      feedback = nextFeedback;
      reduceMotion = nextReduceMotion;
      simulationSpeed = nextSimulationSpeed;
      evidenceEffectAlpha = nextEvidenceEffectAlpha;
      if (rendererUnavailable) {
        completeUnavailableTerminal(snapshot);
        return;
      }
      persistentScene?.update(
        snapshot,
        feedback,
        reduceMotion,
        nextPreviousSnapshot,
        evidenceEffectAlpha
      );
      if (
        persistentScene !== undefined &&
        snapshot.schemaVersion === 2 &&
        snapshot.phase === "terminal"
      )
        onTerminalPresentationStarted(snapshot);
      if (persistentScene?.terminalPresentationComplete() === true)
        onTerminalPresentationCompleted(snapshot);
    },
    destroy() {
      persistentScene?.destroy();
      persistentScene = undefined;
      game.destroy(true);
      parent.replaceChildren();
      parent.removeAttribute("data-renderer-error");
      parent.removeAttribute("data-renderer-error-assets");
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
  soundVolume = 1,
  simulationSpeed = 1,
  evidenceEffectAlpha,
  onTerminalPresentationStarted = () => undefined,
  onTerminalPresentationCompleted = () => undefined
}: {
  readonly snapshot: RenderSnapshot;
  readonly reduceMotion: boolean;
  readonly soundEnabled: boolean;
  readonly soundVolume?: number;
  readonly simulationSpeed?: 1 | 2;
  readonly evidenceEffectAlpha?: number;
  readonly onTerminalPresentationStarted?: (snapshot: RenderSnapshot) => void;
  readonly onTerminalPresentationCompleted?: (snapshot: RenderSnapshot) => void;
}) {
  const parentRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<BattlefieldRenderer | undefined>(undefined);
  const latestSnapshotRef = useRef(snapshot);
  const latestFeedbackRef = useRef<CombatFeedback | undefined>(undefined);
  const latestReduceMotionRef = useRef(reduceMotion);
  const latestSimulationSpeedRef = useRef(simulationSpeed);
  const latestEvidenceEffectAlphaRef = useRef(evidenceEffectAlpha);
  const latestTerminalPresentationStartedRef = useRef(
    onTerminalPresentationStarted
  );
  const latestTerminalPresentationCompletedRef = useRef(
    onTerminalPresentationCompleted
  );
  const previousSnapshotRef = useRef<RenderSnapshot | undefined>(undefined);
  const soundPlayerRef = useRef<CombatSoundPlayer | undefined>(undefined);
  const [feedback, setFeedback] = useState<CombatFeedback | undefined>();
  latestSnapshotRef.current = snapshot;
  latestReduceMotionRef.current = reduceMotion;
  latestSimulationSpeedRef.current = simulationSpeed;
  latestEvidenceEffectAlphaRef.current = evidenceEffectAlpha;
  latestTerminalPresentationStartedRef.current = onTerminalPresentationStarted;
  latestTerminalPresentationCompletedRef.current =
    onTerminalPresentationCompleted;

  useEffect(() => {
    if (!soundEnabled) {
      soundPlayerRef.current?.close();
      soundPlayerRef.current = undefined;
      return;
    }
    const player = createCombatSoundPlayer(undefined, soundVolume);
    soundPlayerRef.current = player;
    const unlock = () => player.unlock();
    document.addEventListener("pointerdown", unlock, { capture: true });
    document.addEventListener("keydown", unlock, { capture: true });
    return () => {
      document.removeEventListener("pointerdown", unlock, { capture: true });
      document.removeEventListener("keydown", unlock, { capture: true });
      player.close();
      if (soundPlayerRef.current === player) soundPlayerRef.current = undefined;
    };
  }, [soundEnabled, soundVolume]);

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
        latestSimulationSpeedRef.current,
        latestEvidenceEffectAlphaRef.current,
        (terminalSnapshot) =>
          latestTerminalPresentationStartedRef.current(terminalSnapshot),
        (terminalSnapshot) =>
          latestTerminalPresentationCompletedRef.current(terminalSnapshot)
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
      shouldAdvanceCombatFeedbackBaseline(previousSnapshot, snapshot)
    )
      previousSnapshotRef.current = snapshot;
    latestFeedbackRef.current = renderedFeedback;
    setFeedback(nextFeedback);
    rendererRef.current?.update(
      snapshot,
      renderedFeedback,
      reduceMotion,
      simulationSpeed,
      previousSnapshot,
      evidenceEffectAlpha
    );
    if (nextFeedback !== undefined) soundPlayerRef.current?.play(nextFeedback);
  }, [evidenceEffectAlpha, reduceMotion, simulationSpeed, snapshot]);

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
