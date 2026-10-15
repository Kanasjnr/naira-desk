import { describe, expect, it } from "vitest";
import { fairValue } from "./fair-value.ts";

const now = 1_760_000_000_000;
const point = (source: string, price: number, ageMs = 0) => ({ source, price, at: now - ageMs });

describe("fairValue", () => {
  it("takes the median and reports the oldest input time", () => {
    const result = fairValue(
      [point("a", 0.000733, 10_000), point("b", 0.0007331), point("c", 0.0007332)],
      now,
    );
    expect(result).toEqual({
      ok: true,
      price: 0.0007331,
      at: now - 10_000,
      sources: ["a", "b", "c"],
    });
  });

  it("averages the middle two when there's an even count", () => {
    const result = fairValue([point("a", 0.000733), point("b", 0.0007331)], now);
    expect(result.ok && result.price).toBeCloseTo(0.00073305, 10);
  });

  it("drops an outlier when the others agree", () => {
    const result = fairValue(
      [point("a", 0.000733), point("b", 0.0007331), point("c", 0.00074)],
      now,
    );
    expect(result.ok && result.sources).toEqual(["a", "b"]);
  });

  it("refuses when two sources disagree", () => {
    const result = fairValue([point("a", 0.000733), point("b", 0.00074)], now);
    expect(result).toEqual({ ok: false, reason: "sources disagree by more than 25 bps" });
  });

  it("counts sources, not readings", () => {
    const result = fairValue([point("a", 0.000733, 30_000), point("a", 0.000733)], now);
    expect(result).toEqual({ ok: false, reason: "need 2 fresh sources, have 1" });
  });

  it("ignores stale, future-dated and broken readings", () => {
    const result = fairValue(
      [
        point("a", 0.000733),
        point("b", 0.000733, 61_000),
        point("c", 0.000733, -60_000),
        point("d", Number.NaN),
        point("e", 0),
      ],
      now,
    );
    expect(result).toEqual({ ok: false, reason: "need 2 fresh sources, have 1" });
  });
});
