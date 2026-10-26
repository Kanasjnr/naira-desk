import type { FairValue } from "@naira-desk/pricing";
import { describe, expect, it } from "vitest";
import { createPriceWatch } from "./watch.ts";

const price = (value: number): FairValue => ({
  ok: true,
  price: value,
  at: 0,
  sources: ["a", "b"],
  naira: 1 / 1377.8,
});
const disagree: FairValue = {
  ok: false,
  reason: "sources disagree by more than 25 bps",
  disagree: true,
};
const MIN = 60_000;

describe("createPriceWatch", () => {
  it("raises a price jump when the fair value moves 50 bps inside the window", () => {
    const observe = createPriceWatch();
    expect(observe(price(0.000733), 0)).toBeUndefined();
    expect(observe(price(0.000735), 3 * MIN)).toBeUndefined();
    expect(observe(price(0.000737), 6 * MIN)).toEqual({
      trigger: "price-jump",
      detail: "+55 bps in 6 min",
    });
  });

  it("forgets prices older than the window", () => {
    const observe = createPriceWatch();
    observe(price(0.000733), 0);
    expect(observe(price(0.00074), 11 * MIN)).toBeUndefined();
    expect(observe(price(0.000736), 12 * MIN)).toEqual({
      trigger: "price-jump",
      detail: "-54 bps in 1 min",
    });
  });

  it("raises divergence only once sources have disagreed for two minutes", () => {
    const observe = createPriceWatch();
    expect(observe(disagree, 0)).toBeUndefined();
    expect(observe(disagree, MIN)).toBeUndefined();
    expect(observe(disagree, 2 * MIN)).toMatchObject({ trigger: "divergence" });

    observe(price(0.000733), 3 * MIN);
    expect(observe(disagree, 4 * MIN)).toBeUndefined();
  });

  it("ignores stale prices", () => {
    const observe = createPriceWatch();
    for (let t = 0; t <= 5 * MIN; t += MIN) {
      expect(observe({ ok: false, reason: "need 2 fresh sources, have 1" }, t)).toBeUndefined();
    }
  });
});
