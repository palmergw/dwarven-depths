import { compileContent } from "@dwarven-depths/content-runtime";
import type { BattlefieldState } from "@dwarven-depths/contracts";
import { describe, expect, it } from "vitest";
import mapContentInput from "../../../content/fixtures/conformance-map.json" with {
  type: "json"
};
import { renderBattlefieldSvg, renderBattlefieldText } from "./index.js";

async function renderRequest() {
  const content = await compileContent(mapContentInput);
  const map = content.maps.get("map.conformance_diamond" as never);
  if (map === undefined) throw new Error("missing conformance map");
  const state: BattlefieldState = {
    schemaVersion: 1,
    mapId: map.id,
    startedWaveIds: [],
    firedSpawnIds: [],
    occupancy: [
      {
        entityId: "entity.enemy.alpha" as never,
        nodeId: "node.east" as never
      }
    ],
    pendingSpawns: [
      {
        id: "spawn.second" as never,
        authoredOrder: 1,
        entityId: "entity.enemy.second" as never,
        enemyDefinitionId: "enemy.goblin_cutter" as never,
        entranceId: "entrance.west" as never
      }
    ]
  };
  return {
    map,
    state,
    layers: ["map", "occupancy", "path"] as const,
    route: {
      fromNodeId: "node.entry" as never,
      toNodeId: "node.goal" as never
    }
  };
}

const expectedText = `battlefield map.conformance_diamond
layers map,occupancy,path
legend E=entrance P=placement O=occupied *=route
route node.entry -> node.goal cost=20 nodes=node.entry,node.south,node.goal
grid
y=0 [E..*]-[.PO.]
y=1 [...*]-[.P.*]
nodes
- node.east coord=1,0 placement=placement.east occupant=entity.enemy.alpha
- node.entry coord=0,0 entrance=entrance.west routeIndex=0
- node.goal coord=1,1 placement=placement.goal routeIndex=2
- node.south coord=0,1 routeIndex=1
connections
- connection.east_goal node.east <-> node.goal cost=10
- connection.entry_east node.east <-> node.entry cost=10
- connection.entry_south node.entry <-> node.south cost=10
- connection.south_goal node.goal <-> node.south cost=10
queued-spawns
- order=1 spawn.second entity=entity.enemy.second definition=enemy.goblin_cutter entrance=entrance.west
`;

const expectedSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 360" role="img" aria-labelledby="battlefield-title battlefield-description">
<title id="battlefield-title">Battlefield map.conformance_diamond</title>
<desc id="battlefield-description">Layers map,occupancy,path; 1 occupied nodes; 1 queued spawns; route node.entry to node.goal cost 20</desc>
<metadata data-map-id="map.conformance_diamond" data-queued-spawns="1:spawn.second:entity.enemy.second:enemy.goblin_cutter:entrance.west"/>
<g fill="none" stroke="#64748b" stroke-width="4">
<line data-connection-id="connection.east_goal" x1="240" y1="80" x2="240" y2="220"/>
<line data-connection-id="connection.entry_east" x1="240" y1="80" x2="80" y2="80"/>
<line data-connection-id="connection.entry_south" x1="80" y1="80" x2="80" y2="220" class="route" stroke="#f59e0b" stroke-width="10"/>
<line data-connection-id="connection.south_goal" x1="240" y1="220" x2="80" y2="220" class="route" stroke="#f59e0b" stroke-width="10"/>
</g>
<g font-family="monospace" font-size="12">
<g data-node-id="node.east" data-authored-x="1" data-authored-y="0" class="node placement occupied">
<circle cx="240" cy="80" r="24" fill="#0f766e" stroke="#0f172a" stroke-width="4"/>
<text x="240" y="122" text-anchor="middle">node.east</text>
<text x="240" y="46" text-anchor="middle">placement:placement.east occupant:entity.enemy.alpha</text>
</g>
<g data-node-id="node.entry" data-authored-x="0" data-authored-y="0" class="node entrance route">
<circle cx="80" cy="80" r="24" fill="#f8fafc" stroke="#f59e0b" stroke-width="4"/>
<text x="80" y="122" text-anchor="middle">node.entry</text>
<text x="80" y="46" text-anchor="middle">entrance:entrance.west</text>
</g>
<g data-node-id="node.goal" data-authored-x="1" data-authored-y="1" class="node placement route">
<circle cx="240" cy="220" r="24" fill="#f8fafc" stroke="#f59e0b" stroke-width="4"/>
<text x="240" y="262" text-anchor="middle">node.goal</text>
<text x="240" y="186" text-anchor="middle">placement:placement.goal</text>
</g>
<g data-node-id="node.south" data-authored-x="0" data-authored-y="1" class="node route">
<circle cx="80" cy="220" r="24" fill="#f8fafc" stroke="#f59e0b" stroke-width="4"/>
<text x="80" y="262" text-anchor="middle">node.south</text>
</g>
</g>
</svg>
`;

describe("battlefield diagnostics", () => {
  it("pins deterministic text and SVG map, occupancy, queue, and path evidence", async () => {
    const request = await renderRequest();
    expect(renderBattlefieldText(request)).toBe(expectedText);
    expect(renderBattlefieldSvg(request)).toBe(expectedSvg);
  });

  it("rejects mismatched maps, duplicate occupancy, and incomplete path requests", async () => {
    const request = await renderRequest();
    expect(() =>
      renderBattlefieldText({
        ...request,
        state: { ...request.state, mapId: "map.other" as never }
      })
    ).toThrow(/does not match/);
    expect(() =>
      renderBattlefieldText({
        ...request,
        state: {
          ...request.state,
          occupancy: [
            {
              entityId: "entity.enemy.alpha" as never,
              nodeId: "node.east" as never
            },
            {
              entityId: "entity.enemy.beta" as never,
              nodeId: "node.east" as never
            }
          ]
        }
      })
    ).toThrow(/duplicate navigation node/);
    const { route: _route, ...requestWithoutRoute } = request;
    expect(() => renderBattlefieldText(requestWithoutRoute)).toThrow(
      /path layer requires/
    );
  });

  it("escapes SVG labels even when called with unchecked input", async () => {
    const request = await renderRequest();
    const { route: _route, ...requestWithoutRoute } = request;
    const text = renderBattlefieldText({
      ...requestWithoutRoute,
      layers: ["map"]
    });
    const svg = renderBattlefieldSvg({
      ...requestWithoutRoute,
      layers: ["map"],
      map: { ...request.map, id: "map.a&b<unsafe>" as never },
      state: { ...request.state, mapId: "map.a&b<unsafe>" as never }
    });
    expect(svg).toContain("map.a&amp;b&lt;unsafe&gt;");
    expect(svg).not.toContain("map.a&b<unsafe>");
    expect(svg).not.toContain("occupied nodes");
    expect(svg).not.toContain("queued spawns");
    expect(svg).not.toContain("data-queued-spawns");
    expect(svg).not.toContain("entity.enemy.alpha");
    expect(text).not.toContain("queued-spawns");
    expect(text).not.toContain("entity.enemy.alpha");
  });
});
