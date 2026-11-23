# Contracts

Index events emitted by a contract

To index **event logs** or **call traces** produced by a contract, use the `contracts` field in `ponder.config.ts`.

This guide describes each configuration option and suggests patterns for common use cases. Visit the config [API reference](../api-reference/ponder/config.md) for more information.

## Example

This config instructs the indexing engine to fetch event logs emitted by the [Blitmap](https://blitmap.xyz/) NFT contract.

**ponder.config.ts**

```ts
import { createConfig } from "bponder";
import { BlitmapAbi } from "./abis/Blitmap";

export default createConfig({
  chains: {
    mainnet: { id: 1, rpc: process.env.PONDER_RPC_URL_1 },
  },
  contracts: {
    Blitmap: {
      abi: BlitmapAbi,
      chain: "mainnet",
      address: "0x8d04a8c79cEB0889Bdd12acdF3Fa9D207eD3Ff63",
      startBlock: 12439123,
    },
  },
});
```

Now, we can register an indexing function for the `MetadataChanged` event that will be called for each event log. In this case, the indexing function inserts or updates a row in the `tokens` table.

**src/index.ts**

```ts
import { ponder } from "bponder:registry";
import { tokens } from "bponder:schema";

ponder.on("Blitmap:MetadataChanged", async ({ event, context }) => {
  await context.db
    .insert(tokens)
    .values({
      id: event.args.tokenId,
      metadata: event.args.newMetadata,
    })
    .onConflictDoUpdate({
      metadata: event.args.newMetadata,
    });
});
```

[Read more](../indexing/overview.md) about writing indexing functions.

## Name

Each contract must have a unique name, provided as a key to the `contracts` object. Names must be unique across contracts, accounts, and block intervals.

**ponder.config.ts**

```ts
import { createConfig } from "bponder";
import { BlitmapAbi } from "./abis/Blitmap";

export default createConfig({
  chains: { /* ... */ },
  contracts: {
    Blitmap: {
      abi: BlitmapAbi,
      chain: "mainnet",
      address: "0x8d04a8c79cEB0889Bdd12acdF3Fa9D207eD3Ff63",
    },
  },
});
```

## ABI

Each contract must have an ABI. The indexing engine uses the ABI to validate inputs and encode & decode contract data.

**ponder.config.ts**

```ts
import { createConfig } from "bponder";
import { BlitmapAbi } from "./abis/Blitmap"; 

export default createConfig({
  chains: {
    mainnet: { id: 1, rpc: process.env.PONDER_RPC_URL_1 },
  },
  contracts: {
    Blitmap: {
      abi: BlitmapAbi,
      chain: "mainnet",
      address: "0x8d04a8c79cEB0889Bdd12acdF3Fa9D207eD3Ff63",
      startBlock: 
    },
  },
});
```

To enable the type system, save all ABIs in `.ts` files and include an `as const{:ts}` assertion. Read more about these requirements in the [ABIType](https://abitype.dev/guide/getting-started#usage) documentation.

**abis/Blitmap.ts**

```ts
export const BlitmapAbi = [
  { inputs: [], stateMutability: "nonpayable", type: "constructor" },
  {
    inputs: [{ internalType: "address", name: "owner", type: "address" }],
    name: "balanceOf",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  // ...
] as const;
```

### Multiple ABIs

Use the [`mergeAbis`](../api-reference/ponder-utils.md#mergeabis) utility function to combine multiple ABIs into one. This function removes duplicate ABI items and maintains strict types.

This pattern is often useful for proxy contracts where the implementation ABI has changed over time.

**ponder.config.ts**

```ts
import { createConfig, mergeAbis } from "bponder";
import { ERC1967ProxyAbi } from "./abis/ERC1967Proxy";
import { NameRegistryAbi } from "./abis/NameRegistry";
import { NameRegistry2Abi } from "./abis/NameRegistry2";

export default createConfig({
  chains: { /* ... */ },
  contracts: {
    FarcasterNameRegistry: {
      abi: mergeAbis([ERC1967ProxyAbi, NameRegistryAbi, NameRegistry2Abi]),
      chain: "goerli",
      address: "0xe3Be01D99bAa8dB9905b33a3cA391238234B79D1",
    },
  },
});
```

## Chain

### Single chain

To index a contract on a single chain, pass the chain name as a string to the `chain` field.

**ponder.config.ts**

```ts
import { createConfig } from "bponder";
import { BlitmapAbi } from "./abis/Blitmap";

export default createConfig({
  chains: {
    mainnet: { id: 1, rpc: process.env.PONDER_RPC_URL_1 },
  },
  contracts: {
    Blitmap: {
      abi: BlitmapAbi,
      chain: "mainnet",
      address: "0x8d04a8c79cEB0889Bdd12acdF3Fa9D207eD3Ff63",
    },
  },
});
```

### Multiple chains

To index a contract that exists on multiple chains, pass an object to the `chain` field containing chain-specific overrides. Each contract specified this way _must_ have the same ABI.

**ponder.config.ts**

```ts
import { createConfig } from "bponder";
import { UniswapV3FactoryAbi } from "./abis/UniswapV3Factory";

export default createConfig({
  chains: {
    mainnet: { id: 1, rpc: process.env.PONDER_RPC_URL_1 },
    base: { id: 8453, rpc: process.env.PONDER_RPC_URL_8453 },
  },
  contracts: {
    UniswapV3Factory: {
      abi: UniswapV3FactoryAbi,
      chain: {
        mainnet: {
          address: "0x1F98431c8aD98523631AE4a59f267346ea31F984",
          startBlock: 12369621,
        },
        base: {
          address: "0x33128a8fC17869897dcE68Ed026d694621f6FDfD",
          startBlock: 1371680,
        },
      },
    },
  },
});
```

With this configuration, the indexing functions you register for the `UniswapV3Factory` contract will handle events from both Ethereum and Base.

To determine which chain the current event is from, use the `context.chain` object.

**src/index.ts**

```ts
import { ponder } from "bponder:registry";

ponder.on("UniswapV3Factory:Ownership", async ({ event, context }) => {
  context.chain;
  //      ^? { name: "mainnet", id: 1 } | { name: "base", id: 8453 }

  event.log.address;
  //        ^? "0x1F98431c8aD98523631AE4a59f267346ea31F984" | "0x33128a8fC17869897dcE68Ed026d694621f6FDfD"

  if (context.chain.name === "mainnet") {
    // Do mainnet-specific stuff!
  }
});
```

#### Chain override logic

Chain-specific configuration uses an override pattern. Any options defined at the top level are the default, and the chain-specific objects override those defaults.

All contract options other than `abi` can be specified per-chain, including `address`, `startBlock`, and `endBlock`.

**Example: Uniswap V3**

The Uniswap V3 factory contract is deployed to the same address on most chains, but has a different address on Base. This configuration instructs Ponder to use the address defined at the top level (`"0x1F98..."`) for mainnet and Optimism, and the address defined in the `base` object for Base.

**ponder.config.ts**

```ts
import { createConfig } from "bponder";
import { UniswapV3FactoryAbi } from "./abis/EntryPoint";

export default createConfig({
  chains: {
    mainnet: { id: 1, rpc: process.env.PONDER_RPC_URL_1 },
    optimism: { id: 10, rpc: process.env.PONDER_RPC_URL_10 },
    base: { id: 8453, rpc: process.env.PONDER_RPC_URL_8453 },
  },
  contracts: {
    UniswapV3Factory: {
      abi: UniswapV3FactoryAbi,
      address: "0x1F98431c8aD98523631AE4a59f267346ea31F984",
      chain: {
        mainnet: { startBlock: 12369621 },
        optimism: { startBlock: 0 },
        base: {
          address: "0x33128a8fC17869897dcE68Ed026d694621f6FDfD",
          startBlock: 1371680,
        },
      },
    },
  },
});
```

**Example: ERC-4337 EntryPoint**

The ERC-4337 EntryPoint contract is deployed to the same address on all chains. Only the `startBlock` needs to be specified per-chain.

**ponder.config.ts**

```ts
import { createConfig } from "bponder";
import { EntryPointAbi } from "./abis/EntryPoint";

export default createConfig({
  chains: {
    mainnet: { id: 1, rpc: process.env.PONDER_RPC_URL_1 },
    optimism: { id: 10, rpc: process.env.PONDER_RPC_URL_10 },
  },
  contracts: {
    EntryPoint: {
      abi: EntryPointAbi,
      address: "0x1F98431c8aD98523631AE4a59f267346ea31F984",
      chain: {
        mainnet: { startBlock: 12369621 },
        optimism: { startBlock: 88234528 },
      },
    },
  },
});
```

## Address

### Single address

The simplest and most common option is to pass a single static address.

**ponder.config.ts**

```ts
import { createConfig } from "bponder";
import { BlitmapAbi } from "./abis/Blitmap";

export default createConfig({
  chains: { /* ... */ },
  contracts: {
    Blitmap: {
      abi: BlitmapAbi,
      chain: "mainnet",
      address: "0x8d04a8c79cEB0889Bdd12acdF3Fa9D207eD3Ff63",
    },
  },
});
```

### Multiple addresses

To index multiple contracts that have the same ABI (or share an interface like `ERC20`), pass a list of addresses to the `address` field.

> **Note:**   With this configuration, all addresses share the same `startBlock`. It's
>   often best to use the earliest deployment block among them.

**ponder.config.ts**

```ts
import { createConfig } from "bponder";
import { ERC721Abi } from "./abis/ERC721";

export default createConfig({
  chains: { /* ... */ },
  contracts: {
    NiceJpegs: {
      abi: ERC721Abi,
      chain: "mainnet",
      address: [
        "0x4E1f41613c9084FdB9E34E11fAE9412427480e56", // Terraforms
        "0xBC4CA0EdA7647A8aB7C2061c2E118A18a936f13D", // BAYC
        "0x8a90CAb2b38dba80c64b7734e58Ee1dB38B8992e", // Doodles
        "0x0000000000664ceffed39244a8312bD895470803", // !fundrop
      ],
    },
  },
});
```

### Factory pattern

> **Note:**   Visit the [factory pattern](../guides/factory.md) guide for more information.

Use the `factory()` function to specify a dynamic list of addresses collected from a factory contract.

Any indexing functions you register for `SudoswapPool` receive events for all contracts matched by the factory configuration (similar to a multiple chain configuration). The `event.log.address` field contains the address of the specific contract that emitted the current event.

**ponder.config.ts**

```ts
import { createConfig, factory } from "bponder";
import { parseAbiItem } from "viem";

export default createConfig({
  chains: { /* ... */ },
  contracts: {
    SudoswapPool: {
      abi: SudoswapPoolAbi,
      chain: "mainnet",
      address: factory({
        // Address of the factory contract.
        address: "0xb16c1342E617A5B6E4b631EB114483FDB289c0A4",
        // Event from the factory contract ABI which contains the child address.
        event: parseAbiItem("event NewPair(address poolAddress)"),
        // Name of the event parameter containing the child address.
        parameter: "poolAddress",
      }),
      startBlock: 14645816,
    },
  },
});
```

**src/index.ts**

```ts
import { ponder } from "bponder:registry";

ponder.on("SudoswapPool:Transfer", async ({ event }) => {
  // The address of the child contract that emitted the event.
  event.log.address;
  //        ^? string
});
```

### Proxy & upgradable contracts

To index a proxy/upgradable contract, use the proxy contract address in the `address` field. Then, be sure to include the ABIs of all implementation contracts that the proxy has ever had. The implementation ABIs are required to properly identify and decode all event logs throughout the contract history. To add multiple ABIs safely, use the [`mergeAbis`](../api-reference/ponder-utils.md#mergeabis) utility function.

> **Tip:**   On Etherscan, there is a link to the current implementation contract on the **Contract → Read as Proxy** tab. You can copy all the implementation ABIs as text and paste them into `.ts` files.

![Etherscan contract proxy address](/etherscan-proxy-contract.png)

## Block range

Use the `startBlock` and `endBlock` options to specify the block range to index.

**ponder.config.ts**

```ts
import { createConfig } from "bponder";
import { BlitmapAbi } from "./abis/Blitmap";

export default createConfig({
  chains: { /* ... */ },
  contracts: {
    Blitmap: {
      abi: BlitmapAbi,
      chain: "mainnet",
      address: "0x8d04a8c79cEB0889Bdd12acdF3Fa9D207eD3Ff63",
      startBlock: 16500000,
      endBlock: 16501000,
    },
  },
});
```

### Start block

The `startBlock` option specifies the block number to begin indexing from. The default is `0` – to avoid wasteful RPC requests, set `startBlock` to the contract deployment block number.

If you set `startBlock` to `"latest"`, the indexing engine will fetch the latest block on startup and use that value. This is the best way to skip the backfill and only index live blocks.

### End block

The `endBlock` option specifies the block number to stop indexing at. The default is `undefined`, which means that indexing will continue indefinitely with live blocks.

If you set `endBlock` to `"latest"`, the indexing engine will fetch the latest block on startup and use that value.

> **Tip:**   To speed up hot reloads during development, you can use `endBlock` to index a small slice of history.

## Filter by indexed parameter value

> **Warning:**   You do **not** need to keep `filter` in sync with your indexing function registrations; the build step does this automatically. Most apps should not use `filter`.

Sometimes, it's useful to filter for event logs that match specific [indexed parameter](https://docs.soliditylang.org/en/latest/contracts.html#events) values (topics).

This example filters for all `Transfer` events emitted by the USDC contract where the `from` argument matches the Binance 14 exchange address.

**ponder.config.ts**

```ts
import { createConfig } from "bponder";
import { ERC20Abi } from "./abis/ERC20";

export default createConfig({
  chains: { /* ... */ },
  contracts: {
    USDC: {
      abi: ERC20Abi,
      chain: "mainnet",
      address: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48", // USDC
      filter: {
        event: "Transfer",
        args: {
          from: "0x28c6c06298d514db089934071355e5743bf21d60", // Binance 14
        },
      },
    },
  },
});
```

**src/index.ts**

```ts
import { ponder } from "bponder:registry";

ponder.on("USDC:Transfer", async ({ event }) => {
  // This will always be "0x28c6c06298d514db089934071355e5743bf21d60"
  event.args.from;
});
```

Note that the `filter` option accepts an array of filter configurations and that each field in the `args` object accepts a single value or a list of values to match.

## Call traces

> **Note:**   Visit the [call traces](../guides/call-traces.md) guide for more information.

Use the `includeCallTraces` option to enable call trace indexing for a contract, which makes it possible to register indexing functions for every _function_ present in the contract ABI.

Call traces are **disabled** by default. 

**ponder.config.ts**

```ts
import { createConfig } from "bponder";
import { BlitmapAbi } from "./abis/Blitmap";

export default createConfig({
  chains: { /* ... */ },
  contracts: {
    Blitmap: {
      abi: BlitmapAbi,
      chain: "mainnet",
      address: "0x8d04a8c79cEB0889Bdd12acdF3Fa9D207eD3Ff63",
      includeCallTraces: true,
    },
  },
});
```

**src/index.ts**

```ts
import { ponder } from "bponder:registry";

ponder.on("Blitmap.mintOriginal()", async ({ event }) => {
  event.args;
  //    ^? [tokenData: Hex, name: string]
  event.trace.gasUsed;
  //          ^? bigint
});
```

## Transaction receipts

> **Note:**   Visit the [transaction receipts](../guides/receipts.md) guide for more information.

Use the `includeTransactionReceipts` option to fetch the transaction receipt for each event. This will make the `event.transactionReceipt` object available in all indexing functions for the contract.

Transaction receipts are **disabled** by default.

**ponder.config.ts**

```ts
import { createConfig } from "bponder";
import { BlitmapAbi } from "./abis/Blitmap";

export default createConfig({
  chains: { /* ... */ },
  contracts: {
    Blitmap: {
      abi: BlitmapAbi,
      chain: "mainnet",
      address: "0x8d04a8c79cEB0889Bdd12acdF3Fa9D207eD3Ff63",
      includeTransactionReceipts: true,
    },
  },
});
```

**src/index.ts**

```ts
import { ponder } from "bponder:registry";

ponder.on("Blitmap.mintOriginal()", async ({ event }) => {
  event.transactionReceipt.cumulativeGasUsed;
  //                       ^? bigint
  event.transactionReceipt.logs;
  //                       ^? Log[]
});
```
