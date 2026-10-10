# Fola

Core Technologies' AI employee. See [PRD.md](PRD.md).

## Packages

- `packages/policy`: the rules layer (PRD FR3). It checks every action Fola plans (SQL, git, migrations, file writes, outgoing text) against the workspace's rules before the tool gateway runs it. Rules are data (`src/seed/core-technologies.ts` holds workspace #1's seed rules); the check types in `src/checks.ts` are the only code.

- `packages/db`: Postgres schema (`migrations/`), migration runner, seed for workspace #1, and rule loading/approval. The runner refuses to run if an applied migration file was edited or deleted. Tests run on PGlite (in-process Postgres).

## Commands

```sh
pnpm install
pnpm test
pnpm typecheck

DATABASE_URL=postgres://... pnpm db:migrate   # apply pending migrations
DATABASE_URL=postgres://... pnpm db:seed      # create Core Technologies workspace + seed rules
```
