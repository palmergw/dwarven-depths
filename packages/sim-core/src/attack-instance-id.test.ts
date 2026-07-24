import { describe, expect, it } from "vitest";
import { createAttackInstanceId } from "./attack-instance-id.js";

describe("attack instance IDs", () => {
  it("separates authored attack and source identity boundaries", () => {
    const left = createAttackInstanceId(
      "attack.foo.a" as never,
      "entity.b" as never,
      0
    );
    const right = createAttackInstanceId(
      "attack.foo" as never,
      "entity.a.b" as never,
      0
    );
    expect(left).not.toBe(right);
    expect(left).toBe("attack.foo.a.b.source_length_1.tick_0");
    expect(right).toBe("attack.foo.a.b.source_length_3.tick_0");
  });
});
