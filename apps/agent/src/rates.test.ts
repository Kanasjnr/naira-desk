import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { FairValue } from "@naira-desk/pricing";
import { describe, expect, it } from "vitest";
import { openRateHistory } from "./rates.ts";

const MIN = 60_000;
const at = (onchain: number): FairValue => ({
  ok: true,
  price: 1 / onchain,
  at: 0,
  sources: ["uniswap", "luno"],
  naira: 1 / 1377.8,
});

describe("openRateHistory", () => {
  it("samples every ten minutes and keeps the samples across a restart", async () => {
    const path = join(await mkdtemp(join(tmpdir(), "rates-")), "rates.jsonl");
    const history = await openRateHistory(path);
    await history.observe(at(1361.2), 0);
    await history.observe(at(1362), 5 * MIN);
    await history.observe({ ok: false, reason: "stale" }, 10 * MIN);
    await history.observe(at(1363.456), 11 * MIN);

    expect(history.samples()).toEqual([
      { at: 0, ngnPerUsdt: 1361.2, naira: 1377.8 },
      { at: 11 * MIN, ngnPerUsdt: 1363.46, naira: 1377.8 },
    ]);
    expect((await openRateHistory(path)).samples()).toHaveLength(2);
  });

  it("forgets samples older than 30 days", async () => {
    const path = join(await mkdtemp(join(tmpdir(), "rates-")), "rates.jsonl");
    const history = await openRateHistory(path);
    await history.observe(at(1360), 0);
    await history.observe(at(1370), 31 * 24 * 60 * MIN);
    expect(history.samples()).toEqual([
      { at: 31 * 24 * 60 * MIN, ngnPerUsdt: 1370, naira: 1377.8 },
    ]);
  });
});
