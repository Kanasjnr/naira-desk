import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { Address, Hex } from "viem";

type Position = { block: number; logIndex: number; tx: Hex; at: number };

// Event arguments keep their onchain values: big numbers as decimal strings.
export type VaultEvent = Position & { name: string; args: Record<string, string | boolean> };

export type FillRow = Position & {
  orderHash: Hex;
  filler: Address;
  sender: Address;
  side: "buy" | "sell";
  usdt: bigint;
  cngn: bigint;
};

const SCHEMA = `
create table if not exists cursor (id integer primary key check (id = 1), block integer not null);
create table if not exists vault_events (
  block integer not null,
  log_index integer not null,
  tx text not null,
  at integer not null,
  name text not null,
  args text not null,
  primary key (block, log_index)
);
create table if not exists fills (
  block integer not null,
  log_index integer not null,
  tx text not null,
  at integer not null,
  order_hash text not null,
  filler text not null,
  sender text not null,
  side text not null,
  usdt text not null,
  cngn text not null,
  primary key (block, log_index)
);
`;

export function openStore(path: string) {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(path);
  db.exec("pragma journal_mode = wal");
  db.exec(SCHEMA);

  const insertEvent = db.prepare(
    "insert or ignore into vault_events values ($block, $logIndex, $tx, $at, $name, $args)",
  );
  const insertFill = db.prepare(
    "insert or ignore into fills values ($block, $logIndex, $tx, $at, $orderHash, $filler, $sender, $side, $usdt, $cngn)",
  );
  const moveCursor = db.prepare(
    "insert into cursor values (1, $block) on conflict (id) do update set block = excluded.block",
  );

  return {
    cursor() {
      const row = db.prepare("select block from cursor").get();
      return row ? BigInt(row.block as number) : undefined;
    },
    // Rows and the cursor move together, so a crash mid-chunk rescans the whole chunk.
    save(to: bigint, events: VaultEvent[], fills: FillRow[]) {
      db.exec("begin");
      try {
        for (const event of events) insertEvent.run({ ...event, args: JSON.stringify(event.args) });
        for (const fill of fills) {
          insertFill.run({ ...fill, usdt: fill.usdt.toString(), cngn: fill.cngn.toString() });
        }
        moveCursor.run({ block: to });
        db.exec("commit");
      } catch (error) {
        db.exec("rollback");
        throw error;
      }
    },
    events(): VaultEvent[] {
      return db
        .prepare("select * from vault_events order by block, log_index")
        .all()
        .map((row) => ({
          block: row.block as number,
          logIndex: row.log_index as number,
          tx: row.tx as Hex,
          at: row.at as number,
          name: row.name as string,
          args: JSON.parse(row.args as string),
        }));
    },
    fills(): FillRow[] {
      return db
        .prepare("select * from fills order by block, log_index")
        .all()
        .map((row) => ({
          block: row.block as number,
          logIndex: row.log_index as number,
          tx: row.tx as Hex,
          at: row.at as number,
          orderHash: row.order_hash as Hex,
          filler: row.filler as Address,
          sender: row.sender as Address,
          side: row.side as FillRow["side"],
          usdt: BigInt(row.usdt as string),
          cngn: BigInt(row.cngn as string),
        }));
    },
    close: () => db.close(),
  };
}

export type Store = ReturnType<typeof openStore>;
