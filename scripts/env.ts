import { homedir } from "node:os";
import { join } from "node:path";
import { DEFAULT_RPC_URL } from "@naira-desk/chain";

export const keyFile = process.env.AGENT_KEY_FILE || join(homedir(), ".naira-desk", "agent.key");
export const rpcUrl = process.env.CELO_RPC_URL || DEFAULT_RPC_URL;
