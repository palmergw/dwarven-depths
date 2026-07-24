import { describe, expect, it } from "vitest";
import referenceCombatantsInput from "../../../content/fixtures/phase-3-reference-combatants.json" with {
  type: "json"
};
import { compileContent } from "./index.js";

describe("reference combatant browser parity", () => {
  it("matches the literal Node manifest checksum", async () => {
    const content = await compileContent(referenceCombatantsInput);
    expect(content.manifestHash).toBe(
      "99db3dd6f233616e3393adba378daf098d1b17c26312f9a9c288df65e21a7aa4"
    );
    expect(
      content.enemies.get("enemy.gatebreaker_captain" as never)
    ).toMatchObject({ classification: "boss", maximumHealth: 360 });
  });
});
