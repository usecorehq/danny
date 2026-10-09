# Danny

Core Technologies' AI employee. See [PRD.md](PRD.md).

## Packages

- `packages/policy`: the rules layer (PRD FR3). It checks every action Danny plans (SQL, git, migrations, file writes, outgoing text) against the workspace's rules before the tool gateway runs it. Rules are data (`src/seed/core-technologies.ts` holds workspace #1's seed rules); the check types in `src/checks.ts` are the only code.

## Commands

```sh
pnpm install
pnpm test
pnpm typecheck
```
