import { Dashboard } from "@/components/dashboard";
import { fetchTape } from "@/lib/tape";

export const dynamic = "force-dynamic";

export default async function Home() {
  return (
    <main className="mx-auto max-w-6xl px-4 py-6">
      <Dashboard initial={await fetchTape()} />
    </main>
  );
}
