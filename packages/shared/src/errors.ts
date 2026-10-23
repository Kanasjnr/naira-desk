// viem's messages carry the whole request and call arguments; keep the first line.
export function briefError(error: unknown) {
  const text =
    (error as { shortMessage?: string })?.shortMessage ??
    (error instanceof Error ? error.message : String(error));
  const line = text.split("\n")[0]?.trim() ?? "";
  return line.length > 160 ? `${line.slice(0, 157)}...` : line;
}
