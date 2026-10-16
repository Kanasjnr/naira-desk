import { DEFAULT_RPC_URL } from "@naira-desk/chain";
import { dataFile } from "@naira-desk/shared";

export const keyFile = process.env.AGENT_KEY_FILE || dataFile("agent.key");
export const rpcUrl = process.env.CELO_RPC_URL || DEFAULT_RPC_URL;
export const ledgerFile = process.env.BUY_LEDGER_FILE || dataFile("purchases.jsonl");
