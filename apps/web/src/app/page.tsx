import { Dashboard } from "@/components/dashboard";
import { fetchTape } from "@/lib/tape";
import { fetchVault } from "@/lib/vault";

export const dynamic = "force-dynamic";

export default async function Home() {
  const [tape, vault] = await Promise.all([fetchTape(), fetchVault()]);
  return (
    <main className="mx-auto max-w-6xl px-4 py-6">
      <Dashboard initial={{ tape, vault }} />
    </main>
  );
}
