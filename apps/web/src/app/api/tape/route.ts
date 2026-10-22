import { fetchTape } from "@/lib/tape";

export async function GET() {
  const tape = await fetchTape();
  if (!tape) return Response.json({ error: "the agent isn't reachable" }, { status: 503 });
  return Response.json(tape, { headers: { "cache-control": "no-store" } });
}
