import { type FairValue, fairValue, type PricePoint, type PriceSource } from "@naira-desk/pricing";

export function createPricer(sources: PriceSource[], now = Date.now) {
  const latest = new Map<string, PricePoint>();
  const lastError = new Map<string, string>();

  async function refresh() {
    await Promise.all(
      sources.map(async ({ name, read }) => {
        try {
          const point = await read();
          const stored = latest.get(point.source);
          if (!stored || point.at >= stored.at) latest.set(point.source, point);
          if (lastError.delete(name)) console.log(`${name}: recovered`);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          if (lastError.get(name) !== message) console.warn(`${name}: ${message}`);
          lastError.set(name, message);
        }
      }),
    );
  }

  // Computed on read, so readings age out even if refresh stops running.
  function current(): FairValue {
    return fairValue([...latest.values()], now());
  }

  return { refresh, current };
}
