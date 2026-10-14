import { custom } from "viem";
import { describe, expect, it } from "vitest";
import { assertCeloMainnet, createCeloPublicClient } from "./public.ts";

function clientOn(chainId: number) {
  return createCeloPublicClient(custom({ request: async () => `0x${chainId.toString(16)}` }));
}

describe("assertCeloMainnet", () => {
  it("passes on Celo mainnet", async () => {
    await expect(assertCeloMainnet(clientOn(42220))).resolves.toBeUndefined();
  });

  it("throws on any other chain", async () => {
    await expect(assertCeloMainnet(clientOn(11142220))).rejects.toThrow(/chain 11142220/);
  });
});
