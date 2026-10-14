import { homedir } from "node:os";
import { join } from "node:path";

export const keyFile = process.env.AGENT_KEY_FILE ?? join(homedir(), ".naira-desk", "agent.key");
export const rpcUrl = process.env.CELO_RPC_URL ?? "https://forno.celo.org";
