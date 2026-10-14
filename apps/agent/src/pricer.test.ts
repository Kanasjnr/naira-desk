import { describe, expect, it, vi } from "vitest";
import { createPricer } from "./pricer.ts";

const start = 1_760_000_000_000;

function setup() {
  let clock = start;
  const prices = { a: 0.000733, b: 0.0007331 };
  const readAt: Partial<Record<"a" | "b", number>> = {};
  const failing = new Set<string>();
  const source = (name: "a" | "b") => ({
    name,
    read: async () => {
      if (failing.has(name)) throw new Error("timeout");
      return { source: name, price: prices[name], at: readAt[name] ?? clock };
    },
  });
  const pricer = createPricer([source("a"), source("b")], () => clock);
  return { pricer, prices, readAt, failing, advance: (ms: number) => (clock += ms) };
}

describe("createPricer", () => {
  it("serves a fair value once both sources have reported", async () => {
    const { pricer } = setup();
    expect(pricer.current().ok).toBe(false);

    await pricer.refresh();
    const value = pricer.current();
    expect(value.ok && value.price).toBeCloseTo(0.00073305, 10);
  });

  it("keeps a source's last reading through a failed refresh", async () => {
    const { pricer, failing, advance } = setup();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    await pricer.refresh();

    failing.add("b");
    advance(5_000);
    await pricer.refresh();
    expect(pricer.current().ok).toBe(true);
  });

  it("doesn't let an older reading replace a newer one", async () => {
    const { pricer, prices, readAt, advance } = setup();
    advance(10_000);
    await pricer.refresh();

    prices.a = 0.0007;
    readAt.a = start;
    await pricer.refresh();
    const value = pricer.current();
    expect(value.ok && value.price).toBeCloseTo(0.00073305, 10);
  });

  it("stops serving once readings go stale", async () => {
    const { pricer, advance } = setup();
    await pricer.refresh();

    advance(61_000);
    expect(pricer.current()).toEqual({ ok: false, reason: "need 2 fresh sources, have 0" });
  });
});
