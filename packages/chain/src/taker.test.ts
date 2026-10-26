import { toEventSelector, toFunctionSelector } from "viem";
import { describe, expect, it } from "vitest";
import { takerAbi } from "./taker.ts";

describe("takerAbi", () => {
  // From `forge inspect Taker methodIdentifiers` and `events` in packages/contracts.
  it("matches the contract", () => {
    const selectors = takerAbi
      .filter((item) => item.type === "function")
      .map((item) => [item.name, toFunctionSelector(item)]);
    expect(Object.fromEntries(selectors)).toEqual({
      owner: "0x8da5cb5b",
      beneficiary: "0x38af3eed",
      reactor: "0xab572650",
      usdt: "0x2f48ab7d",
      router: "0xf887ea40",
      take: "0x02793dca",
      withdraw: "0xf3fef3a3",
      takerControl: "0xef5a7091",
      isValidSignature: "0x1626ba7e",
    });
    const took = takerAbi.find((item) => item.type === "event" && item.name === "Took");
    expect(took && toEventSelector(took)).toBe(
      "0x17ea4a790af91bc6f52be9f638ae7218c4a7b159b9cd1780b1198b6d39a1174b",
    );
  });
});
