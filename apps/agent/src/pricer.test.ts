import { describe, expect, it, vi } from "vitest";
import { createPricer } from "./pricer.ts";

const start = 1_760_000_000_000;

function setup() {
  let clock = start;
  const prices = { uniswap: 0.000733, luno: 0.0007331 };
  const readAt: Partial<Record<"uniswap" | "luno", number>> = {};
  const failing = new Set<string>();
  const source = (name: "uniswap" | "luno") => ({
    name,
    read: async () => {
      if (failing.has(name)) throw new Error("timeout");
      return { source: name, price: prices[name], at: readAt[name] ?? clock };
    },
  });
  const pricer = createPricer([source("uniswap"), source("luno")], () => clock);
  return { pricer, prices, readAt, failing, advance: (ms: number) => (clock += ms) };
}

describe("createPricer", () => {
  it("serves the pool price once the naira rate has reported too", async () => {
    const { pricer } = setup();
    expect(pricer.current().ok).toBe(false);

    await pricer.refresh();
    const value = pricer.current();
    expect(value.ok && value.price).toBe(0.000733);
  });

  it("keeps a source's last reading through a failed refresh", async () => {
    const { pricer, failing, advance } = setup();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    await pricer.refresh();

    failing.add("luno");
    advance(5_000);
    await pricer.refresh();
    expect(pricer.current().ok).toBe(true);
  });

  it("doesn't let an older reading replace a newer one", async () => {
    const { pricer, prices, readAt, advance } = setup();
    advance(10_000);
    await pricer.refresh();

    prices.uniswap = 0.0007;
    readAt.uniswap = start;
    await pricer.refresh();
    const value = pricer.current();
    expect(value.ok && value.price).toBe(0.000733);
  });

  it("stops serving once readings go stale", async () => {
    const { pricer, advance } = setup();
    await pricer.refresh();

    advance(61_000);
    expect(pricer.current()).toEqual({ ok: false, reason: "no fresh uniswap price" });
  });
});
