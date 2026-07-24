import { describe, expect, it } from "vitest";
import shuttergateInput from "../../../content/fixtures/phase-3-shuttergate.json" with {
  type: "json"
};
import { compileContent, validateStaticPlacement } from "./index.js";

const SHUTTERGATE_MANIFEST =
  "a857f29758e18f0496bc24512dc57b3f1c89ae1bfdcb97ffd2054660457e8705";

describe("Shuttergate reference content browser parity", () => {
  it("matches the literal Node manifest and authored encounter shape", async () => {
    const content = await compileContent(shuttergateInput);
    expect(content.manifestHash).toBe(SHUTTERGATE_MANIFEST);

    const level = content.levels.get("level.shuttergate_hall" as never);
    const map = content.maps.get("map.shuttergate_hall" as never);
    if (level === undefined || map === undefined)
      throw new Error("missing Shuttergate reference content");
    expect(level.waveIds).toHaveLength(5);
    expect(
      level.waveIds.flatMap(
        (waveId) => content.waves.get(waveId)?.spawnEvents ?? []
      )
    ).toHaveLength(18);
    expect(
      content.waves
        .get("wave.shuttergate_4" as never)
        ?.spawnEvents.some(
          (spawn) => spawn.enemyDefinitionId === "enemy.gatebreaker_captain"
        )
    ).toBe(true);
    expect(
      content.waves
        .get("wave.shuttergate_5" as never)
        ?.spawnEvents.some(
          (spawn) => spawn.enemyDefinitionId === "enemy.gatebreaker_captain"
        )
    ).toBe(false);
    expect(
      validateStaticPlacement(map, [
        {
          entityId: "entity.dwarf.iron_warden" as never,
          placementPointId: "placement.shuttergate_north_guard" as never
        }
      ])
    ).toEqual({ valid: true, issues: [] });
  });
});
