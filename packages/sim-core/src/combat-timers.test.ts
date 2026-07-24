import {
  type ActiveCooldown,
  type ActiveStatus,
  canonicalHash,
  type StatusApplication
} from "@dwarven-depths/contracts";
import { describe, expect, it } from "vitest";
import { applyStatusApplications, resolveCombatTimers } from "./index.js";

function cooldown(overrides: Partial<ActiveCooldown> = {}): ActiveCooldown {
  return {
    schemaVersion: 1,
    cooldownId: "cooldown.warden.basic" as never,
    ownerEntityId: "entity.dwarf.warden" as never,
    startedAtTick: 10,
    completeAtTick: 20,
    ...overrides
  };
}

function status(overrides: Partial<ActiveStatus> = {}): ActiveStatus {
  return {
    schemaVersion: 1,
    statusId: "status.haste" as never,
    ownerEntityId: "entity.dwarf.warden" as never,
    appliedAtTick: 10,
    expiresAtTick: 20,
    magnitude: 4,
    ...overrides
  };
}

function application(
  overrides: Partial<StatusApplication> = {}
): StatusApplication {
  return {
    schemaVersion: 1,
    statusId: "status.haste" as never,
    ownerEntityId: "entity.dwarf.warden" as never,
    durationTicks: 8,
    magnitude: 3,
    ...overrides
  };
}

function parityFixture() {
  const beforeBoundary = resolveCombatTimers({
    currentTick: 19,
    cooldowns: [cooldown()],
    statuses: [status()]
  });
  const atBoundary = resolveCombatTimers({
    currentTick: 20,
    cooldowns: [cooldown()],
    statuses: [status()]
  });
  const refreshed = applyStatusApplications({
    currentTick: 15,
    statuses: [status()],
    applications: [
      application(),
      application({
        statusId: "status.slow" as never,
        ownerEntityId: "entity.enemy.cutter" as never,
        magnitude: 7
      })
    ]
  });
  return { beforeBoundary, atBoundary, refreshed };
}

describe("deterministic combat timers", () => {
  it("retains timers before their boundary and resolves them exactly at it", () => {
    const before = resolveCombatTimers({
      currentTick: 19,
      cooldowns: [cooldown()],
      statuses: [status()]
    });
    expect(before.cooldowns).toHaveLength(1);
    expect(before.statuses).toHaveLength(1);
    expect(before.cooldownDecisions[0]).toMatchObject({
      status: "active",
      reason: "waiting_for_completion"
    });
    expect(before.statusDecisions[0]).toMatchObject({
      status: "active",
      reason: "waiting_for_expiry"
    });

    const boundary = resolveCombatTimers({
      currentTick: 20,
      cooldowns: [cooldown()],
      statuses: [status()]
    });
    expect(boundary.cooldowns).toEqual([]);
    expect(boundary.statuses).toEqual([]);
    expect(boundary.cooldownDecisions[0]).toMatchObject({
      status: "completed",
      reason: "completion_tick_reached"
    });
    expect(boundary.statusDecisions[0]).toMatchObject({
      status: "expired",
      reason: "expiry_tick_reached"
    });
  });

  it("refreshes an identical status while retaining its stronger magnitude", () => {
    const weaker = applyStatusApplications({
      currentTick: 15,
      statuses: [status({ magnitude: 8 })],
      applications: [application({ durationTicks: 12, magnitude: 3 })]
    });
    expect(weaker.statuses).toEqual([
      {
        schemaVersion: 1,
        statusId: "status.haste",
        ownerEntityId: "entity.dwarf.warden",
        appliedAtTick: 15,
        expiresAtTick: 27,
        magnitude: 8
      }
    ]);
    expect(weaker.decisions[0]).toMatchObject({
      status: "refreshed",
      previousMagnitude: 8,
      resultingMagnitude: 8,
      expiresAtTick: 27
    });

    const stronger = applyStatusApplications({
      currentTick: 16,
      statuses: weaker.statuses,
      applications: [application({ durationTicks: 5, magnitude: 10 })]
    });
    expect(stronger.statuses[0]).toMatchObject({
      appliedAtTick: 16,
      expiresAtTick: 21,
      magnitude: 10
    });
  });

  it("coexists across different statuses and sorts every result stably", () => {
    const request = {
      currentTick: 12,
      cooldowns: [
        cooldown({ cooldownId: "cooldown.zulu" as never }),
        cooldown({ cooldownId: "cooldown.alpha" as never })
      ],
      statuses: [
        status({
          ownerEntityId: "entity.enemy.zulu" as never,
          statusId: "status.alpha" as never
        }),
        status({
          ownerEntityId: "entity.enemy.alpha" as never,
          statusId: "status.zulu" as never
        })
      ]
    };
    const before = structuredClone(request);
    const result = resolveCombatTimers(request);
    expect(result.cooldowns.map((item) => item.cooldownId)).toEqual([
      "cooldown.alpha",
      "cooldown.zulu"
    ]);
    expect(result.statuses.map((item) => item.ownerEntityId)).toEqual([
      "entity.enemy.alpha",
      "entity.enemy.zulu"
    ]);
    expect(request).toEqual(before);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.cooldowns)).toBe(true);
    expect(Object.isFrozen(result.cooldowns[0])).toBe(true);
    expect(Object.isFrozen(result.statusDecisions[0])).toBe(true);
  });

  it("rejects malformed records, chronology errors, duplicates, and overflow", () => {
    expect(() =>
      resolveCombatTimers({
        currentTick: 10,
        cooldowns: [cooldown(), cooldown()],
        statuses: []
      })
    ).toThrow("duplicate cooldown ID");
    expect(() =>
      resolveCombatTimers({
        currentTick: 10,
        cooldowns: [],
        statuses: [status(), status()]
      })
    ).toThrow("duplicate owner/status pair");
    expect(() =>
      resolveCombatTimers({
        currentTick: 9,
        cooldowns: [cooldown()],
        statuses: []
      })
    ).toThrow("has not started");
    expect(() =>
      resolveCombatTimers({
        currentTick: 10,
        cooldowns: [],
        statuses: [status({ expiresAtTick: 10 })]
      })
    ).toThrow("expiry must follow");
    expect(() =>
      applyStatusApplications({
        currentTick: Number.MAX_SAFE_INTEGER,
        statuses: [],
        applications: [application({ durationTicks: 1 })]
      })
    ).toThrow("safe-integer range");
    expect(() =>
      applyStatusApplications({
        currentTick: 15,
        statuses: [],
        applications: [application(), application()]
      })
    ).toThrow("duplicate status application");
    expect(() =>
      applyStatusApplications({
        currentTick: 15,
        statuses: [],
        applications: [application({ statusId: "invalid" as never })]
      })
    ).toThrow("valid stable ID");
  });

  it("rejects sparse arrays and accessors without invoking caller code", () => {
    expect(() =>
      resolveCombatTimers({
        currentTick: 10,
        cooldowns: new Array(1) as ActiveCooldown[],
        statuses: []
      })
    ).toThrow("dense data array");

    let getterCalls = 0;
    const accessor = status();
    Object.defineProperty(accessor, "magnitude", {
      enumerable: true,
      get() {
        getterCalls += 1;
        return 10;
      }
    });
    expect(() =>
      resolveCombatTimers({
        currentTick: 10,
        cooldowns: [],
        statuses: [accessor]
      })
    ).toThrow("magnitude must be an enumerable data property");
    expect(getterCalls).toBe(0);
  });

  it("pins the canonical timer and refresh evidence used by browser parity", async () => {
    expect(await canonicalHash(parityFixture())).toBe(
      "b32a1bf57b86a6d89a81dc703bd2865e451d59bd1dbbb79960a96c9dbb263d97"
    );
  });
});
