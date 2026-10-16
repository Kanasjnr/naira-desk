import type { RiskCheck } from "@naira-desk/intel";
import type { FairValue } from "@naira-desk/pricing";
import { describe, expect, it } from "vitest";
import { againstStreet } from "./street.ts";

const at = (naira: number): FairValue => ({
  ok: true,
  price: 1 / naira,
  at: 0,
  sources: ["a", "b"],
});
const calm = (rates: RiskCheck["rates"]): RiskCheck => ({
  level: "low",
  reason: "routine",
  posts: 5,
  calls: [],
  rates,
});

describe("againstStreet", () => {
  it("stays calm while onchain sits between the official and parallel rates", () => {
    const result = againstStreet(calm({ official: 1331, parallel: 1410 }), at(1363));
    expect(result.level).toBe("low");
    expect(result.street).toMatchObject({ official: 1331, parallel: 1410, offBandPct: 0 });
    expect(result.street?.onchain).toBeCloseTo(1363);
  });

  it("turns careful when onchain is more than 3% off the street band", () => {
    const result = againstStreet(calm({ official: 1331, parallel: 1410 }), at(1480));
    expect(result.level).toBe("elevated");
    expect(result.reason).toBe("onchain ₦1480 is 5.0% off the street rate ₦1331–₦1410; routine");
  });

  it("compares against the parallel rate alone when that's all the posts quote", () => {
    expect(againstStreet(calm({ parallel: 1400 }), at(1363)).level).toBe("low");

    const cheap = againstStreet(calm({ parallel: 1450 }), at(1363));
    expect(cheap.level).toBe("elevated");
    expect(cheap.reason).toBe("onchain ₦1363 is 6.0% off the street rate ₦1450; routine");
  });

  it("records the official rate but never raises the alarm on it alone", () => {
    expect(againstStreet(calm({ official: 1200 }), at(1363))).toMatchObject({
      level: "low",
      street: { official: 1200 },
    });
  });

  it("ignores misread rates and missing prices", () => {
    expect(againstStreet(calm({ parallel: 14.1 }), at(1363)).street?.parallel).toBeUndefined();
    expect(
      againstStreet(calm({ parallel: 1410 }), { ok: false, reason: "stale" }),
    ).not.toHaveProperty("street");
  });
});
