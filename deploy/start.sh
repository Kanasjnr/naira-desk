#!/usr/bin/env bash
# Starts the indexer and the agent. If either exits, the container exits so the platform restarts it.
set -euo pipefail

data="$HOME/.naira-desk"
mkdir -p "$data"
chmod 700 "$data"
umask 077

# The agent's key comes from a secret, written once to the volume.
if [[ ! -f "$data/agent.key" ]]; then
  [[ -n "${AGENT_KEY:-}" ]] || { echo "AGENT_KEY is not set"; exit 1; }
  printf '%s\n' "$AGENT_KEY" > "$data/agent.key"
fi

# Logs carried over from another machine: a base64 tar.gz, unpacked once without overwriting.
if [[ -n "${NAIRA_DESK_SEED:-}" && ! -f "$data/.seeded" ]]; then
  printf '%s' "$NAIRA_DESK_SEED" | base64 -d |
    tar -xz -C "$data" --skip-old-files --no-same-owner --no-same-permissions --exclude='._*'
  chmod 600 "$data"/*.jsonl
  touch "$data/.seeded"
fi

node apps/indexer/src/main.ts &
node apps/agent/src/main.ts &
wait -n
exit 1
