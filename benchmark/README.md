# Benchmarks

## Usage

### Setup environment

Create an `env.local` file using `.env.example` as a template. The `DATABASE_URL` should not include a database (i.e. `postgres://kylescott@localhost:5432`).

Create the database objects for an app.

```bash
bun run create:app [app id]
```

### Run benchmark

```bash
bun run benchmark [app id]
```

CLI flags are supported and passed through to Ponder.

```bash
bun run benchmark [app id] -- -v
```
