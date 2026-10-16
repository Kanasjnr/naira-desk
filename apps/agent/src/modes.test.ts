import type { RiskCheck, RiskLevel } from "@naira-desk/intel";
import { describe, expect, it } from "vitest";
import { decide, nextCheckAt } from "./modes.ts";

const HOUR = 3_600_000;
const check = (level: RiskLevel): RiskCheck => ({ level, reason: level, posts: 3, receipts: [] });

describe("decide", () => {
  it("maps each risk level to a mode", () => {
    expect(decide(undefined, check("low"), "startup", 0).mode).toBe("normal");
    expect(decide(undefined, check("elevated"), "startup", 0).mode).toBe("caution");
    expect(decide(undefined, check("severe"), "startup", 0)).toMatchObject({
      mode: "halted",
      until: 2 * HOUR,
    });
  });

  it("holds a halt for two hours even if the next read is calm", () => {
    const halted = decide(undefined, check("severe"), "price-jump", 0, "+80 bps in 6 min");
    expect(halted.detail).toBe("+80 bps in 6 min");

    const early = decide(halted, check("low"), "schedule", HOUR);
    expect(early).toMatchObject({ mode: "halted", until: 2 * HOUR });

    expect(decide(early, check("low"), "schedule", 2 * HOUR).mode).toBe("normal");
  });

  it("restarts the halt clock on fresh severe news", () => {
    const halted = decide(undefined, check("severe"), "schedule", 0);
    expect(decide(halted, check("severe"), "schedule", HOUR).until).toBe(3 * HOUR);
  });
});

describe("nextCheckAt", () => {
  it("checks every six hours when calm and every two otherwise", () => {
    expect(nextCheckAt(decide(undefined, check("low"), "schedule", 0))).toBe(6 * HOUR);
    expect(nextCheckAt(decide(undefined, check("elevated"), "schedule", 0))).toBe(2 * HOUR);
    expect(nextCheckAt(decide(undefined, check("severe"), "schedule", 0))).toBe(2 * HOUR);
  });
});
