import { describe, expect, it, vi } from "vitest";
import { uniswapTwap } from "./uniswap.ts";

type Client = Parameters<typeof uniswapTwap>[0];

// Real observe([600, 0]) result: the average tick over 10 minutes was 72179.
const client = {
  getBlockNumber: async () => 10n,
  getBlock: async ({ blockNumber }: { blockNumber: bigint }) => ({
    number: blockNumber,
    timestamp: 1_760_000_000n,
  }),
  readContract: async () => [[348256019845n, 348299327245n], []],
} as unknown as Client;

describe("uniswapTwap", () => {
  it("turns the average tick into USDT per cNGN, stamped with the block time", async () => {
    const read = vi.spyOn(client, "readContract");
    const { source, price, at } = await uniswapTwap(client, 600);
    expect(read.mock.calls[0]?.[0]).toMatchObject({ blockNumber: 8n });
    expect(source).toBe("uniswap");
    expect(1 / price).toBeCloseTo(1363.3, 0);
    expect(at).toBe(1_760_000_000_000);
  });

  it("rejects a window that isn't a positive whole number of seconds", async () => {
    await expect(uniswapTwap(client, 0)).rejects.toThrow(/invalid TWAP window/);
  });
});
