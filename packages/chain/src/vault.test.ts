import { type Address, getAbiItem, toFunctionSelector } from "viem";
import { describe, expect, it } from "vitest";
import { operatorVaultAbi, vaultFactoryAbi, vaultInit } from "./vault.ts";

describe("vaultFactoryAbi", () => {
  // Selector taken from a mainnet deploy, tx 0xee2525b5cca884b0064efb6c4cfd9019e6810f1ed9dcdd2eaaef9ea6bae61a8c.
  it("matches the factory's deployVault", () => {
    const item = getAbiItem({ abi: vaultFactoryAbi, name: "deployVault" });
    expect(toFunctionSelector(item)).toBe("0x3872e607");
  });
});

describe("operatorVaultAbi", () => {
  // Selectors from the verified OperatorVault at VAULT.
  it("matches the deployed vault", () => {
    const selectors = operatorVaultAbi
      .filter((item) => item.type === "function")
      .map((item) => [item.name, toFunctionSelector(item)]);
    expect(Object.fromEntries(selectors)).toEqual({
      operatorAdmin: "0xa4e0c181",
      strategySigner: "0x35787368",
      riskSigner: "0x95cbf719",
      guardian: "0x452a9320",
      feeRecipient: "0x46904840",
      paused: "0x5c975abb",
      closeOnly: "0xc7dc844d",
      tradingEpoch: "0xe3c85e7e",
      totalSupply: "0x18160ddd",
      totalAssets: "0x01e1d114",
      freeSettlement: "0xea521dc4",
      freeCorridor: "0x057e74b4",
      liquidSettlement: "0x84d4fc64",
      quotableSettlement: "0x0f8769a0",
      quotableCorridor: "0x2e1741f9",
      pendingSettlement: "0x36ceb433",
      pendingCorridor: "0x05e503fa",
      setStrategySigner: "0x37bc9480",
    });
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
