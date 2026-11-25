# Publishing to npm

Trusted Publishing / OIDC

bponder publishes from GitHub Actions with [npm Trusted Publishing](https://docs.npmjs.com/trusted-publishers/) (OIDC). CI does **not** need a long-lived `NPM_TOKEN`.

## Packages

| Package | Directory |
| --- | --- |
| `bponder` | `packages/core` |
| `bponder-client` | `packages/client` |
| `bponder-react` | `packages/react` |
| `bponder-utils` | `packages/utils` |
| `bponder-schema` | `packages/schema` |
| `create-bponder` | `packages/create-bponder` |

## One-time setup

### 1. First version must exist on npm

Trusted Publisher attaches to an **existing** package. Publish `0.18.9` (or any first version) once from a trusted machine:

```bash
bun run build
# after browser / OTP auth as needed:
(cd packages/utils && npm publish --access public)
(cd packages/schema && npm publish --access public)
(cd packages/client && npm publish --access public)
(cd packages/react && npm publish --access public)
(cd packages/core && npm publish --access public)
(cd packages/create-bponder && npm publish --access public)
```

### 2. Configure Trusted Publisher (each package)

On npmjs.com → package → **Settings → Trusted Publisher → GitHub Actions**:

| Field | Value |
| --- | --- |
| Organization or user | `chy3xyz` |
| Repository | `bponder` |
| Workflow filename | `release.yml` |
| Environment name | `npm` |
| Allowed actions | Allow **npm publish** |

Do this for every package in the table above. Complete a successful CI publish within **2 days** of creating each Trusted Publisher config.

### 3. GitHub Environment

Repo **Settings → Environments → `npm`** (matches `environment: npm` in `.github/workflows/release.yml`). Optional: required reviewers.

## Ongoing releases

1. Land PRs with changesets (`bunx changeset`).
2. Merge the `chore: version packages` PR from Changesets.
3. Push to `main` (or run **Actions → Release → Run workflow**) runs `.github/workflows/release.yml`, which builds and runs `changeset publish` over OIDC.
4. When `bponder` is published, the same workflow calls **Release binaries**, which cross-compiles `bun build --compile` artifacts, zips them, and attaches them to a `vX.Y.Z` GitHub Release for [`install.sh`](https://github.com/chy3xyz/bponder/blob/main/install.sh).

Manual binary-only release: **Actions → Release binaries**, or push a `v*` tag.

Install the CLI from a Release:

```bash
curl -fsSL https://raw.githubusercontent.com/chy3xyz/bponder/main/install.sh | bash
# pin: BPONDER_VERSION=0.18.9 bash
```

Snapshot publishes use the same npm workflow on non-`main` refs (`workflow_dispatch` from a branch) and do **not** upload binaries.

## Troubleshooting

- **ENEEDAUTH / Unable to authenticate**: Trusted Publisher fields must match exactly (including `release.yml` and environment `npm`). Use GitHub-hosted runners only.
- **`E404 Not Found` on `PUT https://registry.npmjs.org/<pkg>` during CI**: Almost always means the job published **without** a valid OIDC trusted-publisher grant (npm returns 404 instead of 401). Check each package’s Trusted Publisher row still lists `chy3xyz/bponder`, workflow `release.yml`, environment `npm`, and that the config was created/refreshed within npm’s validity window. Confirm GitHub Environment `npm` exists. Do not set `NPM_TOKEN` / `NODE_AUTH_TOKEN` on the Release job.
- **`Cannot publish over previously staged version`**: A prior publish reserved the version but never went public. Prefer `npm stage list` / npmjs.com **Staged Packages** approval, or bump the version (do not keep republishing the same staged version). Local OTP/web publish can also stage; wait a few minutes and re-check `npm view <pkg> version` before bumping.
- **Package not found on Trusted Publisher UI**: Finish the first manual publish first.
- Do **not** set `NPM_TOKEN` / `NODE_AUTH_TOKEN` in the Release job if you want OIDC; a write token can force the OTP/token path instead.
- **Fallback**: maintainers can still publish from a trusted machine with `npm login --auth-type=web` then `bunx changeset publish` after `bun run build` (preferred). Raw `npm publish` from a package directory also runs `prepack` / `postpack` scripts that rewrite `workspace:*` to concrete versions. Prefer fixing Trusted Publisher so CI remains the default.
- **`workspace:*` in a published manifest**: Should not happen after 1.0.6 (`prepack` rewrite + `scripts/assert-npm-tarball.mjs` in Release CI). If it does, reject/yank and republish with `changeset publish`.
