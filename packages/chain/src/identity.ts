import { parseAbi } from "viem";

export const IDENTITY_REGISTRY = "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432";

export const identityRegistryAbi = parseAbi([
  "function register(string agentURI) returns (uint256 agentId)",
  "function setAgentURI(uint256 agentId, string newURI)",
  "function balanceOf(address owner) view returns (uint256)",
  "event Registered(uint256 indexed agentId, string agentURI, address indexed owner)",
]);

export function toDataUri(card: object) {
  const json = Buffer.from(JSON.stringify(card)).toString("base64");
  return `data:application/json;base64,${json}`;
}
