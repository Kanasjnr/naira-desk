import { appendFile, mkdir, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export const dataFile = (name: string) => join(homedir(), ".naira-desk", name);

export async function readJsonl<T>(path: string): Promise<T[]> {
  const text = await readFile(path, "utf8").catch((error) => {
    if (error.code === "ENOENT") return "";
    throw error;
  });
  return text
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

export async function appendJsonl(path: string, value: unknown) {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  await appendFile(path, `${JSON.stringify(value)}\n`, { mode: 0o600 });
}
