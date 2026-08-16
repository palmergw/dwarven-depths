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
const EFFECT_DURATION_MS = 1_680;
const REDUCED_MOTION_EFFECT_DURATION_MS = 420;
const MAX_POOLED_EFFECTS = 64;
const FIXTURE_ID = "scenarios/conformance/shuttergate-web-truth.json";
const renderedInitialFeedbackSnapshots = new WeakSet<RenderSnapshot>();

export function hasRenderedInitialFeedback(snapshot: RenderSnapshot): boolean {
  return renderedInitialFeedbackSnapshots.has(snapshot);
}

export function markInitialFeedbackRendered(
  snapshot: RenderSnapshot,
  feedback: CombatFeedback | undefined
): void {
  if (feedback !== undefined && feedback.arrivals.length > 0)
    renderedInitialFeedbackSnapshots.add(snapshot);
}

export function battlefieldEffectLifetime(reduceMotion: boolean): number {
  return reduceMotion ? REDUCED_MOTION_EFFECT_DURATION_MS : EFFECT_DURATION_MS;
}

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

export function locomotionCadenceOffset(
  elapsedMilliseconds: number,
  simulationSpeed: 1 | 2,
  moving: boolean,
  reduceMotion: boolean
): number {
  if (!moving || reduceMotion) return 0;
  return (
    Math.sin(
      (Math.max(0, elapsedMilliseconds) * simulationSpeed * Math.PI) / 180
    ) * 1.5
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
    ["captain", "gatebreaker-captain"],
    ["skirmisher", "goblin-skirmisher"],
    ["sapper", "goblin-sapper"],
    ["hexer", "goblin-hexer"],
    ["banner", "goblin-banner-bearer"],
    ["hunter", "goblin-warden-hunter"]
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
const hostileAttackCycleAssetUrls = Object.fromEntries(
  [
    ["raider", "goblin-cutter"],
    ["slinger", "goblin-slinger"],
    ["bulwark", "goblin-bulwark"],
    ["captain", "gatebreaker-captain"],
    ["skirmisher", "goblin-skirmisher"],
    ["sapper", "goblin-sapper"],
    ["hexer", "goblin-hexer"],
    ["banner", "goblin-banner-bearer"],
    ["hunter", "goblin-warden-hunter"]
  ].flatMap(([key, filename]) =>
    (["windup", "committed", "impact", "recoil", "recovery"] as const).map(
      (phase) => [
        `${key}-attack-${phase}-source`,
        combatAnimationAssetUrl(`${filename}-attack-${phase}.png`)
      ]
    )
  )
);
const wardenAttackCycleAssetUrls = Object.fromEntries(
  (["windup", "committed", "impact", "recoil", "recovery"] as const).map(
    (phase) => [
      `warden-basic-attack-${phase}-source`,
      combatAnimationAssetUrl(`iron-warden-basic-attack-${phase}.png`)
    ]
  )
);
const wardenShieldSlamCycleAssetUrls = Object.fromEntries(
  (["windup", "committed", "impact", "recoil", "recovery"] as const).map(
    (phase) => [
      `warden-shield-slam-${phase}-source`,
      combatAnimationAssetUrl(`iron-warden-shield-slam-${phase}.png`)
    ]
  )
);
const enemyIntentAssetUrls = Object.fromEntries(
  [
    "sapper-intent-crest",
    "sapper-fuse-tell",
    "sapper-blast-impact",
    "sapper-fracture-cancel",
    "hexer-intent-crest",
    "hexer-rune-channel",
    "hexer-target-tether",
    "hexer-fracture-cancel"
  ].map((key) => [key, combatAnimationAssetUrl(`${key}.png`)])
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
const linebreakerImpactUrl = new URL(
  "../../../assets/game-art/production-scene/exports/effects/linebreaker-impact.png",
  import.meta.url
).href;
const rallyingRoarAuraUrl = new URL(
  "../../../assets/game-art/production-scene/exports/effects/rallying-roar-aura.png",
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
  "skirmisher-source": combatAnimationAssetUrl("goblin-skirmisher-idle-s.png"),
  "skirmisher-downed-source": combatAnimationAssetUrl(
    "goblin-skirmisher-downed.png"
  ),
  "sapper-source": combatAnimationAssetUrl("goblin-sapper-idle-s.png"),
  "sapper-downed-source": combatAnimationAssetUrl("goblin-sapper-downed.png"),
  "hexer-source": combatAnimationAssetUrl("goblin-hexer-idle-s.png"),
  "hexer-downed-source": combatAnimationAssetUrl("goblin-hexer-downed.png"),
  "banner-source": combatAnimationAssetUrl("goblin-banner-bearer-idle-s.png"),
  "banner-downed-source": combatAnimationAssetUrl(
    "goblin-banner-bearer-downed.png"
  ),
  "hunter-source": combatAnimationAssetUrl("goblin-warden-hunter-idle-s.png"),
  "hunter-downed-source": combatAnimationAssetUrl(
    "goblin-warden-hunter-downed.png"
  ),
  ...hostileDirectionalAssetUrls,
  ...hostileAttackCycleAssetUrls,
  ...wardenAttackCycleAssetUrls,
  ...wardenShieldSlamCycleAssetUrls,
  ...enemyIntentAssetUrls,
  "warm-light-overlay": warmLightOverlayUrl,
  "hostile-faction-ring": hostileFactionRingUrl,
  "shield-slam-impact": shieldSlamImpactUrl,
  "linebreaker-impact": linebreakerImpactUrl,
  "rallying-roar-aura": rallyingRoarAuraUrl,
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
  | `warden-basic-attack-${"windup" | "committed" | "impact" | "recoil" | "recovery"}-source`
  | "warden-shield-slam-source"
  | `warden-shield-slam-${"windup" | "committed" | "impact" | "recoil" | "recovery"}-source`
  | "warden-hit-source"
  | "warden-guard-source"
  | "warden-downed-source"
  | `${"raider" | "slinger" | "bulwark" | "captain" | "skirmisher" | "sapper" | "hexer" | "banner" | "hunter"}-${"source" | "attack-source" | "downed-source"}`
  | `${"raider" | "slinger" | "bulwark" | "captain" | "skirmisher" | "sapper" | "hexer" | "banner" | "hunter"}-attack-${"windup" | "committed" | "impact" | "recoil" | "recovery"}-source`
  | `${"raider" | "slinger" | "bulwark" | "captain" | "skirmisher" | "sapper" | "hexer" | "banner" | "hunter"}-${"north" | "east" | "west"}-source`;

function hostilePosePrefix(
  visualId: string
):
  | "raider"
  | "slinger"
  | "bulwark"
  | "captain"
  | "skirmisher"
  | "sapper"
  | "hexer"
  | "banner"
  | "hunter" {
  if (visualId === "enemy.goblin_slinger") return "slinger";
  if (visualId === "enemy.goblin_bulwark") return "bulwark";
  if (visualId === "enemy.gatebreaker_captain") return "captain";
  if (visualId === "enemy.goblin_skirmisher") return "skirmisher";
  if (visualId === "enemy.goblin_sapper") return "sapper";
  if (visualId === "enemy.goblin_hexer") return "hexer";
  if (visualId === "enemy.goblin_banner_bearer") return "banner";
  if (visualId === "enemy.goblin_warden_hunter") return "hunter";
  return "raider";
}

function hostileIdlePoseAsset(
  prefix: ReturnType<typeof hostilePosePrefix>,
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
  if (
    dwarf &&
    presentation?.damaged === true &&
    entity.action.kind !== "basic_attack" &&
    entity.action.kind !== "ability"
  )
    return "warden-hit-source";
  const authoredPhase =
    entity.action.phase === "windup" ||
    entity.action.phase === "committed" ||
    entity.action.phase === "impact" ||
    entity.action.phase === "recoil"
      ? entity.action.phase
      : "recovery";
  if (
    dwarf &&
    entity.action.kind === "ability" &&
    entity.action.abilityId === "ability.iron_warden.shield_slam" &&
    entity.action.phase !== "idle"
  )
    return `warden-shield-slam-${authoredPhase}-source`;
  if (
    dwarf &&
    entity.action.kind === "ability" &&
    entity.action.abilityId === "ability.iron_warden.linebreaker" &&
    entity.action.phase !== "idle"
  )
    return `warden-basic-attack-${authoredPhase}-source`;
  if (
    dwarf &&
    entity.action.kind === "ability" &&
    entity.action.abilityId === "ability.iron_warden.rallying_roar"
  )
    return "warden-guard-source";
  if (dwarf && entity.action.kind === "basic_attack") {
    return `warden-basic-attack-${authoredPhase}-source`;
  }
  if (dwarf && entity.action.phase === "recovery") return "warden-guard-source";
  if (dwarf) return "warden-source";
  const prefix = hostilePosePrefix(entity.visualId);
  if (entity.action.kind === "basic_attack" && entity.action.phase !== "idle") {
    return `${prefix}-attack-${authoredPhase}-source`;
  }
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
    | "recoil"
    | "recovery";
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
  const authoredAttack =
    entity.action.kind === "basic_attack" || entity.action.kind === "ability";
  const sourceFacesEast = entity.faction === "dwarf";
  return {
    source,
    angle: 0,
    flipX:
      authoredAttack &&
      ((sourceFacesEast &&
        (entity.facing === "west" || entity.facing === "south")) ||
        (!sourceFacesEast &&
          (entity.facing === "east" || entity.facing === "north"))),
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

export type EnemyIntentMechanic =
  | "direct_pressure"
  | "standoff_fire"
  | "target_intercept"
  | "formation_command"
  | "flank_reposition"
  | "attack_disrupt"
  | "attack_slow"
  | "ally_haste"
  | "target_mark";

export type EnemyIntentPhase = "telling" | "committed" | "cancelled";

export interface EnemyIntentPresentation {
  readonly mechanic: EnemyIntentMechanic;
  readonly phase: EnemyIntentPhase;
}

const enemyIntentMechanics = new Set<EnemyIntentMechanic>([
  "direct_pressure",
  "standoff_fire",
  "target_intercept",
  "formation_command",
  "flank_reposition",
  "attack_disrupt",
  "attack_slow",
  "ally_haste",
  "target_mark"
]);

export function deriveEnemyIntentPresentation(
  statusIds: readonly string[]
): EnemyIntentPresentation | undefined {
  for (const statusId of statusIds) {
    const match =
      /^status\.enemy_behavior\.([a-z_]+)\.(telling|committed|cancelled)$/.exec(
        statusId
      );
    if (match === null) continue;
    const mechanic = match[1] as EnemyIntentMechanic;
    if (!enemyIntentMechanics.has(mechanic)) continue;
    return { mechanic, phase: match[2] as EnemyIntentPhase };
  }
  return undefined;
}

const enemyRoleDetails: Readonly<
  Record<
    string,
    {
      readonly role: string;
      readonly mechanic: string;
      readonly counterplay: string;
    }
  >
> = {
  "enemy.goblin_cutter": {
    role: "Cutter",
    mechanic: "Driving lunge",
    counterplay: "Control before contact"
  },
  "enemy.goblin_slinger": {
    role: "Slinger",
    mechanic: "Standoff shot",
    counterplay: "Break line of sight"
  },
  "enemy.goblin_bulwark": {
    role: "Bulwark",
    mechanic: "Intercepting guard",
    counterplay: "Retarget around guard"
  },
  "enemy.gatebreaker_captain": {
    role: "Gatebreaker Captain",
    mechanic: "Formation command",
    counterplay: "Interrupt the command"
  },
  "enemy.goblin_skirmisher": {
    role: "Skirmisher",
    mechanic: "Flanking feint",
    counterplay: "Deny the flank route"
  },
  "enemy.goblin_sapper": {
    role: "Sapper",
    mechanic: "Sundering fuse",
    counterplay: "Interrupt the fuse"
  },
  "enemy.goblin_hexer": {
    role: "Hexer",
    mechanic: "Slowing hex",
    counterplay: "Interrupt or break line of sight"
  },
  "enemy.goblin_banner_bearer": {
    role: "Banner Bearer",
    mechanic: "Rallying banner",
    counterplay: "Focus the banner bearer"
  },
  "enemy.goblin_warden_hunter": {
    role: "Warden Hunter",
    mechanic: "Hunt mark",
    counterplay: "Break the hunter mark"
  }
};

export function enemyIntentDetail(entity: RenderEntityV2): string | undefined {
  const detail = enemyRoleDetails[entity.visualId];
  if (detail === undefined) return undefined;
  const intent = deriveEnemyIntentPresentation(
    entity.statuses.map(({ id }) => id)
  );
  const phase =
    intent?.phase === "telling"
      ? "Preparing"
      : intent?.phase === "committed"
        ? "Committed"
        : intent?.phase === "cancelled"
          ? "Cancelled"
          : "Watching";
  return `${detail.role} — ${detail.mechanic} · ${phase} · ${detail.counterplay}.`;
}

interface AuthoredEnemyIntentAssets {
  readonly crest: "sapper-intent-crest" | "hexer-intent-crest";
  readonly world:
    | "sapper-fuse-tell"
    | "sapper-blast-impact"
    | "sapper-fracture-cancel"
    | "hexer-rune-channel"
    | "hexer-target-tether"
    | "hexer-fracture-cancel";
  readonly endpoint?: "sapper-blast-impact" | "hexer-target-tether";
}

export function authoredEnemyIntentAssets(
  visualId: string,
  intent: EnemyIntentPresentation
): AuthoredEnemyIntentAssets | undefined {
  if (
    visualId === "enemy.goblin_sapper" &&
    intent.mechanic === "attack_disrupt"
  )
    return {
      crest: "sapper-intent-crest",
      world:
        intent.phase === "telling"
          ? "sapper-fuse-tell"
          : intent.phase === "committed"
            ? "sapper-fuse-tell"
            : "sapper-fracture-cancel",
      ...(intent.phase === "committed"
        ? { endpoint: "sapper-blast-impact" as const }
        : {})
    };
  if (visualId === "enemy.goblin_hexer" && intent.mechanic === "attack_slow")
    return {
      crest: "hexer-intent-crest",
      world:
        intent.phase === "telling"
          ? "hexer-rune-channel"
          : intent.phase === "committed"
            ? "hexer-rune-channel"
            : "hexer-fracture-cancel",
      ...(intent.phase === "committed"
        ? { endpoint: "hexer-target-tether" as const }
        : {})
    };
  return undefined;
}

export function authoredEnemyIntentEffectLayout(
  intent: EnemyIntentPresentation
): "span" | "endpoint" {
  return intent.phase === "cancelled" ? "endpoint" : "span";
}

export function authoredEnemyIntentSpanLength(distance: number): number {
  return Math.max(82, Math.min(320, distance + 12));
}

export function authoredEnemyIntentEffectAlpha(
  intent: EnemyIntentPresentation
): number {
  if (intent.mechanic === "attack_slow") return 0.98;
  if (intent.mechanic === "attack_disrupt" && intent.phase === "telling")
    return 0.94;
  return 0.82;
}

export function animatedEnemyIntentAlpha(
  baseAlpha: number,
  phase: EnemyIntentPhase,
  reduceMotion: boolean,
  cadence: number
): number {
  if (phase === "cancelled") return Math.min(baseAlpha, 0.58);
  if (reduceMotion) return baseAlpha;
  return Math.min(1, baseAlpha + Math.max(0, cadence) * 0.08);
}

function directionBetween(
  source: Readonly<{ x: number; y: number }>,
  target: Readonly<{ x: number; y: number }>
): Readonly<{ x: number; y: number }> {
  const deltaX = target.x - source.x;
  const deltaY = target.y - source.y;
  const distance = Math.hypot(deltaX, deltaY);
  return distance === 0
    ? { x: 1, y: 0 }
    : { x: deltaX / distance, y: deltaY / distance };
}

export function authoredEnemyIntentSourcePoint(
  source: Readonly<{ x: number; y: number }>,
  target: Readonly<{ x: number; y: number }>
): Readonly<{ x: number; y: number }> {
  const direction = directionBetween(source, target);
  return {
    x: source.x + direction.x * 12,
    y: source.y - 14
  };
}

export function authoredEnemyIntentCrestPoint(
  source: Readonly<{ x: number; y: number }>,
  target: Readonly<{ x: number; y: number }>
): Readonly<{ x: number; y: number }> {
  const direction = directionBetween(source, target);
  return {
    x: source.x + direction.x * 25,
    y: source.y - 60
  };
}

export function authoredEnemyIntentTargetPoint(
  intent: EnemyIntentPresentation,
  source: Readonly<{ x: number; y: number }>,
  target: Readonly<{ x: number; y: number }>
): Readonly<{ x: number; y: number }> {
  if (intent.mechanic === "attack_disrupt" && intent.phase === "committed")
    return { x: target.x, y: target.y + 10 };
  const direction = directionBetween(source, target);
  return {
    x: target.x - direction.y * 6,
    y: target.y + 10 + direction.x * 2
  };
}

export function authoredEnemyIntentEndpointPoint(
  intent: EnemyIntentPresentation,
  source: Readonly<{ x: number; y: number }>,
  target: Readonly<{ x: number; y: number }>
): Readonly<{ x: number; y: number }> {
  const destination = authoredEnemyIntentTargetPoint(intent, source, target);
  if (intent.mechanic !== "attack_slow") return destination;
  return {
    x: target.x,
    y: target.y - 8
  };
}

export function authoredEnemyIntentEndpointPresentation(
  asset: NonNullable<AuthoredEnemyIntentAssets["endpoint"]>
): Readonly<{
  width: number;
  height: number;
  alpha: number;
  overlaysRecipient: boolean;
}> {
  return asset === "sapper-blast-impact"
    ? { width: 104, height: 52, alpha: 0.88, overlaysRecipient: false }
    : { width: 72, height: 54, alpha: 0.78, overlaysRecipient: true };
}

export function statusSignalKind(
  statusId: string
):
  | "stagger"
  | "slow"
  | "haste"
  | "behavior_tell"
  | "behavior_commit"
  | "behavior_cooldown"
  | "behavior_cancelled"
  | "unknown" {
  if (statusId.includes("stagger") || statusId.includes("sunder"))
    return "stagger";
  if (statusId.includes("slow")) return "slow";
  if (statusId.includes("haste")) return "haste";
  if (statusId.startsWith("status.enemy_behavior.")) {
    if (statusId.endsWith(".telling")) return "behavior_tell";
    if (statusId.endsWith(".committed")) return "behavior_commit";
    if (statusId.endsWith(".cooling_down")) return "behavior_cooldown";
    if (statusId.endsWith(".cancelled")) return "behavior_cancelled";
  }
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
  const impact = deriveActiveAbilityImpact(snapshot, previousSnapshot);
  return impact?.abilityId === "ability.iron_warden.shield_slam"
    ? impact.targetEntityIds
    : [];
}

export interface ActiveAbilityImpact {
  readonly abilityId: string;
  readonly sourceEntityId: string;
  readonly targetEntityIds: readonly string[];
}

export function deriveActiveAbilityImpact(
  snapshot: RenderSnapshot,
  previousSnapshot: RenderSnapshot | undefined
): ActiveAbilityImpact | undefined {
  if (snapshot.schemaVersion !== 2) return undefined;
  if (
    previousSnapshot?.schemaVersion !== 2 ||
    previousSnapshot.scenarioId !== snapshot.scenarioId ||
    previousSnapshot.tick !== snapshot.previousTick
  )
    return undefined;
  const ability = snapshot.entities.find(
    (entity) =>
      entity.faction === "dwarf" &&
      entity.action.kind === "ability" &&
      entity.action.phase === "impact"
  );
  if (
    ability === undefined ||
    ability.action.kind !== "ability" ||
    ability.action.abilityId === null
  )
    return undefined;
  return {
    abilityId: ability.action.abilityId,
    sourceEntityId: ability.id,
    targetEntityIds: ability.action.impactTargetEntityIds ?? []
  };
}

export function deriveRallyingRoarPresentationSourceId(
  snapshot: RenderSnapshot
): string | undefined {
  if (snapshot.schemaVersion !== 2) return undefined;
  return snapshot.entities.find(
    (entity) =>
      entity.action.kind === "ability" &&
      entity.action.abilityId === "ability.iron_warden.rallying_roar" &&
      (entity.action.phase === "committed" || entity.action.phase === "impact")
  )?.id;
}

export interface SlingerProjectilePath {
  readonly sourceId: string;
  readonly targetId: string;
  readonly phase: "committed" | "impact";
  readonly source: RenderPrimitive;
  readonly target: RenderPrimitive;
}

export function slingerProjectileHead(path: SlingerProjectilePath): {
  readonly x: number;
  readonly y: number;
} {
  return path.phase === "impact"
    ? { x: path.target.x, y: path.target.y - 34 }
    : {
        x: path.source.x + (path.target.x - path.source.x) * 0.58,
        y: path.source.y - 28 + (path.target.y - 6 - path.source.y) * 0.58
      };
}

export function deriveSlingerProjectilePaths(
  snapshot: RenderSnapshot,
  primitives: BattlefieldPrimitives,
  previousSnapshot?: RenderSnapshot
): readonly SlingerProjectilePath[] {
  if (snapshot.schemaVersion !== 2) return [];
  const previousPrimitives =
    previousSnapshot?.schemaVersion === 2 &&
    previousSnapshot.scenarioId === snapshot.scenarioId &&
    previousSnapshot.tick === snapshot.previousTick
      ? buildBattlefieldPrimitives(previousSnapshot)
      : undefined;
  const positions = new Map(
    [...(previousPrimitives?.entities ?? []), ...primitives.entities].map(
      (entity) => [entity.id, entity]
    )
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
              phase: entity.action.phase as "committed" | "impact",
              source,
              target
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
  const texture = scene.textures.exists(outputKey)
    ? (scene.textures.get(outputKey) as Phaser.Textures.CanvasTexture)
    : scene.textures.createCanvas(outputKey, width, height);
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

function clearDepthVisibilityMask(
  object: Phaser.GameObjects.Components.Mask
): void {
  const geometry = object.mask?.geometryMask;
  object.clearMask(true);
  geometry?.destroy();
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
  clearDepthVisibilityMask(signal);
  signal.clear();
  signal.setPosition(0, 0);
  if (presentation === undefined) return;
  const dwarf = entity.faction === "dwarf";
  const width = dwarf ? 46 : 38;
  const top = entity.y - (dwarf ? 72 : 60);
  if (presentation.elite || presentation.boss) {
    signal.fillStyle(presentation.boss ? 0x76512e : 0x34271d, 1);
    signal.fillRoundedRect(
      entity.x - width / 2 - 6,
      top - 6,
      width + 12,
      16,
      4
    );
    signal.lineStyle(1, 0x2a1b11, 1);
    signal.strokeRoundedRect(
      entity.x - width / 2 - 4,
      top - 4,
      width + 8,
      12,
      3
    );
  }
  signal.fillStyle(0x090705, 0.9);
  signal.fillRoundedRect(entity.x - width / 2 - 3, top - 3, width + 6, 10, 2);
  signal.lineStyle(
    presentation.boss ? 3 : presentation.elite ? 2 : 1,
    presentation.boss ? 0xd2a866 : presentation.elite ? 0xb98b45 : 0x6c5b44,
    1
  );
  signal.strokeRoundedRect(entity.x - width / 2 - 3, top - 3, width + 6, 10, 2);
  if (presentation.elite || presentation.boss) {
    const frameColor = presentation.boss ? 0xd2a866 : 0x9a7140;
    signal.lineStyle(presentation.boss ? 3 : 3, frameColor, 0.95);
    signal.strokeRoundedRect(
      entity.x - width / 2 - 5,
      top - 5,
      width + 10,
      14,
      3
    );
    signal.fillStyle(0x3b2818, 1);
    signal.fillRoundedRect(entity.x - width / 2 - 8, top - 5, 7, 14, 2);
    signal.fillRoundedRect(entity.x + width / 2 + 1, top - 5, 7, 14, 2);
    signal.fillTriangle(
      entity.x - width / 2 - 8,
      top - 3,
      entity.x - width / 2 - 3,
      top + 2,
      entity.x - width / 2 - 8,
      top + 7
    );
    signal.fillTriangle(
      entity.x + width / 2 + 8,
      top - 3,
      entity.x + width / 2 + 3,
      top + 2,
      entity.x + width / 2 + 8,
      top + 7
    );
    signal.lineStyle(1, 0xc79b5a, 0.88);
    signal.lineBetween(
      entity.x - width / 2 - 7,
      top + 2,
      entity.x - width / 2 - 3,
      top + 2
    );
    signal.lineBetween(
      entity.x + width / 2 + 3,
      top + 2,
      entity.x + width / 2 + 7,
      top + 2
    );
    signal.fillStyle(0x17100b, 1);
    signal.fillCircle(entity.x - width / 2 - 4.5, top + 2, 1.5);
    signal.fillCircle(entity.x + width / 2 + 4.5, top + 2, 1.5);
  }
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
  if (presentation.elite || presentation.boss) {
    const emblemX = entity.x - width / 2 + 1;
    signal.lineStyle(1.5, 0xf0d394, 1);
    signal.strokeTriangle(
      emblemX,
      top - 1,
      emblemX + 4,
      top + 2,
      emblemX,
      top + 5
    );
    if (presentation.boss)
      signal.lineBetween(emblemX + 4, top + 2, emblemX + 7, top - 1);
  }
  const groundedStatuses = presentation.statusIds.filter((statusId) => {
    const kind = statusSignalKind(statusId);
    return kind === "slow" || kind === "haste";
  });
  for (const [index, statusId] of groundedStatuses.entries()) {
    signal.lineStyle(2, 0xc8b089, 0.9);
    const centerX = entity.x - 9 + index * 9;
    const centerY = entity.y + 3;
    const kind = statusSignalKind(statusId);
    if (kind === "slow") {
      signal.strokeEllipse(centerX, centerY, 18, 7);
      signal.lineBetween(centerX - 4, centerY - 3, centerX + 4, centerY + 3);
    } else if (kind === "haste") {
      signal.lineBetween(centerX - 9, centerY + 2, centerX - 2, centerY - 2);
      signal.lineBetween(centerX, centerY + 2, centerX + 7, centerY - 2);
    }
  }

  if (entity.cameraDepth !== undefined)
    signal.setMask(
      createDepthVisibilityMask(
        scene,
        110,
        110,
        {
          kind: "upright-billboard",
          cameraDepth: entity.cameraDepth,
          cameraDepthPerPixelY: SHUTTERGATE_UPRIGHT_CAMERA_DEPTH_PER_PIXEL_Y,
          depthEdgeGuardPixels: 1,
          frameLeft: Math.round(entity.x) - 55,
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
  clearDepthVisibilityMask(effect);
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
    clearDepthVisibilityMask(image);
    image
      .setTexture(sourceKey)
      .setPosition(entity.x, entity.y)
      .setOrigin(pivotX / width, pivotY / height);
    image.setData("renderEntityId", entity.id);
    image.setData("renderSourceKey", sourceKey);
    return image;
  }
  const image = existing ?? scene.add.image(entity.x, entity.y, sourceKey);
  clearDepthVisibilityMask(image);
  image
    .setTexture(sourceKey)
    .setPosition(entity.x, entity.y)
    .setOrigin(pivotX / width, pivotY / height);
  image.setData("renderEntityId", entity.id);
  image.setData("renderSourceKey", sourceKey);
  image.setMask(
    createDepthVisibilityMask(
      scene,
      width,
      height,
      {
        kind: "upright-billboard",
        cameraDepth: entity.cameraDepth,
        cameraDepthPerPixelY: SHUTTERGATE_UPRIGHT_CAMERA_DEPTH_PER_PIXEL_Y,
        depthEdgeGuardPixels: 1,
        frameLeft: Math.round(entity.x) - pivotX,
        frameTop: Math.round(entity.y) - pivotY,
        pivotY
      },
      staticDepth
    )
  );
  return image;
}

export function renderedFactionForSourceKey(
  sourceKey: unknown
): RenderEntity["faction"] | undefined {
  if (typeof sourceKey !== "string") return undefined;
  if (sourceKey.startsWith("warden-")) return "dwarf";
  if (
    [
      "raider-",
      "slinger-",
      "bulwark-",
      "captain-",
      "skirmisher-",
      "sapper-",
      "hexer-",
      "banner-",
      "hunter-"
    ].some((prefix) => sourceKey.startsWith(prefix))
  )
    return "enemy";
  return undefined;
}

interface PersistentEntityObjects {
  readonly ring: Phaser.GameObjects.Image;
  readonly subject: Phaser.GameObjects.Image;
  readonly signal: Phaser.GameObjects.Graphics;
  damagedUntil: number;
  signalDamaged: boolean;
  signalEntity: RenderPrimitive | undefined;
  signalPresentation: CombatPresentationState | undefined;
  motionX: number;
  motionY: number;
  targetX: number;
  targetY: number;
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
  readonly behaviorEffects = new Map<string, Phaser.GameObjects.Image>();
  readonly behaviorEndpoints = new Map<string, Phaser.GameObjects.Image>();
  readonly behaviorCrests = new Map<string, Phaser.GameObjects.Image>();
  readonly abilityEffects = new Map<string, Phaser.GameObjects.Image>();
  readonly lighting: Phaser.GameObjects.Image;
  readonly terminalFrame: Phaser.GameObjects.Graphics;
  readonly terminalText: Phaser.GameObjects.Text;
  updateCount = 0;
  activeEffects = 0;
  effectsExpireAt = 0;
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
    objects.motionX = origin.x;
    objects.motionY = origin.y;
    objects.ring.setPosition(origin.x, origin.y);
    objects.subject.setPosition(origin.x, origin.y);
    objects.subject.mask?.geometryMask?.setPosition(offsetX, offsetY);
    objects.signal.setPosition(offsetX, offsetY);
    const signalMask = objects.signal.mask?.geometryMask;
    signalMask?.setPosition(offsetX, offsetY);
  }

  updateMotion(
    deltaMilliseconds: number,
    simulationSpeed: 1 | 2,
    reduceMotion: boolean
  ): void {
    if (this.activeEffects > 0 && this.scene.time.now >= this.effectsExpireAt) {
      for (const effect of this.effects) {
        clearDepthVisibilityMask(effect);
        effect.setVisible(false);
      }
      this.activeEffects = 0;
      this.effectsExpireAt = 0;
    }
    const maximumStep = interpolationDistanceForFrame(
      deltaMilliseconds,
      simulationSpeed
    );
    for (const presentation of [
      ...this.behaviorEffects.values(),
      ...this.behaviorEndpoints.values(),
      ...this.behaviorCrests.values()
    ]) {
      const phase = presentation.getData("phase") as EnemyIntentPhase;
      const cadence =
        reduceMotion || phase === "cancelled"
          ? 0
          : Math.sin(
              (this.scene.time.now * simulationSpeed * Math.PI) /
                (phase === "committed" ? 260 : 520)
            );
      const pulse = 1 + cadence * (phase === "committed" ? 0.055 : 0.035);
      presentation.setScale(
        Number(presentation.getData("baseScaleX")) * pulse,
        Number(presentation.getData("baseScaleY")) * pulse
      );
      presentation.setAlpha(
        animatedEnemyIntentAlpha(
          Number(presentation.getData("baseAlpha")),
          phase,
          reduceMotion,
          cadence
        )
      );
    }
    for (const objects of this.entities.values()) {
      const deltaX = objects.targetX - objects.motionX;
      const deltaY = objects.targetY - objects.motionY;
      const distance = Math.hypot(deltaX, deltaY);
      const ratio = distance === 0 ? 1 : Math.min(1, maximumStep / distance);
      const x = objects.motionX + deltaX * ratio;
      const y = objects.motionY + deltaY * ratio;
      const locomotionCadence = locomotionCadenceOffset(
        this.scene.time.now,
        simulationSpeed,
        distance > 0,
        reduceMotion
      );
      const staggered = objects.signalPresentation?.statusIds.some(
        (statusId) => statusSignalKind(statusId) === "stagger"
      );
      const recoilX = staggered ? -5 : 0;
      const recoilAngle = staggered ? -8 : 0;
      objects.motionX = x;
      objects.motionY = y;
      objects.subject
        .setPosition(x + recoilX, y + locomotionCadence + (staggered ? 3 : 0))
        .setAngle(recoilAngle);
      objects.ring.setPosition(x, y);
      const offsetX = x + recoilX - objects.targetX;
      const offsetY =
        y + locomotionCadence + (staggered ? 3 : 0) - objects.targetY;
      objects.subject.mask?.geometryMask?.setPosition(offsetX, offsetY);
      objects.signal.setPosition(offsetX, offsetY);
      objects.signal.mask?.geometryMask?.setPosition(offsetX, offsetY);
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
  }

  private destroyEntityObjects(
    id: string,
    objects: PersistentEntityObjects
  ): void {
    this.layers["world-rings"].delete(objects.ring);
    this.layers["world-entities"].delete(objects.subject);
    this.layers["world-effects"].delete(objects.signal);
    objects.ring.destroy();
    clearDepthVisibilityMask(objects.subject);
    clearDepthVisibilityMask(objects.signal);
    objects.signal.destroy();
    objects.subject.setTexture("warden-runtime");
    objects.subject.destroy();
    for (const textureKey of [`ring-depth-${id}`])
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
      subject.mask?.geometryMask?.setPosition(0, subject.y - departure.originY);
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
      ...(["windup", "committed", "impact", "recoil", "recovery"] as const).map(
        (phase) => `warden-basic-attack-${phase}-source` as const
      ),
      "warden-shield-slam-source",
      ...(["windup", "committed", "impact", "recoil", "recovery"] as const).map(
        (phase) => `warden-shield-slam-${phase}-source` as const
      ),
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
      "captain-downed-source",
      ...(["raider", "slinger", "bulwark", "captain"] as const).flatMap(
        (role) =>
          (
            ["windup", "committed", "impact", "recoil", "recovery"] as const
          ).map((phase) => `${role}-attack-${phase}-source` as const)
      ),
      ...(
        ["skirmisher", "sapper", "hexer", "banner", "hunter"] as const
      ).flatMap((role) => [
        `${role}-source` as const,
        `${role}-downed-source` as const,
        ...(["north", "east", "west"] as const).map(
          (facing) => `${role}-${facing}-source` as const
        ),
        ...(
          ["windup", "committed", "impact", "recoil", "recovery"] as const
        ).map((phase) => `${role}-attack-${phase}-source` as const)
      ])
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
          : { id: entity.id, x: existing.motionX, y: existing.motionY };
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
          signalDamaged: false,
          signalEntity: undefined,
          signalPresentation: undefined,
          motionX: entity.x,
          motionY: entity.y,
          targetX: entity.x,
          targetY: entity.y
        });
      }
      const objects = this.entities.get(entity.id);
      if (objects !== undefined) {
        if (presentation?.damaged === true)
          objects.damagedUntil =
            this.scene.time.now + DAMAGE_SIGNAL_DURATION_MS;
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
        objects.motionX = entity.x;
        objects.motionY = entity.y;
        objects.targetX = entity.x;
        objects.targetY = entity.y;
      }
    }
    if (interpolationTick !== undefined)
      this.lastInterpolatedTick = interpolationTick;

    if (
      feedback !== undefined &&
      (feedback.arrivals.length > 0 || feedback.departures.length > 0)
    ) {
      this.scene.tweens.killTweensOf(this.effects);
      this.activeEffects = 0;
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
      for (
        let index = this.activeEffects;
        index < this.effects.length;
        index += 1
      ) {
        const effect = this.effects[index];
        if (effect !== undefined) {
          clearDepthVisibilityMask(effect);
          effect.setVisible(false);
        }
      }
      const active = this.effects.slice(0, this.activeEffects);
      this.effectsExpireAt =
        active.length === 0
          ? 0
          : this.scene.time.now + battlefieldEffectLifetime(reduceMotion);
      if (
        active.length > 0 &&
        !reduceMotion &&
        evidenceEffectAlpha === undefined
      )
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
    }

    const projectilePaths = deriveSlingerProjectilePaths(
      snapshot,
      primitives,
      previousSnapshot
    );
    const activeAbilityImpact = deriveActiveAbilityImpact(
      snapshot,
      previousSnapshot
    );
    const abilityImpactIds = activeAbilityImpact?.targetEntityIds ?? [];
    const liveProjectileIds = new Set(
      projectilePaths.map(({ sourceId }) => sourceId)
    );
    if (
      activeAbilityImpact?.abilityId === "ability.iron_warden.shield_slam" &&
      abilityImpactIds.length > 0
    )
      liveProjectileIds.add("shield-slam-area");
    for (const [id, effect] of this.projectileEffects)
      if (!liveProjectileIds.has(id)) {
        this.layers["world-effects"].delete(effect);
        effect.destroy();
        this.projectileEffects.delete(id);
      }
    for (const path of projectilePaths) {
      const effect =
        this.projectileEffects.get(path.sourceId) ?? this.scene.add.graphics();
      effect.clear();
      effect.lineStyle(2, 0xc88942, 0.72);
      const { x: projectileX, y: projectileY } = slingerProjectileHead(path);
      effect.lineBetween(
        path.source.x,
        path.source.y - 28,
        projectileX,
        projectileY
      );
      effect.fillStyle(0xffd17a, 1);
      effect.fillCircle(projectileX, projectileY, reduceMotion ? 3 : 4);
      effect.lineStyle(1, 0xe9b762, 0.75);
      effect.strokeCircle(path.source.x, path.source.y - 28, 3);
      effect.setAlpha(reduceMotion ? 0.82 : 1);
      if (!this.projectileEffects.has(path.sourceId)) {
        this.projectileEffects.set(path.sourceId, effect);
        this.layers["world-effects"].add(effect);
      }
    }

    const primitiveById = new Map(
      primitives.entities.map((entity) => [entity.id, entity])
    );
    const behaviorTells =
      snapshot.schemaVersion === 2
        ? snapshot.entities.flatMap((entity) => {
            if (entity.faction !== "enemy") return [];
            const intent = deriveEnemyIntentPresentation(
              entity.statuses.map(({ id }) => id)
            );
            const source = primitiveById.get(entity.id);
            return intent === undefined || source === undefined
              ? []
              : [{ entity, intent, source }];
          })
        : [];
    const authoredBehaviorTells = behaviorTells.flatMap((tell) => {
      const assets = authoredEnemyIntentAssets(
        tell.entity.visualId,
        tell.intent
      );
      return assets === undefined ? [] : [{ ...tell, assets }];
    });
    const liveBehaviorEffectIds = new Set(
      authoredBehaviorTells.map(({ entity }) => entity.id)
    );
    for (const [id, effect] of this.behaviorEffects)
      if (!liveBehaviorEffectIds.has(id)) {
        this.layers["world-effects"].delete(effect);
        effect.destroy();
        this.behaviorEffects.delete(id);
      }
    for (const [id, endpoint] of this.behaviorEndpoints)
      if (!liveBehaviorEffectIds.has(id)) {
        this.layers["world-effects"].delete(endpoint);
        endpoint.destroy();
        this.behaviorEndpoints.delete(id);
      }
    for (const [id, crest] of this.behaviorCrests)
      if (!liveBehaviorEffectIds.has(id)) {
        this.layers["world-focus"].delete(crest);
        crest.destroy();
        this.behaviorCrests.delete(id);
      }
    for (const {
      entity: sourceEntity,
      intent,
      source,
      assets
    } of authoredBehaviorTells) {
      const target =
        sourceEntity.targetEntityId === null
          ? undefined
          : primitiveById.get(sourceEntity.targetEntityId);
      const targetPoint = target ?? source;
      const origin = authoredEnemyIntentSourcePoint(source, targetPoint);
      const destination = authoredEnemyIntentTargetPoint(
        intent,
        origin,
        targetPoint
      );
      const endpointPoint = authoredEnemyIntentEndpointPoint(
        intent,
        origin,
        targetPoint
      );
      const crestPoint = authoredEnemyIntentCrestPoint(source, targetPoint);
      const midpointX = (origin.x + destination.x) / 2;
      const midpointY = (origin.y + destination.y) / 2;
      const distance = Math.hypot(
        destination.x - origin.x,
        destination.y - origin.y
      );
      const angle = Math.atan2(
        destination.y - origin.y,
        destination.x - origin.x
      );
      const effect =
        this.behaviorEffects.get(sourceEntity.id) ??
        this.scene.add.image(midpointX, midpointY, assets.world);
      effect
        .setTexture(assets.world)
        .setOrigin(0.5)
        .setAlpha(authoredEnemyIntentEffectAlpha(intent));
      if (authoredEnemyIntentEffectLayout(intent) === "endpoint")
        effect
          .setPosition(destination.x, destination.y)
          .setDisplaySize(104, 52)
          .setRotation(0);
      else if (intent.mechanic === "attack_disrupt")
        effect
          .setPosition(midpointX, midpointY)
          .setDisplaySize(authoredEnemyIntentSpanLength(distance), 44)
          .setRotation(angle);
      else
        effect
          .setPosition(midpointX, midpointY)
          .setDisplaySize(
            authoredEnemyIntentSpanLength(distance),
            intent.mechanic === "attack_slow" ? 44 : 40
          )
          .setRotation(angle);
      effect.setData("baseScaleX", effect.scaleX);
      effect.setData("baseScaleY", effect.scaleY);
      effect.setData("baseAlpha", effect.alpha);
      effect.setData("phase", intent.phase);
      if (!this.behaviorEffects.has(sourceEntity.id)) {
        this.behaviorEffects.set(sourceEntity.id, effect);
        this.layers["world-effects"].add(effect);
      }
      if (assets.endpoint === undefined) {
        const staleEndpoint = this.behaviorEndpoints.get(sourceEntity.id);
        if (staleEndpoint !== undefined) {
          this.layers["world-effects"].delete(staleEndpoint);
          staleEndpoint.destroy();
          this.behaviorEndpoints.delete(sourceEntity.id);
        }
      } else {
        const endpointPresentation = authoredEnemyIntentEndpointPresentation(
          assets.endpoint
        );
        const endpoint =
          this.behaviorEndpoints.get(sourceEntity.id) ??
          this.scene.add.image(
            endpointPoint.x,
            endpointPoint.y,
            assets.endpoint
          );
        endpoint
          .setTexture(assets.endpoint)
          .setPosition(endpointPoint.x, endpointPoint.y)
          .setDisplaySize(
            endpointPresentation.width,
            endpointPresentation.height
          )
          .setAlpha(endpointPresentation.alpha)
          .setRotation(0);
        endpoint.setData(
          "overlaysRecipient",
          endpointPresentation.overlaysRecipient
        );
        endpoint.setData("baseScaleX", endpoint.scaleX);
        endpoint.setData("baseScaleY", endpoint.scaleY);
        endpoint.setData("baseAlpha", endpoint.alpha);
        endpoint.setData("phase", intent.phase);
        if (!this.behaviorEndpoints.has(sourceEntity.id)) {
          this.behaviorEndpoints.set(sourceEntity.id, endpoint);
          this.layers["world-effects"].add(endpoint);
        }
      }
      const crest =
        this.behaviorCrests.get(sourceEntity.id) ??
        this.scene.add.image(crestPoint.x, crestPoint.y, assets.crest);
      crest
        .setTexture(assets.crest)
        .setPosition(crestPoint.x, crestPoint.y)
        .setDisplaySize(intent.phase === "committed" ? 38 : 36, 36)
        .setAlpha(intent.phase === "cancelled" ? 0.58 : 1);
      crest.setData("baseScaleX", crest.scaleX);
      crest.setData("baseScaleY", crest.scaleY);
      crest.setData("baseAlpha", crest.alpha);
      crest.setData("phase", intent.phase);
      if (!this.behaviorCrests.has(sourceEntity.id)) {
        this.behaviorCrests.set(sourceEntity.id, crest);
        this.layers["world-focus"].add(crest);
      }
    }

    const impactKey =
      snapshot.schemaVersion === 2 && activeAbilityImpact !== undefined
        ? `${snapshot.scenarioId}:${snapshot.tick}:${activeAbilityImpact.abilityId}:${activeAbilityImpact.sourceEntityId}:${abilityImpactIds.join(",")}`
        : undefined;
    if (
      activeAbilityImpact?.abilityId === "ability.iron_warden.shield_slam" &&
      abilityImpactIds.length > 0 &&
      snapshot.schemaVersion === 2
    ) {
      const sourceId = activeAbilityImpact.sourceEntityId;
      const source = primitives.entities.find(({ id }) => id === sourceId);
      const sourceEntity = snapshot.entities.find(({ id }) => id === sourceId);
      const targets = abilityImpactIds.flatMap((id) => {
        const target = primitives.entities.find((entity) => entity.id === id);
        return target === undefined ? [] : [target];
      });
      if (
        source !== undefined &&
        sourceEntity !== undefined &&
        targets.length > 0
      ) {
        const area =
          this.projectileEffects.get("shield-slam-area") ??
          this.scene.add.graphics();
        const distance = Math.max(
          72,
          ...targets.map((target) =>
            Math.hypot(target.x - source.x, target.y - source.y)
          )
        );
        const facingDelta =
          sourceEntity.facing === "east"
            ? { x: 1, y: 0 }
            : sourceEntity.facing === "west"
              ? { x: -1, y: 0 }
              : sourceEntity.facing === "north"
                ? { x: 0, y: -1 }
                : { x: 0, y: 1 };
        const targetX = source.x + facingDelta.x * distance;
        const targetY = source.y + facingDelta.y * distance;
        const deltaX = targetX - source.x;
        const deltaY = targetY - source.y;
        const perpendicularX = (-deltaY / distance) * 28;
        const perpendicularY = (deltaX / distance) * 28;
        if (Number.isFinite(targetX) && Number.isFinite(targetY)) {
          area.clear();
          area.fillStyle(0xd89b45, reduceMotion ? 0.14 : 0.22);
          area.fillTriangle(
            source.x,
            source.y - 18,
            targetX + perpendicularX,
            targetY + perpendicularY,
            targetX - perpendicularX,
            targetY - perpendicularY
          );
          area.lineStyle(2, 0xf2c16f, 0.55);
          area.strokeTriangle(
            source.x,
            source.y - 18,
            targetX + perpendicularX,
            targetY + perpendicularY,
            targetX - perpendicularX,
            targetY - perpendicularY
          );
          if (!this.projectileEffects.has("shield-slam-area")) {
            this.projectileEffects.set("shield-slam-area", area);
            this.layers["world-effects"].add(area);
          }
        }
      }
    }
    const previousPrimitivesById = new Map(
      previousSnapshot === undefined
        ? []
        : buildBattlefieldPrimitives(previousSnapshot).entities.map(
            (entity) => [entity.id, entity]
          )
    );
    const rallyingRoarSourceId =
      deriveRallyingRoarPresentationSourceId(snapshot);
    const abilityEffectPlacements =
      rallyingRoarSourceId !== undefined
        ? [
            {
              id: `ability.iron_warden.rallying_roar:${rallyingRoarSourceId}`,
              entityId: rallyingRoarSourceId,
              textureKey: "rallying-roar-aura",
              xOffset: 0,
              yOffset: 2,
              scale: 0.82,
              tweenScale: 0.9
            }
          ]
        : activeAbilityImpact === undefined
          ? []
          : activeAbilityImpact.abilityId ===
                "ability.iron_warden.linebreaker" ||
              activeAbilityImpact.abilityId ===
                "ability.iron_warden.shield_slam"
            ? activeAbilityImpact.targetEntityIds.map((entityId) => ({
                id: `${activeAbilityImpact.abilityId}:${entityId}`,
                entityId,
                textureKey:
                  activeAbilityImpact.abilityId ===
                  "ability.iron_warden.linebreaker"
                    ? "linebreaker-impact"
                    : "shield-slam-impact",
                xOffset:
                  activeAbilityImpact.abilityId ===
                  "ability.iron_warden.linebreaker"
                    ? 0
                    : -34,
                yOffset: -12,
                scale:
                  activeAbilityImpact.abilityId ===
                  "ability.iron_warden.linebreaker"
                    ? 0.82
                    : 0.56,
                tweenScale:
                  activeAbilityImpact.abilityId ===
                  "ability.iron_warden.linebreaker"
                    ? 0.9
                    : 0.64
              }))
            : [];
    const liveAbilityEffectIds = new Set(
      abilityEffectPlacements.map(({ id }) => id)
    );
    for (const [id, effect] of this.abilityEffects)
      if (!liveAbilityEffectIds.has(id)) {
        effect.destroy();
        this.abilityEffects.delete(id);
        const textureKey = `ability-effect-depth-${id}`;
        if (this.scene.textures.exists(textureKey))
          this.scene.textures.remove(textureKey);
      }
    for (const placement of abilityEffectPlacements) {
      const entity =
        orderedEntities.find(
          (candidate) => candidate.id === placement.entityId
        ) ?? previousPrimitivesById.get(placement.entityId);
      if (entity?.cameraDepth === undefined) continue;
      const effectX = entity.x + placement.xOffset;
      const effectY = entity.y + placement.yOffset;
      const texture = createDepthClippedPresentationTexture(
        this.scene,
        placement.textureKey,
        `ability-effect-depth-${placement.id}`,
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
        this.abilityEffects.get(placement.id) ??
        this.scene.add.image(effectX, effectY, texture).setOrigin(0.5, 76 / 96);
      effect
        .setTexture(texture)
        .setPosition(effectX, effectY)
        .setAlpha(0.7)
        .setScale(placement.scale);
      this.abilityEffects.set(placement.id, effect);
      this.layers["world-effects"].add(effect);
      if (!reduceMotion && impactKey !== this.lastAbilityEffectTick)
        this.scene.tweens.add({
          targets: effect,
          alpha: 0.35,
          scale: placement.tweenScale,
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
    for (const effect of this.effects.slice(0, this.activeEffects))
      this.scene.children.bringToTop(effect);
    for (const effect of this.projectileEffects.values())
      this.scene.children.bringToTop(effect);
    for (const effect of this.behaviorEffects.values())
      this.scene.children.bringToTop(effect);
    for (const entity of orderedEntities) {
      const objects = this.entities.get(entity.id);
      if (objects !== undefined)
        this.scene.children.bringToTop(objects.subject);
    }
    for (const endpoint of this.behaviorEndpoints.values())
      if (endpoint.getData("overlaysRecipient") === true)
        this.scene.children.bringToTop(endpoint);
    this.scene.children.bringToTop(this.lighting);
    for (const effect of this.effects.slice(0, this.activeEffects))
      this.scene.children.bringToTop(effect);
    for (const effect of this.abilityEffects.values())
      this.scene.children.bringToTop(effect);
    for (const objects of this.entities.values())
      this.scene.children.bringToTop(objects.signal);
    for (const crest of this.behaviorCrests.values())
      this.scene.children.bringToTop(crest);
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
                screenPosition: [objects.subject.x, objects.subject.y] as const,
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
      clearDepthVisibilityMask(objects.signal);
      clearDepthVisibilityMask(objects.subject);
      objects.subject.setTexture("warden-runtime");
    }
    for (const [id, departure] of this.departures)
      this.destroyEntityObjects(id, departure.objects);
    for (const effect of this.effects) clearDepthVisibilityMask(effect);
    for (const effect of this.projectileEffects.values()) effect.destroy();
    this.projectileEffects.clear();
    for (const effect of this.behaviorEffects.values()) {
      effect.destroy();
    }
    this.behaviorEffects.clear();
    for (const endpoint of this.behaviorEndpoints.values()) endpoint.destroy();
    this.behaviorEndpoints.clear();
    for (const crest of this.behaviorCrests.values()) crest.destroy();
    this.behaviorCrests.clear();
    for (const effect of this.abilityEffects.values()) effect.destroy();
    this.abilityEffects.clear();
    this.entities.clear();
    this.departures.clear();
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
  onInitialPresentationRendered: (
    snapshot: RenderSnapshot,
    feedback: CombatFeedback | undefined
  ) => void,
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
        onInitialPresentationRendered(snapshot, feedback);
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
        markInitialFeedbackRendered,
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
    const nextFeedback =
      previousSnapshot === undefined && hasRenderedInitialFeedback(snapshot)
        ? undefined
        : deriveCombatFeedback(previousSnapshot, snapshot);
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

  const inspectorPositions = new Map(
    buildBattlefieldPrimitives(snapshot).entities.map((entity) => [
      entity.id,
      entity
    ])
  );
  const enemyInspectors =
    snapshot.schemaVersion === 2
      ? snapshot.entities.flatMap((entity) => {
          if (entity.faction !== "enemy") return [];
          const position = inspectorPositions.get(entity.id);
          const detail = enemyIntentDetail(entity);
          if (position === undefined || detail === undefined) return [];
          return [
            {
              id: entity.id,
              detail,
              x: (position.x / WIDTH) * 100,
              y: (position.y / HEIGHT) * 100,
              intent: deriveEnemyIntentPresentation(
                entity.statuses.map(({ id }) => id)
              )
            }
          ];
        })
      : [];

  return (
    <figure
      className="battlefield"
      data-fixture-id={FIXTURE_ID}
      data-simulation-tick={snapshot.tick}
      data-entity-count={snapshot.entities.length}
    >
      <div ref={parentRef} className="battlefield-canvas" aria-hidden="true" />
      <fieldset className="battlefield-entity-inspectors">
        <legend className="visually-hidden">Enemy details</legend>
        {enemyInspectors.map(({ id, detail, x, y, intent }) => (
          <button
            key={id}
            type="button"
            className="battlefield-entity-inspector"
            style={{ left: `${x}%`, top: `${y}%` }}
            aria-label={detail}
            data-entity-id={id}
            data-intent-mechanic={intent?.mechanic ?? "none"}
            data-intent-phase={intent?.phase ?? "none"}
            data-motion={reduceMotion ? "static" : "animated"}
          >
            <span>{detail}</span>
          </button>
        ))}
      </fieldset>
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
