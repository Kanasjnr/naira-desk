import { describe, expect, it } from "vitest";
import { briefError } from "./errors.ts";

describe("briefError", () => {
  it("keeps viem's short message and drops the request dump", () => {
    const error = Object.assign(new Error("HTTP request failed.\n\nURL: https://forno.celo.org"), {
      shortMessage: "HTTP request failed.",
    });
    expect(briefError(error)).toBe("HTTP request failed.");
  });

  it("keeps only the first line of a plain error, capped in length", () => {
    expect(briefError(new Error("budget reached\nmore detail"))).toBe("budget reached");
    expect(briefError("x".repeat(200))).toHaveLength(160);
  });
});
