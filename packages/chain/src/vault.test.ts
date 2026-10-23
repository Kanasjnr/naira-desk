import { type Address, getAbiItem, toEventSelector, toFunctionSelector } from "viem";
import { describe, expect, it } from "vitest";
import { operatorVaultAbi, vaultEventsAbi, vaultFactoryAbi, vaultInit } from "./vault.ts";

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

describe("vaultEventsAbi", () => {
  // Topics from the verified OperatorVault at VAULT.
  it("matches the deployed vault", () => {
    const topics = vaultEventsAbi.map((item) => [item.name, toEventSelector(item)]);
    expect(Object.fromEntries(topics)).toEqual({
      DepositRequest: "0x96adf138056a99e8db7c4905540a036c212715aa125754e6168f604d262779cf",
      DepositCancelled: "0xea6a5867aa6fded974ad8936ccc2cc7e154e2b0a31226d7a62c683af0fbae580",
      DepositEpochProcessed: "0x495c3cbec8fe49ce0355e604dfd4936f3c315da91c155c9ba7fb54cd1e654c33",
      DepositEpochVoided: "0xfd26464ab51e15704d70ef186beb7fb3a6120c7f7399d225d26b801e36d85d3f",
      RedeemRequest: "0x1fdc681a13d8c5da54e301c7ce6542dcde4581e4725043fdab2db12ddc574506",
      RedeemEpochSettled: "0x7e8720b4e371965667ea65ed5a1e2e2bb071bf751817cdb41d58ed9c38a23a3a",
      Claimed: "0x6f9c9826be5976f3f82a3490c52a83328ce2ec7be9e62dcb39c26da5148d7c76",
      ClaimedYield: "0x9336fb952dcb3166c04b2d61b39e7f9b7287cd87e50bc8c076dd50c755cec5f2",
      RedeemYieldSettled: "0xe43f770b4529dc16a42598158e0090c404a8edc3b624d6434872c1fb311d79fc",
      EpochClosed: "0x698c7c5bf50063fc301fad9fdf17b1b865e0af008d9cd43536d3d93aeabe8af7",
      NavSettled: "0xb86699e5daa38ea047dabd21093c323539c98930dc7df0cc74f023eb07f31211",
      MarkUpdated: "0xb59c3ad8794437cd529fe72901aa3c33d6d65b944621b29200f2b2138cac8292",
      FeeAccrued: "0x3001032df6bcdb6b5b70f3e8d9f8913991b3a538d3186e38137447ebc9973fab",
      IdleAllocated: "0x671e9830113839233e435852e16f456397818b6bafe6d4acdef6fd7ee89c84d4",
      IdleRecalled: "0x49e7c1e8bb17f2f7f616b0fcffee1a508edd355147c225040744bad3c0840903",
      Transfer: "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef",
      Paused: "0x62e78cea01bee320cd4e420270b5ea74000d11b0c9f74754ebdbfc544b05a258",
      Unpaused: "0x5db9ee0a495bf2e6ff9c91a7834c1ba4fdd244a5e8aa4e537bd38aeae4b073aa",
      StrategySignerRotated: "0x0768873d02e411ef6f889a8b795f24e0010ee6da485407ab37030398757dc831",
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
