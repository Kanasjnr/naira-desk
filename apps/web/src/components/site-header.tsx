import { AGENT_ID, IDENTITY_REGISTRY } from "@naira-desk/chain/identity";
import { TAKER } from "@naira-desk/chain/taker";
import { VAULT } from "@naira-desk/chain/vault";
import { celoscan } from "@/lib/format";
import { ThemeToggle } from "./theme-toggle";

const LINKS = [
  { label: `Agent #${AGENT_ID}`, href: `https://celoscan.io/nft/${IDENTITY_REGISTRY}/${AGENT_ID}` },
  { label: "Vault", href: celoscan("address", VAULT) },
  { label: "Taker", href: celoscan("address", TAKER) },
  { label: "GitHub", href: "https://github.com/Kanasjnr/naira-desk" },
];

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-20 border-b bg-background/90 backdrop-blur">
      <div className="mx-auto flex h-12 max-w-7xl items-center gap-6 px-4">
        <p className="font-mono text-sm font-semibold tracking-[0.18em]">
          NAIRA<span className="text-signal">/</span>DESK
        </p>
        <p className="hidden text-xs text-muted-foreground md:block">
          An onchain bureau de change for the naira, run by an agent
        </p>
        <nav className="ml-auto flex items-center gap-5 font-mono text-xs tracking-[0.12em] text-muted-foreground uppercase">
          {LINKS.map((link) => (
            <a
              key={link.label}
              href={link.href}
              target="_blank"
              rel="noreferrer"
              className="hidden hover:text-foreground sm:inline"
            >
              {link.label}
            </a>
          ))}
          <ThemeToggle />
        </nav>
      </div>
    </header>
  );
}
