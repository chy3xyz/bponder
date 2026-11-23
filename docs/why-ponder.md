# Why Ponder

Notes on why we built Ponder

**Ponder is an open-source framework for custom Ethereum indexing.**

With Ponder, you can rapidly build & deploy an API that serves custom data from smart contracts on any EVM blockchain.

## Most apps need a backend

Many developers have quietly accepted that you need traditional backend web services to build great crypto apps – particularly for indexing.

The standard RPC, subgraphs, and out-of-the-box API endpoints are great for getting started, but fall short as applications mature and new requirements appear. When this happens, developers often roll their own web backend, which gives them the flexibility to write custom server-side code.

Unfortunately, engineering teams across the industry reinvent the wheel on common problems (reorgs, RPC error handling, etc) in closed-source repositories where best practices remain siloed.

We built Ponder because **this is a framework-shaped problem**.

## Local development

It’s so hard to run a subgraph locally that devs often deploy to the hosted service just to run their code. This creates long feedback loops and errors that are painful to debug.

Ponder is designed from the ground up for local development. The dev server has hot reloading for every file in your project and descriptive error logs that keep you unblocked.

Ponder’s type safety and editor autocomplete is very thorough, and works without any codegen or build step. If your code passes the type checker, it will usually run without error.

## Focus on web developers

Ponder is built for web & mobile application developers. If you understand the basics of Ethereum and can write some TypeScript, you’ll be productive with Ponder in a matter of minutes. (So, data analysts, protocol developers, and researchers can use Ponder too.)

Your code runs in [Bun](https://bun.sh), a JavaScript runtime, where you can import NPM packages, make HTTP requests, and connect to databases. This makes it easy to do things that are painful in constrained environments like WebAssembly sandboxes, SQL engines, and EVM runtimes. Ponder is Bun-native — Node.js is not a supported runtime.

## Performance

Long feedback loops are the kiss of death for developer productivity, and unfortunately they're commonplace in blockchain indexing tools.

Ponder is fast and lean. In our initial benchmarks, Ponder indexed an ERC20 contract ~10x faster than the Graph Node from a cold start and 15x faster fully cached.

Ponder also used fewer resources — 35x less disk space and 35% fewer RPC credits.

## Get started

- [Quickstart](./get-started.md)
- [GitHub repo ↗](https://github.com/chy3xyz/bponder)
- [Telegram chat ↗](https://t.me/pondersh)
- [X (Twitter) ↗](https://x.com/ponder_sh)