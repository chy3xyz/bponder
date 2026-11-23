# Contributing

Thanks for your interest in contributing to Ponder! Please take a moment to review this document **before submitting a pull request.**

If you want to contribute, but aren't sure where to start, reach out in Ponder's [public telegram group](https://t.me/pondersh) or create a [new discussion](https://github.com/ponder-sh/ponder/discussions).

## Get started

This guide is intended to help you get started with contributing. By following these steps, you will understand the development process and workflow.

- [Fork the repository](#fork-the-repository)
- [Install Bun](#install-bun)
- [Install Foundry](#install-foundry)
- [Install dependencies](#install-dependencies)
- [Build packages](#build-packages)
- [Run the test suite](#run-the-test-suite)
- [Write documentation](#write-documentation)
- [Submit a pull request](#submit-a-pull-request)
- [Versioning and releases](#versioning-and-releases)
- [That's it!](#thats-it)

<br>

---

<br>

## Fork the repository

To start contributing to the project, [create a fork](https://github.com/ponder-sh/ponder/fork) and clone it to your machine using `git clone`.

Or, use the [GitHub CLI](https://cli.github.com) to create a fork and clone it in one command:

```bash
gh repo fork ponder-sh/ponder --clone
```

<div align="right">
  <a href="#get-started">&uarr; back to top</a></b>
</div>

## Install Bun

**bponder** uses [Bun workspaces](https://bun.com/docs/pm/workspaces) for the monorepo and Bun as the only supported runtime. Install **Bun 1.4.0 or higher**.

```bash
bun --version
```

Install Bun from the [official site](https://bun.sh).

<div align="right">
  <a href="#get-started">&uarr; back to top</a></b>
</div>

## Install Foundry

Ponder uses [Foundry](https://getfoundry.sh/) for testing. The test suite uses local [Anvil](https://github.com/foundry-rs/foundry/tree/master/anvil) instances via [Anvil.js](https://github.com/wevm/anvil.js) to run isolated, concurrent tests against forks of Ethereum mainnet.

Install Foundry (and Anvil) using the following command:

```bash
curl -L https://foundry.paradigm.xyz | bash
```

<div align="right">
  <a href="#get-started">&uarr; back to top</a></b>
</div>

## Install dependencies

In the root directory, run the following command to install the project's dependencies:

```bash
bun install --frozen-lockfile
```

<div align="right">
  <a href="#get-started">&uarr; back to top</a></b>
</div>

## Build packages

In the root directory, run the build command:

```bash
bun run build
```

After the build completes, Bun links workspace packages (`packages/*`, `benchmark`, `simulation-test`) for development. `examples/` is **outside** the workspace graph (keeps root installs lean); each example uses `file:` deps into `packages/*`, so run `bun install` inside an example directory when you need it.

<div align="right">
  <a href="#get-started">&uarr; back to top</a></b>
</div>

## Run the test suite

### Running tests

The test suite uses [vitest](https://vitest.dev/guide) in concurrent mode as a test runner.

Herea are some commands to get you started.

```bash
# Run Bun tests for core (preferred)
bun run --filter ponder test:bun

# Focused file
CI=1 bun test packages/core/src/path.test.ts
```

When adding new features or fixing bugs, it's important to add test cases to cover any new or updated behavior.

### Run tests against Postgres

By default, the test suite runs against in-memory PGlite databases which mimic Ponder development environments. Unless you are specifically testing Postgres behavior, you don't need to run tests against Postgres locally and can instead rely on CI to catch any regressions.

To run the test suite against Postgres, set the `DATABASE_URL` env var in `packages/core/.env.local`.

```bash
DATABASE_URL=postgres://{username}@localhost:5432/{username}
```

Any test-friendly Postgres server will do. MacOS users can download [Postgres.app](https://postgresapp.com/documentation/), a simple way to get a Postgres server running on your local machine.

<div align="right">
  <a href="#get-started">&uarr; back to top</a></b>
</div>

## Write documentation

Docs are plain Markdown under [`docs/`](../docs) (see [`docs/README.md`](../docs/README.md)). There is no Vocs / docs website build — edit `.md` files directly and link relatively.

<div align="right">
  <a href="#get-started">&uarr; back to top</a></b>
</div>

## Submit a pull request

When you're ready to submit a pull request, follow these naming conventions:

- Pull request titles use the [imperative mood](https://en.wikipedia.org/wiki/Imperative_mood) (e.g., `Add something`, `Fix something`).
- [Changesets](#versioning) use past tense verbs (e.g., `Added something`, `Fixed something`).

When you submit a pull request, a GitHub Action will automatically lint, build, and test your changes. If you see an ❌, it's most likely a problem with your code. Inspect the logs through the GitHub Actions UI to find the cause.

<div align="right">
  <a href="#get-started">&uarr; back to top</a></b>
</div>

## Versioning and releases

bponder uses [changesets](https://github.com/changesets/changesets) to manage package versioning and npm releases. CI publishes with [npm Trusted Publishing (OIDC)](https://docs.npmjs.com/trusted-publishers/) from `.github/workflows/release.yml` — no long-lived `NPM_TOKEN`. See [Publishing to npm](../docs/guides/npm-publish.md).

### Changesets workflow

1. Write a PR that includes a public API change or bug fix.
2. Create a changeset using `bunx changeset`. Affected packages are typically `bponder`, `create-bponder`, `bponder-client`, or `bponder-react` (patch / minor / major).
3. The changesets CLI will generate a Markdown file in `.changeset/`. Commit it to your PR branch (e.g. `git commit -m "chore: changeset"`).
4. When you push this commit to remote, a GitHub bot will detect the changeset and add a comment to your PR with a preview of the changelog.
5. Merge your PR. The version workflow opens (or updates) a PR titled `"chore: version packages"`. Changes are **not** released until that PR is merged.

### Prereleases

To cut a pre-merge snapshot, create a changeset then run **Actions → Release** on your branch (`workflow_dispatch`). That publishes a [snapshot](https://github.com/changesets/changesets/blob/main/docs/snapshot-releases.md) tag via OIDC (Trusted Publisher must already be configured).

### Releases

Merge the `"chore: version packages"` PR into `main`. The Release workflow builds packages and runs `changeset publish` with OIDC. Each npm package must have Trusted Publisher set to workflow `release.yml` and GitHub environment `npm`.

<div align="right">
  <a href="#get-started">&uarr; back to top</a></b>
</div>

## That's it!

If you still have questions, please reach out in Ponder's [public Telegram chat](https://t.me/pondersh) or create a [new discussion](https://github.com/ponder-sh/ponder/discussions).

This guide was adapted from [viem](https://github.com/wagmi-dev/viem/blob/main/.github/CONTRIBUTING.md)'s contribution guide. ❤️
