import { fetchTaker } from "@/lib/taker";

export async function GET() {
  const taker = await fetchTaker();
  if (!taker) return Response.json({ error: "the indexer isn't reachable" }, { status: 503 });
  return Response.json(taker, { headers: { "cache-control": "no-store" } });
}
