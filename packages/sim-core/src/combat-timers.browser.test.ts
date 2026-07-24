import {
  type ActiveCooldown,
  type ActiveStatus,
  canonicalHash,
  type StatusApplication
} from "@dwarven-depths/contracts";
import { describe, expect, it } from "vitest";
import { applyStatusApplications, resolveCombatTimers } from "./index.js";

const cooldown: ActiveCooldown = {
  schemaVersion: 1,
  cooldownId: "cooldown.warden.basic" as never,
  ownerEntityId: "entity.dwarf.warden" as never,
  startedAtTick: 10,
  completeAtTick: 20
};
const status: ActiveStatus = {
  schemaVersion: 1,
  statusId: "status.haste" as never,
  ownerEntityId: "entity.dwarf.warden" as never,
  appliedAtTick: 10,
  expiresAtTick: 20,
  magnitude: 4
};
const application: StatusApplication = {
  schemaVersion: 1,
  statusId: "status.haste" as never,
  ownerEntityId: "entity.dwarf.warden" as never,
  durationTicks: 8,
  magnitude: 3
};

function parityFixture() {
  const beforeBoundary = resolveCombatTimers({
    currentTick: 19,
    cooldowns: [cooldown],
    statuses: [status]
  });
  const atBoundary = resolveCombatTimers({
    currentTick: 20,
    cooldowns: [cooldown],
    statuses: [status]
  });
  const refreshed = applyStatusApplications({
    currentTick: 15,
    statuses: [status],
    applications: [
      application,
      {
        ...application,
        statusId: "status.slow" as never,
        ownerEntityId: "entity.enemy.cutter" as never,
        magnitude: 7
      }
    ]
  });
  return { beforeBoundary, atBoundary, refreshed };
}

describe("combat timer browser parity", () => {
  it("pins fixed-step boundaries and status refresh semantics", async () => {
    const fixture = parityFixture();
    expect(fixture.beforeBoundary.cooldownDecisions[0]?.status).toBe("active");
    expect(fixture.atBoundary.cooldownDecisions[0]?.status).toBe("completed");
    expect(fixture.refreshed.statuses).toHaveLength(2);
    expect(await canonicalHash(fixture)).toBe(
      "b32a1bf57b86a6d89a81dc703bd2865e451d59bd1dbbb79960a96c9dbb263d97"
    );
  });

  it("is independent of timer input order", () => {
    const alpha = {
      ...cooldown,
      cooldownId: "cooldown.alpha" as never
    };
    const zulu = { ...cooldown, cooldownId: "cooldown.zulu" as never };
    expect(
      resolveCombatTimers({
        currentTick: 19,
        cooldowns: [zulu, alpha],
        statuses: []
      })
    ).toEqual(
      resolveCombatTimers({
        currentTick: 19,
        cooldowns: [alpha, zulu],
        statuses: []
      })
    );
  });
});
