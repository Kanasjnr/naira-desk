import { CNGN, USDT } from "@naira-desk/shared";
import { type Address, parseAbi, parseEther, parseUnits } from "viem";

export const VAULT_FACTORY = "0x88104decA449C797632AfdcA77A3140b24cD844A";

export const VAULT: Address = "0xD7137d85607BE18628CE00B1020895cEBceEAD6C";

// Textile's keys, as preset on its vault deploy page.
const TEXTILE_ROLES = {
  riskSigner: "0x9bC2f7601f22fFA95bD9dDbF9Bc11d06f54B32a3",
  riskAdmin: "0x51727A09b55d56BF8f3CBe61f460327330aECbA4",
  guardian: "0x15c73f757f9db89CdeB366676C294b8A6aa4B76d",
} as const;

export const vaultFactoryAbi = parseAbi([
  "struct VaultInit { string name; string symbol; address settlementAsset; address corridorAsset; address operatorAdmin; address strategySigner; address riskAdmin; address riskSigner; address guardian; address feeRecipient; uint256 maxOrderInputSettlement; uint256 maxOrderInputCorridor; uint256 minReserveSettlement; uint256 minReserveCorridor; uint256 maxOrderLifetime; uint256 depositEpochDuration; uint256 redemptionEpochDuration; uint256 redemptionCloseCooldown; uint256 emergencyExitTimeout; uint256 valuationTimeout; uint256 managementFeeWad; uint256 performanceFeeWad; uint256 protocolManagementShareWad; uint256 protocolPerformanceShareWad; uint256 riskSignerDelay; uint256 minDepositAssets; uint256 minDepositCorridor; uint256 minRedeemShares; bool enableYield; uint256 minLiquidSettlement; bool perfFloorEnabled; }",
  "function deployVault(VaultInit init) returns (address vault)",
  "function vaultOf(address operatorAdmin, address settlementAsset, address corridorAsset) view returns (address)",
  "event VaultDeployed(address indexed vault, address indexed operatorAdmin, address indexed settlementAsset, address corridorAsset, address strategySigner, uint256 version, string name, string symbol)",
]);

export const operatorVaultAbi = parseAbi([
  "function operatorAdmin() view returns (address)",
  "function strategySigner() view returns (address)",
  "function riskSigner() view returns (address)",
  "function guardian() view returns (address)",
  "function feeRecipient() view returns (address)",
  "function paused() view returns (bool)",
  "function closeOnly() view returns (bool)",
  "function tradingEpoch() view returns (uint256)",
  "function totalSupply() view returns (uint256)",
  "function totalAssets() view returns (uint256)",
  "function freeSettlement() view returns (uint256)",
  "function freeCorridor() view returns (uint256)",
  "function liquidSettlement() view returns (uint256)",
  "function quotableSettlement() view returns (uint256)",
  "function quotableCorridor() view returns (uint256)",
  "function pendingSettlement() view returns (uint256)",
  "function pendingCorridor() view returns (uint256)",
  "function setStrategySigner(address next)",
]);

const DAY = 86_400n;
// USDT, cNGN and vault shares all have 6 decimals.
const units = (amount: string) => parseUnits(amount, 6);

type Owners = { operator: Address; feeRecipient: Address };

// Timings follow Textile's defaults. Fees, order caps and minimums are ours, and
// apart from roles, fee recipient and the liquid floor, nothing changes after deploy.
export function vaultInit({ operator, feeRecipient }: Owners) {
  return {
    name: "Naira Desk USDT/cNGN",
    symbol: "tvUSDT-cNGN",
    settlementAsset: USDT,
    corridorAsset: CNGN,
    operatorAdmin: operator,
    // Placeholder until Stitch's own key takes over with setStrategySigner.
    strategySigner: operator,
    ...TEXTILE_ROLES,
    feeRecipient,
    maxOrderInputSettlement: units("1000"),
    maxOrderInputCorridor: units("1400000"),
    minReserveSettlement: 0n,
    minReserveCorridor: 0n,
    maxOrderLifetime: 7_200n,
    depositEpochDuration: 300n,
    redemptionEpochDuration: 300n,
    redemptionCloseCooldown: DAY,
    emergencyExitTimeout: 2n * DAY,
    valuationTimeout: DAY,
    managementFeeWad: 0n,
    performanceFeeWad: parseEther("0.2"),
    protocolManagementShareWad: parseEther("0.1"),
    protocolPerformanceShareWad: parseEther("0.1"),
    riskSignerDelay: DAY,
    minDepositAssets: units("5"),
    minDepositCorridor: units("7000"),
    minRedeemShares: units("1"),
    enableYield: true,
    // Fills can only pull liquid USDT, so lending below one full order would cap quotes.
    minLiquidSettlement: units("1000"),
    perfFloorEnabled: true,
  } as const;
}
