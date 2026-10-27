import { Dashboard } from "@/components/dashboard";
import { fetchTaker } from "@/lib/taker";
import { fetchTape } from "@/lib/tape";
import { fetchVault } from "@/lib/vault";

export const dynamic = "force-dynamic";

export default async function Home() {
  const [tape, vault, taker] = await Promise.all([fetchTape(), fetchVault(), fetchTaker()]);
  return (
    <main className="mx-auto max-w-6xl px-4 py-6">
      <Dashboard initial={{ tape, vault, taker }} />
    </main>
  );
}
