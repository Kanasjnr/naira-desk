import { mkdtemp, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { appendJsonl, readJsonl } from "./files.ts";

describe("jsonl files", () => {
  it("reads a missing file as empty and appends into new folders", async () => {
    const path = join(await mkdtemp(join(tmpdir(), "jsonl-")), "nested", "log.jsonl");
    expect(await readJsonl(path)).toEqual([]);

    await appendJsonl(path, { a: 1 });
    await appendJsonl(path, { a: 2 });
    expect(await readJsonl(path)).toEqual([{ a: 1 }, { a: 2 }]);
    expect((await stat(path)).mode & 0o777).toBe(0o600);
  });
});
