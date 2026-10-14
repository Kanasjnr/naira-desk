import { chmod, mkdtemp, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { privateKeyToAddress } from "viem/accounts";
import { describe, expect, it } from "vitest";
import { createKeyFile, readKeyFile } from "./keys.ts";

async function tempPath() {
  return join(await mkdtemp(join(tmpdir(), "naira-desk-")), "nested", "agent.key");
}

describe("key files", () => {
  it("creates an owner-only key file and reads it back", async () => {
    const path = await tempPath();
    const address = await createKeyFile(path);

    expect((await stat(path)).mode & 0o777).toBe(0o600);
    expect(privateKeyToAddress(await readKeyFile(path))).toBe(address);
  });

  it("never overwrites an existing key", async () => {
    const path = await tempPath();
    await createKeyFile(path);
    await expect(createKeyFile(path)).rejects.toThrow(/EEXIST/);
  });

  it("refuses a key other users can read", async () => {
    const path = await tempPath();
    await createKeyFile(path);
    await chmod(path, 0o644);
    await expect(readKeyFile(path)).rejects.toThrow(/chmod 600/);
  });

  it("refuses a file that isn't a key", async () => {
    const path = await tempPath();
    await createKeyFile(path);
    await writeFile(path, "not a key\n");
    await expect(readKeyFile(path)).rejects.toThrow(/doesn't contain a private key/);
  });
});
