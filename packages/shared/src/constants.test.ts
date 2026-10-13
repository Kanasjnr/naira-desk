import { describe, expect, it } from "vitest";
import { ATTRIBUTION_CODE, CELO_CHAIN_ID } from "./constants.ts";

describe("constants", () => {
  it("targets Celo mainnet", () => {
    expect(CELO_CHAIN_ID).toBe(42220);
  });

  // Same rules @celo/attribution-tags enforces: lowercase letters, digits and
  // underscores, at most 32 bytes. A typo here would silently break attribution.
  it("uses a valid attribution code", () => {
    expect(ATTRIBUTION_CODE).toMatch(/^[a-z0-9_]{1,32}$/);
  });
});
