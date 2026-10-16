import { DEFAULT_RPC_URL } from "@naira-desk/chain";
import { dataFile } from "@naira-desk/shared";

const env = process.env;

export const rpcUrl = env.CELO_RPC_URL || DEFAULT_RPC_URL;
export const files = {
  key: env.AGENT_KEY_FILE || dataFile("agent.key"),
  ledger: env.BUY_LEDGER_FILE || dataFile("purchases.jsonl"),
  decisions: env.DECISIONS_FILE || dataFile("decisions.jsonl"),
  reviews: env.REVIEWS_FILE || dataFile("reviews.jsonl"),
  sales: env.SALES_FILE || dataFile("sales.jsonl"),
};
