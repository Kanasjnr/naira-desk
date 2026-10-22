import { AGENT_ID, IDENTITY_REGISTRY } from "@naira-desk/chain/identity";
import { VAULT } from "@naira-desk/chain/vault";
import { celoscan, short } from "@/lib/format";
import { ThemeToggle } from "./theme-toggle";

export function SiteHeader() {
  return (
    <header className="border-b">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-4">
        <div className="mr-auto">
          <p className="font-semibold tracking-tight">Naira Desk</p>
          <p className="text-sm text-muted-foreground">An onchain bureau de change for the naira</p>
        </div>
        <nav className="flex flex-wrap items-center gap-x-4 text-sm text-muted-foreground">
          <a
            href={`https://celoscan.io/nft/${IDENTITY_REGISTRY}/${AGENT_ID}`}
            target="_blank"
            rel="noreferrer"
            className="hover:text-foreground"
          >
            Agent #{String(AGENT_ID)}
          </a>
          <a
            href={celoscan("address", VAULT)}
            target="_blank"
            rel="noreferrer"
            className="hover:text-foreground"
          >
            Vault {short(VAULT)}
          </a>
          <a
            href="https://github.com/Kanasjnr/naira-desk"
            target="_blank"
            rel="noreferrer"
            className="hover:text-foreground"
          >
            GitHub
          </a>
          <ThemeToggle />
        </nav>
      </div>
    </header>
  );
}
