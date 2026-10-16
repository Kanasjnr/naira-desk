import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { RiskCheck, RiskLevel } from "@naira-desk/intel";
import { describe, expect, it, vi } from "vitest";
import { createRiskDesk, openDecisions } from "./desk.ts";

const HOUR = 3_600_000;

async function setup(levels: Array<RiskLevel | Error>) {
  vi.spyOn(console, "log").mockImplementation(() => {});
  let clock = 0;
  const path = join(await mkdtemp(join(tmpdir(), "desk-")), "decisions.jsonl");
  const check = vi.fn(async (): Promise<RiskCheck> => {
    const next = levels.shift() ?? "low";
    if (next instanceof Error) throw next;
    return { level: next, reason: `${next} news`, posts: 4, receipts: ["0xaaaaaaaaaa"] };
  });
  const open = async () =>
    createRiskDesk({ check, log: await openDecisions(path), now: () => clock });
  return { check, open, advance: (ms: number) => (clock += ms) };
}

describe("createRiskDesk", () => {
  it("quotes carefully until its first check, then follows the risk", async () => {
    const { open, check } = await setup(["low"]);
    const desk = await open();
    expect(desk.mode()).toBe("caution");

    await desk.tick();
    expect(desk.mode()).toBe("normal");
    expect(desk.current()).toMatchObject({ trigger: "startup", check: { posts: 4 } });
    expect(check).toHaveBeenCalledTimes(1);
  });

  it("restores the last decision after a restart instead of paying again", async () => {
    const { open, check, advance } = await setup(["severe"]);
    await (await open()).tick();

    advance(HOUR);
    const restarted = await open();
    await restarted.tick();
    expect(restarted.mode()).toBe("halted");
    expect(check).toHaveBeenCalledTimes(1);
  });

  it("checks again on schedule", async () => {
    const { open, check, advance } = await setup(["low", "elevated"]);
    const desk = await open();
    await desk.tick();

    advance(6 * HOUR - 1);
    await desk.tick();
    expect(check).toHaveBeenCalledTimes(1);

    advance(1);
    await desk.tick();
    expect(desk.current()).toMatchObject({ trigger: "schedule", mode: "caution" });
  });

  it("checks on an alert, but at most once every 30 minutes", async () => {
    const { open, check, advance } = await setup(["low", "severe", "low"]);
    const desk = await open();
    await desk.tick();

    await desk.alert("price-jump", "+60 bps in 4 min");
    expect(desk.current()).toMatchObject({
      trigger: "price-jump",
      detail: "+60 bps in 4 min",
      mode: "halted",
    });

    advance(10 * 60_000);
    await desk.alert("price-jump", "+70 bps in 8 min");
    expect(check).toHaveBeenCalledTimes(2);
  });

  it("treats a failed check as elevated risk", async () => {
    const { open } = await setup([new Error("daily buy budget reached")]);
    const desk = await open();
    await desk.tick();
    expect(desk.mode()).toBe("caution");
    expect(desk.reason()).toBe("couldn't check: daily buy budget reached");
  });

  it("runs one check at a time", async () => {
    const { open, check } = await setup(["low"]);
    const desk = await open();
    await Promise.all([desk.tick(), desk.tick(), desk.alert("divergence", "sources disagree")]);
    expect(check).toHaveBeenCalledTimes(1);
  });
});
