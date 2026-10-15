import { type Address, getAbiItem, toFunctionSelector } from "viem";
import { describe, expect, it } from "vitest";
import { vaultFactoryAbi, vaultInit } from "./vault.ts";

describe("vaultFactoryAbi", () => {
  // Selector taken from a mainnet deploy, tx 0xee2525b5cca884b0064efb6c4cfd9019e6810f1ed9dcdd2eaaef9ea6bae61a8c.
  it("matches the factory's deployVault", () => {
    const item = getAbiItem({ abi: vaultFactoryAbi, name: "deployVault" });
    expect(toFunctionSelector(item)).toBe("0x3872e607");
  });
});

describe("vaultInit", () => {
  const operator: Address = "0xE4D88C9A86bd42D4f5D05a234E6D56f71bB58582";
  const feeRecipient: Address = "0xa1599790B763E537bd15b5b912012e5Fb65491a3";
  const init = vaultInit({ operator, feeRecipient });

  it("keeps a full order of USDT out of the lending market", () => {
    expect(init.minLiquidSettlement).toBeGreaterThanOrEqual(init.maxOrderInputSettlement);
  });

  it("passes the factory's role and timing checks", () => {
    expect(init.strategySigner).not.toBe(init.riskSigner);
    expect(init.operatorAdmin).not.toBe(init.riskAdmin);
    expect(init.emergencyExitTimeout).toBeGreaterThan(init.valuationTimeout);
  });
});
