import { toEventSelector } from "viem";
import { describe, expect, it } from "vitest";
import { reactorAbi } from "./reactor.ts";

describe("reactorAbi", () => {
  // Topic from the verified LimitOrderReactor at REACTOR.
  it("matches the deployed reactor's Fill", () => {
    expect(toEventSelector(reactorAbi[0])).toBe(
      "0x78ad7ec0e9f89e74012afa58738b6b661c024cb0fd185ee2f616c0a28924bd66",
    );
  });
});
