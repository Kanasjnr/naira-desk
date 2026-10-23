import { fetchVault } from "@/lib/vault";

export async function GET() {
  const vault = await fetchVault();
  if (!vault) return Response.json({ error: "the indexer isn't reachable" }, { status: 503 });
  return Response.json(vault, { headers: { "cache-control": "no-store" } });
}
