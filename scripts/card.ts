import { readFile } from "node:fs/promises";
import { IDENTITY_REGISTRY, TAKER, toDataUri, VAULT } from "@naira-desk/chain";
import { CELO_CHAIN_ID } from "@naira-desk/shared";

const card = JSON.parse(await readFile(new URL("../agent-card.json", import.meta.url), "utf8"));

// The card points back at its own registration and at the contracts the agent runs.
export const agentCard = (agentId: bigint) => ({
  ...card,
  services: [
    ...card.services,
    { name: "vault", endpoint: `eip155:${CELO_CHAIN_ID}:${VAULT}` },
    { name: "taker", endpoint: `eip155:${CELO_CHAIN_ID}:${TAKER}` },
  ],
  registrations: [
    { agentId: Number(agentId), agentRegistry: `eip155:${CELO_CHAIN_ID}:${IDENTITY_REGISTRY}` },
  ],
});

export const cardFor = (agentId: bigint) => toDataUri(agentCard(agentId));
