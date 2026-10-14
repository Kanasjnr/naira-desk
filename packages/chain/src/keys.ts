import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { type Address, type Hex, isHex } from "viem";
import { generatePrivateKey, privateKeyToAddress } from "viem/accounts";

export async function createKeyFile(path: string): Promise<Address> {
  const key = generatePrivateKey();
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  // "wx" fails if the file exists, so an existing key is never overwritten.
  await writeFile(path, `${key}\n`, { mode: 0o600, flag: "wx" });
  return privateKeyToAddress(key);
}

export async function readKeyFile(path: string): Promise<Hex> {
  const { mode } = await stat(path);
  if (mode & 0o077) {
    throw new Error(`${path} is readable by other users; run chmod 600 on it`);
  }
  const key = (await readFile(path, "utf8")).trim();
  if (!isHex(key) || key.length !== 66) {
    throw new Error(`${path} doesn't contain a private key`);
  }
  return key;
}
