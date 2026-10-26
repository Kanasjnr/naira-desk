import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { assertCeloMainnet, createCeloPublicClient } from "@naira-desk/chain";
import { type Hex, http, isHash } from "viem";
import { rpcUrl } from "./env.ts";

function stop(message: string): never {
  console.error(message);
  process.exit(1);
}

const hash = process.argv[2];
if (!hash || !isHash(hash)) stop("usage: pnpm taker:verify <deploy tx hash>");

const artifact = new URL("../packages/contracts/out/Taker.sol/Taker.json", import.meta.url);
const { bytecode } = JSON.parse(await readFile(artifact, "utf8")) as { bytecode: { object: Hex } };

const client = createCeloPublicClient(http(rpcUrl));
await assertCeloMainnet(client);
const [{ input }, { contractAddress }] = await Promise.all([
  client.getTransaction({ hash }),
  client.getTransactionReceipt({ hash }),
]);
if (!contractAddress) stop(`${hash} didn't create a contract`);
if (!input.startsWith(bytecode.object)) stop("the deployed code isn't this build of Taker.sol");

// Everything after the creation code: the constructor arguments, then our attribution tag.
const constructorArgs = `0x${input.slice(bytecode.object.length)}`;
const forge = spawnSync(
  "forge",
  [
    "verify-contract",
    contractAddress,
    "src/Taker.sol:Taker",
    "--root",
    "packages/contracts",
    "--chain-id",
    "42220",
    "--verifier",
    "blockscout",
    "--verifier-url",
    "https://celo.blockscout.com/api/",
    "--constructor-args",
    constructorArgs,
    "--watch",
  ],
  { stdio: "inherit" },
);
process.exit(forge.status ?? 1);
