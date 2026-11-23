# Ponder with SolidStart + `@wagmi/solid`

Monorepo example: a Bun-native Ponder indexer next to a [SolidStart](https://docs.solidjs.com/solid-start) frontend that:

- queries indexed data with [`bponder-client`](https://ponder.sh) over Bun `/v1/sql`
- connects an injected wallet on Base with [`@wagmi/solid`](https://wagmi.sh/solid/getting-started) and [`@tanstack/solid-query`](https://tanstack.com/query)

The indexer watches WETH9 `Deposit` events on Base (`0x4200…0006`) from `startBlock: "latest"`.

## Layout

```text
with-solidstart/
├── ponder/                 # Ponder indexer (Bun)
│   ├── ponder.config.ts
│   ├── ponder.schema.ts
│   └── src/
│       ├── index.ts        # indexing handlers
│       └── api/index.ts    # optional Hono + GraphQL/SQL middleware
└── frontend/               # SolidStart app (Vite)
    ├── vite.config.ts
    └── src/
        ├── app.tsx         # WagmiProvider + QueryClientProvider
        ├── lib/
        │   ├── ponder.ts   # createClient → /v1
        │   └── wagmi.ts    # createConfig (Base + injected)
        ├── components/
        │   ├── ConnectWallet.tsx
        │   └── DepositsTable.tsx
        └── routes/index.tsx
```

## Requirements

- Bun `>=1.4.0` (Ponder runtime and workspace package manager)
- Node `>=22` (SolidStart / Vite build)
- A Base mainnet RPC URL
- An injected wallet (e.g. MetaMask) for the connect demo

## Setup

From the **repository root** (this example is a workspace package):

```bash
bun install
```

Configure env files:

```bash
cp ponder/.env.example ponder/.env.local
cp frontend/.env.example frontend/.env.local
```

| File | Variable | Purpose |
| --- | --- | --- |
| `ponder/.env.local` | `PONDER_RPC_URL_8453` | Base JSON-RPC (required) |
| `ponder/.env.local` | `DATABASE_URL` | Optional Postgres URL; omit to use PGlite |
| `frontend/.env.local` | `VITE_PONDER_URL` | Ponder HTTP origin (default `http://localhost:42069`) |

## Run

Use two terminals from `examples/with-solidstart`:

```bash
# terminal 1 — indexer + /v1 HTTP (default port 42069)
bun run --cwd ponder dev

# terminal 2 — SolidStart UI
bun run --cwd frontend dev
```

Open the Vite URL printed in the frontend terminal (usually `http://localhost:3000`).

You should see:

1. Wagmi **Connect** for the injected connector (Base)
2. A table of the latest WETH mints from `POST /v1/sql`

### Production-ish checks

```bash
bun run --cwd frontend typecheck
bun run --cwd frontend build
bun run --cwd frontend preview
```

## How the pieces fit

### Ponder (`ponder/`)

- `ponder.config.ts` — Base chain + WETH9 contract
- `ponder.schema.ts` — `deposit_event` onchain table
- `src/index.ts` — writes each `Deposit` into `deposit_event`
- Under Bun, `ponder dev` / `start` use the Bun-native path by default (Bun.SQL when `DATABASE_URL` is set; PGlite otherwise)

### Frontend (`frontend/`)

| Concern | Where |
| --- | --- |
| Wagmi config | `src/lib/wagmi.ts` — `createConfig` with `base`, `injected()`, `ssr: true` |
| Providers | `src/app.tsx` — `WagmiProvider` wrapping `QueryClientProvider` |
| Wallet UI | `src/components/ConnectWallet.tsx` — `useConnection` / `useConnect` / `useDisconnect` |
| Indexed data | `src/components/DepositsTable.tsx` — `client.sql(...)` via `bponder-client` |
| API URL | `src/lib/ponder.ts` — `VITE_PONDER_URL` |

Example query used by the table:

```sql
SELECT id, timestamp, amount, account
FROM deposit_event
ORDER BY timestamp DESC
LIMIT 10
```

## Notes

- Wallet connect needs a browser extension (or other injected provider). Without one, the Connect button will error at mutation time — indexed data still loads from Ponder.
- `startBlock: "latest"` only indexes new deposits after the indexer starts; older mints will not appear until you lower `startBlock`.
- Frontend `viem` is pinned to `^2.58.4` so `@wagmi/core` can resolve `viem/tempo` under SolidStart’s Vite resolve conditions (`vite.config.ts` also `dedupe`s `viem`).
- Escape hatches for the indexer (optional peers): `PONDER_USE_VITE=1` needs `vite`; `PONDER_DATABASE_DRIVER=pg` needs `pg` + `pg-connection-string`.

## References

- [Bun guide](../../docs/pages/docs/guides/bun.mdx)
- [SolidStart](https://docs.solidjs.com/solid-start)
- [@wagmi/solid getting started](https://wagmi.sh/solid/getting-started)
- [bponder-client](../../packages/client)
