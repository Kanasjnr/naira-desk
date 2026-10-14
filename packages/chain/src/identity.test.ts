import { describe, expect, it } from "vitest";
import { toDataUri } from "./identity.ts";

describe("toDataUri", () => {
  it("round-trips the agent card", async () => {
    const card = { name: "Naira Desk", services: [{ name: "web", endpoint: "https://x.y" }] };
    const response = await fetch(toDataUri(card));

    expect(response.headers.get("content-type")).toBe("application/json");
    expect(await response.json()).toEqual(card);
  });
});
